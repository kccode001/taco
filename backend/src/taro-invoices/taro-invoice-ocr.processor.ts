import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { TaroInvoice, TaroInvoiceStatus } from '../database/entities/taro-invoice.entity';
import { TaroInvoiceLineItem } from '../database/entities/taro-invoice-line-item.entity';
import { Region } from '../database/entities/region.entity';
import { TaroMappingRule } from '../database/entities/taro-mapping-rule.entity';
import { QUEUE_TARO_OCR } from './taro-invoices.constants';
import { mediaTypeFor, ImageMediaType } from '../invoices/ocr-utils';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { topKPrecomputed } from '../embeddings/similarity';
import { SkuEmbeddingCache, CachedSku } from '../embeddings/sku-embedding-cache.service';
import {
  buildCodeIndex,
  findExactSkuCode,
  ExactCodeMatch,
} from './sku-code-matcher';

interface TaroOcrLineItem {
  /**
   * The product description, ALREADY EXPANDED if the handwritten line used
   * ditto marks ("--", "—", "do.", "sda", "''"). Used by RAG + SKU matching.
   */
  raw_text: string;
  /**
   * The handwritten form as it appears on the page (e.g. "20 -- 1/2 …").
   * Only present when the row used a ditto mark — otherwise null.
   */
  original_text?: string | null;
  suggested_sku_code: string | null;
  confidence_score: number;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total_price: number;
}

interface TaroOcrResponse {
  supplier_name: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  line_items: TaroOcrLineItem[];
}

const OCR_MODEL = 'claude-sonnet-4-6';
const CONFIDENCE_THRESHOLD = 0.85;
const RAG_TOP_K = 10;
/** Max longer-edge px sent to Claude vision. Anything bigger is downscaled. */
const VISION_MAX_EDGE_PX = 2048;
/** Concurrency of the OCR worker — each job is dominated by ~5-15s Claude RTT. */
export const TARO_OCR_CONCURRENCY = 5;
/** Built-in retries on transient 5xx / 429 from Claude. SDK default is 2. */
const ANTHROPIC_MAX_RETRIES = 3;

/** Progress stage → 0..100 for the refresh-resilient upload view. */
const PROGRESS = {
  QUEUED: 0,
  PROCESSING: 10,
  OCR_STARTED: 20,
  OCR_DONE: 70,
  MAPPING_DONE: 90,
  DONE: 100,
} as const;

/**
 * Taro Invoices OCR worker — uses TACO SKU master (including synonyms + price band)
 * as product knowledge so Claude can suggest a SKU code per line.
 *
 * Mapping pipeline:
 *   raw row → Claude vision → suggested_sku_code → DB lookup by code → matched_sku_id
 *   needs_review = confidence < 0.85 OR no matched SKU
 *
 * Performance notes:
 *   - SKU master + embeddings are cached in-memory by SkuEmbeddingCache (loaded
 *     once on startup, refreshed on SKU CRUD). Previously every job re-loaded
 *     965 rows from DB and JSON.parse'd 965 × 3072-dim vectors per line item.
 *   - Images are downscaled to a 2048px longer edge before being sent to
 *     Claude vision — large phone uploads were adding 5-10s per call.
 *   - BullMQ concurrency bumped to 5 (each invoice is ~5-15s Claude RTT, so
 *     a single worker thread was serializing everything).
 */
@Processor(QUEUE_TARO_OCR)
export class TaroInvoiceOcrProcessor {
  private readonly logger = new Logger(TaroInvoiceOcrProcessor.name);
  private readonly anthropic: Anthropic;

