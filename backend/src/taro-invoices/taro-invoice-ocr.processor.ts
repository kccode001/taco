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

interface TaroOcrLineItem {
  raw_text: string;
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
/** Wider top-K used to choose the SKU candidate set fed into the Claude prompt. */
const PROMPT_CANDIDATE_K = 40;
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

      const entities: Partial<TaroInvoiceLineItem>[] = parsed.line_items.map((li, idx) => {
        const modelMatchedId = li.suggested_sku_code
          ? codeToId.get(this.normalizeCode(li.suggested_sku_code)) ?? null
          : null;
        const topRag = ragHits[idx]?.[0] ?? null;

        let matchedId = modelMatchedId;
        let confidence = Math.max(0, Math.min(1, li.confidence_score ?? 0));
        // If the model didn't pick anything but RAG is very confident, promote.
        if (!matchedId && topRag && topRag.score >= 0.55) {
          matchedId = topRag.item.id;
          confidence = Math.min(confidence || 0.6, CONFIDENCE_THRESHOLD - 0.05);
        }

        return {
          invoice_id: invoiceId,
          line_no: idx + 1,
          raw_text: li.raw_text ?? '',
          matched_sku_id: matchedId,
          confidence_score: confidence.toFixed(3),
          needs_review: confidence < CONFIDENCE_THRESHOLD || !matchedId,
          quantity: String(li.quantity ?? 0),
          unit: li.unit ?? null,
          unit_price: String(li.unit_price ?? 0),
          total_price: String(li.total_price ?? (li.quantity ?? 0) * (li.unit_price ?? 0)),
          edited: false,
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
   * RAG candidate selection — coarse probe to narrow the 965-SKU master to
   * top-40 candidates that go into the Claude prompt. Per-line re-scoring
   * happens AFTER OCR in ragRescore().
   *
   * Returns [] if embeddings unavailable so the caller falls back to the full
   * 965-SKU catalog.
   */
  private async pickRagCandidates(
    imagePath: string,
    skuMaster: CachedSku[],
  ): Promise<CachedSku[]> {
    const usable = skuMaster.filter((s) => s.vec !== null);
    if (usable.length === 0) return [];

    // Probe text: a generic invoice-OCR description biased toward TACO products.
    // This is intentionally coarse — per-line re-scoring corrects the picks.
    const probe = `Faktur supplier produk bangunan TACO: laminate HPL sheet edging hardware vinyl plywood ${imagePath
      .split(/[\\/]/)
      .pop() ?? ''}`;
    try {
      const vec = await this.embeddings.embed(probe);
      if (!vec) return [];
      let qn = 0;
      for (let i = 0; i < vec.length; i++) qn += vec[i] * vec[i];
      qn = Math.sqrt(qn);
      return topKPrecomputed(vec, qn, usable, PROMPT_CANDIDATE_K).map((r) => r.item);
    } catch (e) {
      this.logger.warn(`RAG candidate probe failed: ${(e as Error).message}`);
      return [];
    }
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

    const [{ base64, mediaType, originalBytes, sentBytes, downscaled }, ragCandidates] =
      await Promise.all([
        this.prepareImage(imagePath),
        this.pickRagCandidates(imagePath, skuMaster),
      ]);

    if (downscaled) {
      this.logger.log(
        `Resized vision payload ${imagePath.split('/').pop()}: ${originalBytes}B → ${sentBytes}B`,
      );
    }

    const promptSkus = ragCandidates.length > 0 ? ragCandidates : skuMaster;

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

    const systemPrompt = [
      'You are an invoice OCR system for TACO, an Indonesian building-materials brand.',
      'You receive scanned/photo invoices from suppliers (Bahasa Indonesia).',
      regionLine + ' Use the region context if it helps disambiguate supplier or product names.',
      ruleLines,
      'Use the TACO SKU candidates below as product knowledge — match each invoice row to ONE SKU by code.',
      'Match using: SKU code, product name, name aliases, unit & unit alias hints, and price band.',
      'Return strict JSON with shape:',
      '{ "supplier_name": string|null, "invoice_date": "YYYY-MM-DD"|null, "total_amount": number|null,',
      '  "line_items": [ { "raw_text": string, "suggested_sku_code": string|null, "confidence_score": 0..1, "quantity": number, "unit": string|null, "unit_price": number, "total_price": number } ] }',
      'If no SKU is a confident match, set suggested_sku_code to null and confidence_score < 0.85.',
      'Output JSON ONLY — no prose, no markdown fences.',
      '',
      `TACO SKU CANDIDATES (top ${promptSkus.length} by relevance — CODE | name | category | unit | price band | aliases):`,
      skuContext,
    ].filter(Boolean).join('\n');

    const response = await this.anthropic.messages.create({
      model: OCR_MODEL,
      max_tokens: 8192,
      system: systemPrompt,
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