  constructor(
    @InjectRepository(TaroInvoice)
    private readonly invoicesRepo: Repository<TaroInvoice>,
    @InjectRepository(TaroInvoiceLineItem)
    private readonly lineItemsRepo: Repository<TaroInvoiceLineItem>,
    @InjectRepository(Region)
    private readonly regionsRepo: Repository<Region>,
    @InjectRepository(TaroMappingRule)
    private readonly mappingRulesRepo: Repository<TaroMappingRule>,
    private readonly embeddings: EmbeddingsService,
    private readonly skuCache: SkuEmbeddingCache,
  ) {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: ANTHROPIC_MAX_RETRIES,
    });
  }

  @Process({ name: 'process-taro-invoice', concurrency: TARO_OCR_CONCURRENCY })
  async handle(job: Job<{ invoiceId: string; imagePath: string }>): Promise<void> {
    const { invoiceId, imagePath } = job.data;
    const t0 = Date.now();
    const invoice = await this.invoicesRepo.findOne({ where: { id: invoiceId } });
    if (!invoice) {
      this.logger.warn(`TaroInvoice ${invoiceId} not found — skipping OCR.`);
      return;
    }

    try {
      await this.invoicesRepo.update(invoiceId, {
        status: TaroInvoiceStatus.PROCESSING,
        progress_percent: PROGRESS.PROCESSING,
      });

      const skuMaster = await this.skuCache.getAll();

      const region = invoice.region_id
        ? await this.regionsRepo.findOne({ where: { id: invoice.region_id } })
        : null;

      const mappingRules = await this.mappingRulesRepo.find({
        where: { active: true },
        order: { created_at: 'DESC' },
        take: 20,
      });

      await this.invoicesRepo.update(invoiceId, { progress_percent: PROGRESS.OCR_STARTED });

      // ---- RAG step 1: cheap OCR pass to extract raw_text ----
      const tVision = Date.now();
      const parsed = await this.extractWithVision(imagePath, skuMaster, region, mappingRules);
      const visionMs = Date.now() - tVision;

      await this.invoicesRepo.update(invoiceId, { progress_percent: PROGRESS.OCR_DONE });

      // ---- RAG step 2: re-score each line via embeddings ----
      const codeToId = new Map<string, string>();
      for (const sku of skuMaster) codeToId.set(this.normalizeCode(sku.code), sku.id);

      const tRag = Date.now();
      const ragHits = await this.ragRescore(parsed.line_items, skuMaster);
      const ragMs = Date.now() - tRag;

      // SKU lookup-by-id used by the unit_price/total_price repair below.
      const skuById = new Map<string, CachedSku>();
      for (const sku of skuMaster) skuById.set(sku.id, sku);

      // Prebuilt index for deterministic code/alias matching — runs BEFORE
      // we trust Claude's pick. Catches the "HPL TH. 053 AA → TH 043 AA"
      // hallucination class, where the printed code is in the catalog but
      // Claude picked a similar-looking wrong one (because the RAG candidate
      // pool didn't include the right SKU).
      const exactIndex = buildCodeIndex(
        skuMaster.map((s) => ({
          id: s.id,
          code: s.code,
          product_name_aliases: s.product_name_aliases,
        })),
      );

      const entities: Partial<TaroInvoiceLineItem>[] = parsed.line_items.map((li, idx) => {
        const modelMatchedId = li.suggested_sku_code
          ? codeToId.get(this.normalizeCode(li.suggested_sku_code)) ?? null
          : null;
        const topRag = ragHits[idx]?.[0] ?? null;

        // Exact-code pre-pass (Fix 1) — wins over both Claude and RAG when
        // the raw_text contains a verbatim SKU code or alias.
        const exact: ExactCodeMatch | null = findExactSkuCode(li.raw_text ?? '', exactIndex);

        let matchedId = modelMatchedId;
        let confidence = Math.max(0, Math.min(1, li.confidence_score ?? 0));
        let failure_reason: string | null = null;

        if (exact) {
          // If exact disagrees with Claude, prefer exact. Log so we can audit
          // the model's miss-rate over time.
          if (modelMatchedId && modelMatchedId !== exact.sku_id) {
            const modelSku = skuById.get(modelMatchedId);
            const exactSku = skuById.get(exact.sku_id);
            this.logger.warn(
              `Exact-code override on line ${idx + 1}: raw="${li.raw_text?.slice(0, 80)}" ` +
                `model→${modelSku?.code ?? '(unknown)'} exact→${exactSku?.code ?? '(unknown)'} ` +
                `via=${exact.matched_via}`,
            );
          }
          matchedId = exact.sku_id;
          confidence = exact.confidence;
        } else if (!matchedId && topRag && topRag.score >= 0.55) {
          // If the model didn't pick anything but RAG is very confident, promote.
          matchedId = topRag.item.id;
          confidence = Math.min(confidence || 0.6, CONFIDENCE_THRESHOLD - 0.05);
        }

        // Fix 4 — surface unmapped TACO references so the OCR Gagal page +
        // recommendation pipeline can prioritise catalog gaps. Fires when:
        //  - we have NO match at all and the row references a TACO product, OR
        //  - we matched something but confidence is below threshold AND the row
        //    references a TACO product (catches the "TH 098 AA → wrong-guess
        //    at 0.2 conf" failure mode where Claude refuses to return null).
        if (
          this.looksLikeTacoReference(li.raw_text ?? '') &&
          (!matchedId || confidence < CONFIDENCE_THRESHOLD)
        ) {
          failure_reason = 'likely_taco_unmapped';
        }

        // Repair the common Claude failure mode where the printed unit_price is
        // returned as total_price and unit_price is back-computed as total/qty.
        // Detection: qty > 1 and the stored unit_price sits BELOW the SKU's
        // min_price band while the stored total_price sits INSIDE the band —
        // i.e. the values are swapped relative to the catalog.
        const repaired = this.repairUnitPriceSwap(
          li.quantity ?? 0,
          li.unit_price ?? 0,
          li.total_price ?? 0,
          matchedId ? skuById.get(matchedId) ?? null : null,
        );

        // Normalise the ditto fields: only persist `original_text` when it
        // actually differs from the expanded `raw_text`. Claude has been
        // observed to populate both with the same value for non-ditto rows.
        const rawText = (li.raw_text ?? '').trim();
        const originalRaw = (li.original_text ?? '').trim();
        const originalText =
          originalRaw && originalRaw !== rawText ? originalRaw : null;

        return {
          invoice_id: invoiceId,
          line_no: idx + 1,
          raw_text: rawText,
          original_text: originalText,
          matched_sku_id: matchedId,
          confidence_score: confidence.toFixed(3),
          needs_review: confidence < CONFIDENCE_THRESHOLD || !matchedId,
          quantity: String(li.quantity ?? 0),
          unit: li.unit ?? null,
          unit_price: String(repaired.unit_price),
          total_price: String(repaired.total_price),
          edited: false,
          failure_reason,
        };
      });

      if (entities.length > 0) {
        await this.lineItemsRepo.save(entities);
      }

      await this.invoicesRepo.update(invoiceId, { progress_percent: PROGRESS.MAPPING_DONE });

      await this.invoicesRepo.update(invoiceId, {
        status: TaroInvoiceStatus.DONE,
        progress_percent: PROGRESS.DONE,
        supplier_name: parsed.supplier_name ?? invoice.supplier_name,
        invoice_date: parsed.invoice_date ?? invoice.invoice_date,
        total_amount: parsed.total_amount != null ? String(parsed.total_amount) : invoice.total_amount,
      });

      const totalMs = Date.now() - t0;
      this.logger.log(
        `Taro OCR ${invoiceId} done in ${totalMs}ms (vision=${visionMs}ms, rag=${ragMs}ms, lines=${entities.length})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Taro OCR failed for ${invoiceId}: ${message}`);
      await this.invoicesRepo.update(invoiceId, {
        status: TaroInvoiceStatus.FAILED,
        error_message: message,
      });
    }
  }

  /**
   * RAG re-score helper. For each line item, embeds the raw_text + the
   * model's suggested code (if any), then returns the top-K matching SKUs.
   *
   * The candidate pool comes from the cached SKU master with pre-parsed
   * vectors + pre-computed norms (see SkuEmbeddingCache + topKPrecomputed) so
   * we no longer JSON.parse 965 × 3072-dim arrays per line item.
   */
  private async ragRescore(
    lineItems: TaroOcrLineItem[],
    skuMaster: CachedSku[],
  ): Promise<Array<Array<{ item: CachedSku; score: number }>>> {
    const usable = skuMaster.filter((s) => s.vec !== null);
    if (usable.length === 0) return lineItems.map(() => []);

    // Embed all line texts in parallel — OpenAI handles concurrency well and
    // network RTT (200-400ms each) dominates, so serializing was a free loss.
    const texts = lineItems.map((li) => {
      return [li.raw_text, li.suggested_sku_code, li.unit]
        .filter(Boolean)
        .join(' ')
        .trim();
    });

    const vectors = await Promise.all(
      texts.map(async (text) => {
        if (!text) return null;
        try {
          return await this.embeddings.embed(text);
        } catch (e) {
          this.logger.warn(
            `RAG embed failed for "${text.slice(0, 60)}": ${(e as Error).message}`,
          );
          return null;
        }
      }),
    );

    const results: Array<Array<{ item: CachedSku; score: number }>> = [];
    for (const vec of vectors) {
      if (!vec) {
        results.push([]);
        continue;
      }
      let qn = 0;
      for (let i = 0; i < vec.length; i++) qn += vec[i] * vec[i];
      qn = Math.sqrt(qn);
      results.push(topKPrecomputed(vec, qn, usable, RAG_TOP_K));
    }
    return results;
  }

  private normalizeCode(code: string): string {
    return code.toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
  }

  /**
   * Cheap heuristic that flags a raw OCR line as "probably referencing a TACO
   * product" — used to tag `failure_reason='likely_taco_unmapped'` so KC can
   * see catalog gaps in the OCR Gagal page + recommendations queue.
   *
   * Signals (any one is enough):
   *   - literal substring "taco" (case-insensitive);
   *   - common Indonesian TACO category words: engsel (hinge), rel (drawer
   *     rail), lem (glue), skrup/sekrup (screw), mata router (router bit),
   *     buc/bucket (glue tin sized), HPL (laminate);
   *   - a code-shaped token that LOOKS like a TACO SKU prefix (TH/TS/TE/TI/
   *     ET/FWP/FDB/BBS/TL/...) followed by 2-4 char tail.
   */
  private looksLikeTacoReference(raw: string): boolean {
    if (!raw) return false;
    const s = raw.toLowerCase();
    if (s.includes('taco')) return true;
    const KEYWORDS = [
      'engsel', 'engsel.', 'engsell',
      'rel ', 'rel.', // " rel " with trailing space avoids "barrel"
      'lem ', 'lem.',
      'skrup', 'sekrup', 'sekerup',
      'mata router', 'router roda', 'router brasa',
      'buc lem', 'buc.lem', 'lem activ', 'lem-activ',
      'hpl ', 'hpl.',
      'edging', 'tepi laminate',
    ];
    for (const k of KEYWORDS) {
      if (s.includes(k)) return true;
    }
    // Code-shaped token sniff (e.g. "TH 053 AA", "ET 06/A", "FDB 8301 E").
    if (/\b(TH|TS|TE|TI|TV|TP|TL|TPS|TPT|TPU|TGS|TSD|TBP|TRL|TAS|TPS|ET|BBS|US|RLT|FDB|FWP|FBT|FBL|FCS)[\.\s]*[A-Z0-9\/-]{2,8}\b/i.test(raw)) {
      return true;
    }
    return false;
  }

  /**
   * Detect + fix the Claude OCR failure mode where it returns the printed
   * unit price as `total_price` and divides by qty to populate `unit_price`.
   *
   * Triggered when:
   *   - quantity > 1 (single-unit rows are ambiguous either way)
   *   - the matched SKU has a usable price band (min/max > 0)
   *   - the stored unit_price is BELOW min_price (likely back-computed)
   *   - the stored total_price sits INSIDE the SKU's price band (the swap)
   *
   * On repair: unit_price becomes the original total_price; total_price is
   * recomputed as qty × new unit_price.
   *
   * Falls through unchanged when no matched SKU, no usable band, or the
   * stored values already line up with the band.
   */
  private repairUnitPriceSwap(
    quantity: number,
    unitPrice: number,
    totalPrice: number,
    sku: CachedSku | null,
  ): { unit_price: number; total_price: number } {
    const qty = Number(quantity) || 0;
    let up = Number(unitPrice) || 0;
    let tp = Number(totalPrice) || 0;

    if (qty <= 1 || up <= 0 || tp <= 0) {
      // Backfill total_price if Claude omitted it (preserves previous behaviour).
      if (tp <= 0 && qty > 0 && up > 0) tp = qty * up;
      return { unit_price: up, total_price: tp };
    }

    const minPrice = Number(sku?.min_price ?? 0);
    const maxPrice = Number(sku?.max_price ?? 0);
    const hasBand = minPrice > 0 && maxPrice > 0 && maxPrice >= minPrice;
    if (!hasBand) return { unit_price: up, total_price: tp };

    // Allow a 25% slack on each end of the band so legitimate edge-of-band
    // prices don't get rewritten. The swap signature is very strong (printed
    // unit price is *qty* times bigger than the back-computed value) so a
    // loose band check is enough.
    const bandLo = minPrice * 0.75;
    const bandHi = maxPrice * 1.25;
    const inBand = (v: number) => v >= bandLo && v <= bandHi;

    const looksSwapped = !inBand(up) && inBand(tp) && up < minPrice;
    if (looksSwapped) {
      this.logger.warn(
        `Repaired swapped unit_price for SKU ${sku?.code}: up ${up}→${tp}, tp ${tp}→${qty * tp} (qty=${qty}, band=${minPrice}-${maxPrice})`,
      );
      const newUp = tp;
      const newTp = qty * newUp;
      up = newUp;
      tp = newTp;
    }

    return { unit_price: up, total_price: tp };
  }

  /**
   * Read the upload, downscale if it's bigger than VISION_MAX_EDGE_PX on the
   * longer edge, and return base64 + media type for the Claude payload.
   * Falls back to the raw bytes if sharp can't decode (e.g. PDF — though
   * those don't reach this path today; mediaTypeFor only accepts images).
   */
  private async prepareImage(imagePath: string): Promise<{
    base64: string;
    mediaType: ImageMediaType;
    originalBytes: number;
    sentBytes: number;
    downscaled: boolean;
  }> {
    const buf = fs.readFileSync(imagePath);
    const originalBytes = buf.byteLength;
    const ext = path.extname(imagePath).toLowerCase();

    // Skip resize for tiny files where the overhead isn't worth it.
    if (originalBytes < 256 * 1024) {
      return {
        base64: buf.toString('base64'),
        mediaType: mediaTypeFor(imagePath),
        originalBytes,
        sentBytes: originalBytes,
        downscaled: false,
      };
    }

    try {
      const img = sharp(buf, { failOn: 'none' }).rotate(); // honour EXIF orientation
      const meta = await img.metadata();
      const longerEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longerEdge <= VISION_MAX_EDGE_PX) {
        return {
          base64: buf.toString('base64'),
          mediaType: mediaTypeFor(imagePath),
          originalBytes,
          sentBytes: originalBytes,
          downscaled: false,
        };
      }

      // Re-encode as JPEG with quality 85 — even PNG screenshots get smaller
      // and Claude vision treats them identically for OCR.
      const resized = await img
        .resize({
          width: meta.width && meta.width >= (meta.height ?? 0) ? VISION_MAX_EDGE_PX : undefined,
          height: meta.height && meta.height > (meta.width ?? 0) ? VISION_MAX_EDGE_PX : undefined,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
      // Preserve animated GIF fallback by only swapping to jpeg for static raster.
      const mediaType: ImageMediaType =
        ext === '.gif' ? 'image/gif' : 'image/jpeg';
      return {
        base64: resized.toString('base64'),
        mediaType,
        originalBytes,
        sentBytes: resized.byteLength,
        downscaled: true,
      };
    } catch (e) {
      this.logger.warn(
        `Image resize failed for ${imagePath} (${(e as Error).message}) — sending original.`,
      );
      return {
        base64: buf.toString('base64'),
        mediaType: mediaTypeFor(imagePath),
        originalBytes,
        sentBytes: originalBytes,
        downscaled: false,
      };
    }
  }

  private async extractWithVision(
    imagePath: string,
    skuMaster: CachedSku[],
    region: Region | null,
    mappingRules: TaroMappingRule[],
  ): Promise<TaroOcrResponse> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const { base64, mediaType, originalBytes, sentBytes, downscaled } =
      await this.prepareImage(imagePath);

    if (downscaled) {
      this.logger.log(
        `Resized vision payload ${imagePath.split('/').pop()}: ${originalBytes}B → ${sentBytes}B`,
      );
    }

    // Send the FULL SKU master (not a top-K subset). Previous top-40 / top-200
    // candidate selection — even with a wider K — left the correct SKU outside
    // Claude's view for ~50% of HPL rows (the 435-SKU laminate family alone
    // saturates any reasonable K). With Anthropic prompt caching the catalog
    // block is paid once per ~5 min cache window and reused across invoices,
    // so the per-call marginal cost is small while accuracy climbs because the
    // right answer is always visible.
    const promptSkus = skuMaster;

    // Compress the SKU master into a token-efficient text block.
    // Format: CODE | name | category | unit | min-max (avg) | aliases (truncated)
    const skuLines = promptSkus.map((s) => {
      const aliases = (s.product_name_aliases ?? []).slice(0, 6).join(', ');
      const units = (s.unit_aliases ?? []).slice(0, 4).join(', ');
      return `${s.code} | ${s.name} | ${s.catalog_category ?? '-'} | unit ${s.unit ?? '-'} (${units}) | ${s.min_price}-${s.max_price} (${s.avg_price}) | ${aliases}`;
    });

    const skuContext = skuLines.join('\n');
    const regionLine = region
      ? `Invoice from region: ${region.display_path}.`
      : 'Invoice region: not specified.';
    const ruleLines = mappingRules.length > 0
      ? ['Mapping rules learned from prior corrections:',
         ...mappingRules.map((r) => `  - ${r.rule_text}`)].join('\n')
      : '';

    // Static block — cached across all invoices (until SKU master / rules change).
    const staticPromptLines = [
      'You are an invoice OCR system for TACO, an Indonesian building-materials brand.',
      'You receive scanned/photo invoices from suppliers (Bahasa Indonesia).',
      'Use the TACO SKU candidates below as product knowledge — match each invoice row to ONE SKU by code.',
      'VISION-INFORMED MATCHING — the invoice text I extract from each line is UNRELIABLE because the page is handwritten/printed in Bahasa Indonesia. Characters get misread (8↔0, 5↔3, 9↔4, 1↔7, 6↔0; l↔t, m↔n, c↔e, B↔R). For every line item LOOK AT THE ORIGINAL IMAGE to verify the SKU code and product name. The text in `raw_text` is a starting hint, NOT ground truth — the image is the arbiter.',
      'TIERED CONFIDENCE (use these bands when scoring suggested_sku_code):',
      '  - 0.90–0.95  EXACT — SKU code (or a verbatim alias) appears in the line AND the image clearly confirms it. Example: image shows "TH 053 AA", candidate is TH 053 AA → 0.93.',
      '  - 0.75–0.89  HIGH-CONFIDENCE FUZZY — OCR has minor errors (missing space, period vs space, single confusable character) AND the image visibly confirms the catalog code. Example: image shows "TIX 0141" with no space, candidate is TI X0141 VA → 0.85. Example: text says "TH 098 AA" but the image clearly shows "TH 048 AA", candidate is TH 048 AA → 0.78.',
      '  - 0.55–0.74  LIKELY — OCR has multiple errors but the visible product type + partial code + price band + category convincingly match the candidate. Use when you are reasonably sure but not certain.',
      '  - 0.40–0.54  UNCERTAIN — a plausible candidate exists but evidence is weak. The reviewer will double-check.',
      '  - null + confidence ≤ 0.30  NO MATCH — no catalog candidate is a reasonable fit. Still return the line with raw_text so the catalog gap can be analyzed.',
      'FUZZY-MATCH HEURISTICS — common handwritten OCR errors that DO warrant a fuzzy match when the image confirms:',
      '  - Missing/extra space between letters and digits: "TIX0141" ≡ "TI X0141"; "TH053" ≡ "TH 053".',
      '  - Period vs space vs nothing: "TH. 053 AA" ≡ "TH 053 AA"; "ET.06/A" ≡ "ET 06/A".',
      '  - Confusable digits: 0↔8, 5↔3, 9↔4, 1↔7, 6↔0. If image shows "048" but my text says "098", trust the image.',
      '  - Confusable letters: l↔t, m↔n, c↔e, B↔R.',
      '  - Indonesian words near-misses: "Lem" (glue) may be misread as "Let" / "Len" / "Lern".',
      '  - When extracted text is ONE such typo away from a catalog code AND the image visually matches the candidate\'s product category, propose the match at 0.75+.',
      'ANTI-HALLUCINATION GUARDRAIL — DO NOT propose a match if ANY of these holds:',
      '  - The extracted text shares no meaningful characters with the candidate code/alias (e.g. "Lem Taco Activ" must NOT map to a random hardware SKU just to fill the slot).',
      '  - The image clearly shows a different product type than the candidate.',
      '  - Only weak digit similarity exists with NO category/alias/visual alignment.',
      '  - You are guessing from "similar-looking" codes without image confirmation. The previous failure mode was "TH 053 AA → TH 1250 FA" — that kind of leap must never come back. If you can\'t see the code clearly AND the surrounding evidence is weak, RETURN null.',
      '  Better to return null than wrong. But do NOT refuse when the evidence (image + partial OCR + category + price band) reasonably points to a single candidate.',
      'CATALOG-GAP CASES — when the row mentions a TACO product family (Engsel/Hinge, Rel/Drawer Slide, HPL/Laminate, Edging, Plywood, Lem/Glue, Skrup/Screw) but NO candidate is a credible match even with image evidence, return suggested_sku_code = null with confidence ≤ 0.30. The line will be flagged as `likely_taco_unmapped` so the catalog gap surfaces.',
      'DITTO MARKS — Indonesian handwritten invoices reuse the previous row\'s product description with marks like "--", "—", "do.", "sda" (sama dengan atas = same as above), or "\'\'". When a line uses ditto marks, the product is the SAME as the previous line — only the variant / size / spec on that line differs.',
      '  - Set `raw_text` to the EXPANDED product description (substitute the previous line\'s product noun in place of the ditto).',
      '    Example: prev "45 Engsel Taco Lurus 16.000 720.000" + curr "20 -- 1/2 16.000 320.000" → raw_text = "20 Engsel Taco 1/2 16.000 320.000".',
      '    Example: prev "2 Bvs Skrup 4cm 110.000 220.000" + curr "2 Bvs -- 3cm 95.000 190.000" → raw_text = "2 Bvs Skrup 3cm 95.000 190.000".',
      '  - Set `original_text` to the line EXACTLY as written (still containing the ditto marks). For non-ditto lines set `original_text` to null.',
      '  - If the FIRST line of the invoice uses a ditto, return original_text unchanged in raw_text (nothing to expand against) — set confidence ≤ 0.30 and flag with suggested_sku_code = null.',
      'HINGE VARIANTS (Engsel) — when the row mentions Engsel, the variant word is critical for picking the right SKU:',
      '  - "Lurus" / "Standar" / "Normal" / "Full" → Full Overlay (e.g. ET 06/A "Hinge - Full Overlay"; or ET 01/A / ET 02/A if "Soft Close" / "SC" is ALSO present).',
      '  - "1/2" / "Setengah" / "Half" → Half Overlay (e.g. ET 06/B "Hinge - Half Overlay"; or ET 01/B / ET 02/B for soft-close half-overlay).',
      '  - "Inset" / "Dalam" → Inset (e.g. ET 06/C "Hinge - Inset"; or ET 01/C / ET 02/C for soft-close inset).',
      '  - "Soft Close" / "SC" / "Slow Close" → Soft Closing Hinge variant (ET 01/* or ET 02/*).',
      '  - "Engsel Taco Lurus" with NO soft-close word → prefer ET 06/A (basic Full Overlay), NOT ET 02/C (Soft Closing Inset).',
      '  - Never pick a Soft Closing hinge when the line only says "Lurus" with no soft-close hint.',
      '  - Pick the candidate SKU whose name matches BOTH product type (Hinge) AND variant — not just the product type.',
      'Return strict JSON with shape:',
      '{ "supplier_name": string|null, "invoice_date": "YYYY-MM-DD"|null, "total_amount": number|null,',
      '  "line_items": [ { "raw_text": string (expanded), "original_text": string|null (handwritten form, only when ditto was used), "suggested_sku_code": string|null, "confidence_score": 0..1, "quantity": number, "unit": string|null, "unit_price": number, "total_price": number } ] }',
      'PRICING FIELDS — read carefully:',
      '  - "unit_price" = price PER ONE UNIT (the "Harga Satuan" / "@Rp" column). NEVER divide by quantity.',
      '  - "total_price" = line total = quantity × unit_price (the "Jumlah" / "Total" column).',
      '  - For "5 lbr × Rp 320.000 = Rp 1.600.000": quantity=5, unit_price=320000, total_price=1600000.',
      '  - Indonesian invoices use "." as the thousands separator: "Rp 320.000" means 320000 (three hundred twenty thousand), NOT 320.',
      '  - If only ONE price is visible per row, decide using the SKU price band: pick the value that falls inside band as unit_price; if both candidates fit, the smaller is unit_price.',
      '  - Always satisfy: total_price ≈ quantity × unit_price (within 1 IDR rounding).',
      'Output JSON ONLY — no prose, no markdown fences.',
      '',
      `TACO SKU MASTER (full catalog, ${promptSkus.length} SKUs — CODE | name | category | unit | price band | aliases):`,
      skuContext,
    ].filter(Boolean).join('\n');

    // Dynamic block — varies per invoice (region + recent mapping rules).
    const dynamicPromptLines = [
      regionLine + ' Use the region context if it helps disambiguate supplier or product names.',
      ruleLines,
    ].filter(Boolean).join('\n');

    // Two-block system prompt: the static SKU master + rules are marked
    // cache_control so Anthropic prompt caching reuses them across invoices
    // (5 min cache window). The dynamic block carries per-invoice region/rules
    // and is sent uncached so it stays fresh.
    const response = await this.anthropic.messages.create({
      model: OCR_MODEL,
      max_tokens: 8192,
      system: [
        {
          type: 'text',
          text: staticPromptLines,
          cache_control: { type: 'ephemeral' },
        },
        ...(dynamicPromptLines ? [{ type: 'text' as const, text: dynamicPromptLines }] : []),
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Extract every line item from this supplier invoice.' },
          ],
        },
      ],
    });

    const block = response.content[0];
    const raw = block.type === 'text' ? block.text : '{}';
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    // Tolerate Claude prefacing/suffixing prose — extract the first {...} block.
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = objMatch ? objMatch[0] : cleaned;
    try {
      return JSON.parse(jsonStr) as TaroOcrResponse;
    } catch {
      throw new Error(`Failed to parse OCR response: ${jsonStr.slice(0, 200)}`);
    }
  }
}
