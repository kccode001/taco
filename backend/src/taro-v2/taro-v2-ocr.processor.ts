import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { mediaTypeFor, ImageMediaType } from '../invoices/ocr-utils';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { topKPrecomputed } from '../embeddings/similarity';
import { SkuEmbeddingCache, CachedSku } from '../embeddings/sku-embedding-cache.service';
import { buildCodeIndex, findExactSkuCode, findSuffixSkuCode } from '../taro-invoices/sku-code-matcher';
import { InvoiceV2 } from '../database/entities/v2/invoice-v2.entity';
import { InvoiceImageV2 } from '../database/entities/v2/invoice-image-v2.entity';
import { InvoiceLineItemV2 } from '../database/entities/v2/invoice-line-item-v2.entity';
import {
  InvoiceImageV2ValidationStatus,
  InvoiceV2Status,
  LineItemV2Classification,
  bandForClassification,
  classificationNeedsReview,
  isTacoClassification,
  REVIEW_QUEUE_CLASSIFICATIONS,
} from '../database/entities/v2/invoice-v2.enums';
import { QUEUE_TARO_V2_OCR, JOB_PROCESS_TARO_V2 } from './taro-v2.constants';

interface V2OcrLineItem {
  raw_text: string;
  original_text?: string | null;
  suggested_sku_code: string | null;
  classification: string;
  confidence_score: number;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total_price: number;
}

interface V2OcrResponse {
  supplier_name: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  line_items: V2OcrLineItem[];
}

/** Vision model — KC (2026-06-14): TACO vision/OCR off Opus → Sonnet (cost). Sonnet 4.6 is vision-capable. */
const OCR_MODEL = 'claude-sonnet-4-6';
const RAG_TOP_K = 10;
const VISION_MAX_EDGE_PX = 2048;
export const TARO_V2_OCR_CONCURRENCY = 4;
const ANTHROPIC_MAX_RETRIES = 3;

const PROGRESS = {
  OCR_STARTED: 20,
  OCR_DONE: 70,
  MAPPING_DONE: 90,
  DONE: 100,
} as const;

/** Map a raw Claude classification token to the locked 9-bucket enum. */
function normalizeClassification(raw: string): LineItemV2Classification {
  const v = (raw ?? '').trim().toLowerCase();
  const match = (Object.values(LineItemV2Classification) as string[]).find(
    (c) => c === v,
  );
  return (match as LineItemV2Classification) ?? LineItemV2Classification.UNKNOWN_NEEDS_HUMAN;
}

/**
 * TACO v2 — OCR + 9-bucket classification + SKU mapping worker.
 *
 * One job per invoice. Reads every VALID image, runs Claude vision against the
 * full TACO SKU master (prompt-cached), classifies each line into one of the 9
 * locked buckets, and maps a TACO SKU (exact-code → RAG) for TACO-classified
 * lines. needs_review is derived from the classification bucket. Finally
 * recomputes the invoice status (DONE when no line needs review, else
 * NEEDS_REVIEW).
 */
@Processor(QUEUE_TARO_V2_OCR)
export class TaroV2OcrProcessor {
  private readonly logger = new Logger(TaroV2OcrProcessor.name);
  private readonly anthropic: Anthropic;

  constructor(
    @InjectRepository(InvoiceV2)
    private readonly invoicesRepo: Repository<InvoiceV2>,
    @InjectRepository(InvoiceImageV2)
    private readonly imagesRepo: Repository<InvoiceImageV2>,
    @InjectRepository(InvoiceLineItemV2)
    private readonly lineItemsRepo: Repository<InvoiceLineItemV2>,
    private readonly embeddings: EmbeddingsService,
    private readonly skuCache: SkuEmbeddingCache,
  ) {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: ANTHROPIC_MAX_RETRIES,
    });
  }

  @Process({ name: JOB_PROCESS_TARO_V2, concurrency: TARO_V2_OCR_CONCURRENCY })
  async handle(job: Job<{ invoiceId: string }>): Promise<void> {
    const { invoiceId } = job.data;
    const t0 = Date.now();
    const invoice = await this.invoicesRepo.findOne({ where: { id: invoiceId } });
    if (!invoice) {
      this.logger.warn(`InvoiceV2 ${invoiceId} not found — skipping OCR.`);
      return;
    }

    try {
      await this.invoicesRepo.update(invoiceId, {
        status: InvoiceV2Status.OCR_PROCESSING,
        progress_percent: PROGRESS.OCR_STARTED,
        error_message: null,
      });

      const images = await this.imagesRepo.find({
        where: {
          invoice_id: invoiceId,
          validation_status: InvoiceImageV2ValidationStatus.VALID,
        },
        order: { created_at: 'ASC' },
      });
      if (images.length === 0) {
        throw new Error('No valid images to process');
      }

      const skuMaster = await this.skuCache.getAll();
      const codeToId = new Map<string, string>();
      for (const sku of skuMaster) codeToId.set(this.normalizeCode(sku.code), sku.id);
      const exactIndex = buildCodeIndex(
        skuMaster.map((s) => ({
          id: s.id,
          code: s.code,
          product_name_aliases: s.product_name_aliases,
        })),
      );

      // Clear any prior lines (idempotent re-process).
      await this.lineItemsRepo.delete({ invoice_id: invoiceId });

      const allEntities: Partial<InvoiceLineItemV2>[] = [];
      let supplierName: string | null = invoice.supplier_name;
      let invoiceDate: string | null = invoice.invoice_date;
      let totalAmount: number | null = null;
      let lineNo = 0;

      for (const image of images) {
        const parsed = await this.extractWithVision(image.file_path, skuMaster);
        supplierName = supplierName ?? parsed.supplier_name;
        invoiceDate = invoiceDate ?? parsed.invoice_date;
        if (parsed.total_amount != null) {
          totalAmount = (totalAmount ?? 0) + parsed.total_amount;
        }

        const ragHits = await this.ragRescore(parsed.line_items, skuMaster);

        parsed.line_items.forEach((li, idx) => {
          const classification = normalizeClassification(li.classification);
          const isTaco = isTacoClassification(classification);

          // SKU mapping only for TACO-classified lines.
          let matchedId: string | null = null;
          if (isTaco) {
            const exact = findExactSkuCode(li.raw_text ?? '', exactIndex);
            if (exact) {
              matchedId = exact.sku_id;
            } else if (li.suggested_sku_code) {
              matchedId = codeToId.get(this.normalizeCode(li.suggested_sku_code)) ?? null;
            }
            if (!matchedId) {
              const topRag = ragHits[idx]?.[0] ?? null;
              if (topRag && topRag.score >= 0.55) matchedId = topRag.item.id;
            }
            // Pre-select hint (step 1): for review-queue TACO lines still unmatched,
            // try suffix/partial code matching — catches truncated OCR fragments like
            // "056 AA" which are clearly the tail of a catalog code ("TH 056 AA").
            // Confidence 0.70 < 0.85 threshold so needs_review stays true.
            if (!matchedId && REVIEW_QUEUE_CLASSIFICATIONS.has(classification)) {
              const suffixHit = findSuffixSkuCode(
                li.raw_text ?? '',
                skuMaster.map((s) => ({ id: s.id, code: s.code, product_name_aliases: s.product_name_aliases })),
              );
              if (suffixHit) matchedId = suffixHit.sku_id;
            }
            // Pre-select hint (step 2): if suffix matching also failed, try top RAG
            // candidate at a lower threshold (≥0.10). needs_review stays true.
            if (!matchedId && REVIEW_QUEUE_CLASSIFICATIONS.has(classification)) {
              const topRag = ragHits[idx]?.[0] ?? null;
              if (topRag && topRag.score >= 0.10) matchedId = topRag.item.id;
            }
          }

          const confidence = Math.max(0, Math.min(1, li.confidence_score ?? 0));
          const rawText = (li.raw_text ?? '').trim();
          const originalRaw = (li.original_text ?? '').trim();
          const originalText = originalRaw && originalRaw !== rawText ? originalRaw : null;

          lineNo += 1;
          allEntities.push({
            invoice_id: invoiceId,
            image_id: image.id,
            line_no: lineNo,
            raw_text: rawText,
            original_text: originalText,
            classification,
            confidence_band: bandForClassification(classification),
            confidence_score: confidence.toFixed(3),
            matched_sku_id: matchedId,
            brand_id: null,
            brand_name: null,
            is_competitor: false,
            mismatch_reason: null,
            needs_review: classificationNeedsReview(classification),
            quantity: String(li.quantity ?? 0),
            unit: li.unit ?? null,
            unit_price: String(li.unit_price ?? 0),
            total_price: String(li.total_price ?? 0),
            edited: false,
          });
        });
      }

      if (allEntities.length > 0) {
        await this.lineItemsRepo.save(allEntities);
      }
      await this.invoicesRepo.update(invoiceId, { progress_percent: PROGRESS.MAPPING_DONE });

      const anyNeedsReview = allEntities.some((e) => e.needs_review === true);
      const finalStatus = anyNeedsReview
        ? InvoiceV2Status.NEEDS_REVIEW
        : InvoiceV2Status.DONE;

      await this.invoicesRepo.update(invoiceId, {
        status: finalStatus,
        progress_percent: PROGRESS.DONE,
        supplier_name: supplierName,
        invoice_date: invoiceDate,
        total_amount: totalAmount != null ? String(totalAmount) : invoice.total_amount,
      });

      this.logger.log(
        `Taro v2 OCR ${invoiceId} done in ${Date.now() - t0}ms ` +
          `(images=${images.length}, lines=${allEntities.length}, status=${finalStatus})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Taro v2 OCR failed for ${invoiceId}: ${message}`);
      await this.invoicesRepo.update(invoiceId, {
        status: InvoiceV2Status.FAILED,
        error_message: message,
      });
    }
  }

  private async ragRescore(
    lineItems: V2OcrLineItem[],
    skuMaster: CachedSku[],
  ): Promise<Array<Array<{ item: CachedSku; score: number }>>> {
    const usable = skuMaster.filter((s) => s.vec !== null);
    if (usable.length === 0) return lineItems.map(() => []);

    const texts = lineItems.map((li) =>
      [li.raw_text, li.suggested_sku_code, li.unit].filter(Boolean).join(' ').trim(),
    );
    const vectors = await Promise.all(
      texts.map(async (text) => {
        if (!text) return null;
        try {
          return await this.embeddings.embed(text);
        } catch (e) {
          this.logger.warn(`RAG embed failed for "${text.slice(0, 60)}": ${(e as Error).message}`);
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

  private async extractWithVision(
    imagePath: string,
    skuMaster: CachedSku[],
  ): Promise<V2OcrResponse> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const { base64, mediaType } = await this.prepareImage(imagePath);

    const skuLines = skuMaster.map((s) => {
      const aliases = (s.product_name_aliases ?? []).slice(0, 6).join(', ');
      const units = (s.unit_aliases ?? []).slice(0, 4).join(', ');
      return `${s.code} | ${s.name} | ${s.catalog_category ?? '-'} | unit ${s.unit ?? '-'} (${units}) | ${s.min_price}-${s.max_price} (${s.avg_price}) | ${aliases}`;
    });
    const skuContext = skuLines.join('\n');

    const staticPrompt = [
      'You are an invoice OCR + classification system for TACO, an Indonesian building-materials brand.',
      'You receive scanned/photo supplier invoices (Bahasa Indonesia), handwritten OR printed.',
      'Extract every line item. The image is the arbiter — handwriting OCR is unreliable (8↔0, 5↔3, 9↔4, 1↔7, 6↔0; l↔t, m↔n, c↔e, B↔R).',
      'For each line, decide whether the product is a TACO catalog item or a competitor/other product, and HOW confident you are, using EXACTLY one of these 9 classification tokens:',
      '  taco_very_high          — clearly a TACO SKU, code/name unambiguous.',
      '  taco_high               — almost certainly TACO; minor OCR noise but image confirms.',
      '  taco_low_verify         — probably TACO but uncertain; a human should verify.',
      '  taco_unreadable_guess   — cannot read it well, but it LOOKS like a TACO SKU.',
      '  not_taco_very_high      — clearly NOT a TACO product (competitor/other), unambiguous.',
      '  not_taco_high           — almost certainly not TACO.',
      '  not_taco_low_verify     — probably not TACO but uncertain; human should verify.',
      '  not_taco_unreadable_guess — cannot read it well, but thinks it is NOT TACO.',
      '  unknown_needs_human     — cannot tell at all whether TACO or not; needs human check.',
      'Use the TACO SKU MASTER below as product knowledge — match each TACO line to ONE SKU by code via `suggested_sku_code`. For non-TACO/unknown lines set suggested_sku_code = null.',
      'confidence_score (0..1) should agree with the band: very_high ≥0.90, high 0.75–0.89, low_verify 0.55–0.74, unreadable_guess ≤0.40, unknown ≤0.40.',
      'DITTO MARKS — Indonesian invoices reuse the previous row\'s product with "--", "—", "do.", "sda", "\'\'". Expand `raw_text` to the full product (substitute the previous line\'s product noun) and set `original_text` to the line exactly as written (with the ditto). For non-ditto lines set original_text = null.',
      'PRICING — "unit_price" = price per ONE unit (Harga Satuan / @Rp), never divide by qty. "total_price" = qty × unit_price (Jumlah/Total). "." is the thousands separator: "Rp 320.000" = 320000. Always: total_price ≈ quantity × unit_price.',
      'Return STRICT JSON only — no prose, no markdown fences:',
      '{ "supplier_name": string|null, "invoice_date": "YYYY-MM-DD"|null, "total_amount": number|null,',
      '  "line_items": [ { "raw_text": string, "original_text": string|null, "suggested_sku_code": string|null, "classification": one of the 9 tokens, "confidence_score": 0..1, "quantity": number, "unit": string|null, "unit_price": number, "total_price": number } ] }',
      '',
      `TACO SKU MASTER (full catalog, ${skuMaster.length} SKUs — CODE | name | category | unit | price band | aliases):`,
      skuContext,
    ].join('\n');

    const response = await this.anthropic.messages.create({
      model: OCR_MODEL,
      max_tokens: 8192,
      system: [{ type: 'text', text: staticPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Extract and classify every line item from this supplier invoice.' },
          ],
        },
      ],
    });

    const block = response.content[0];
    const raw = block && block.type === 'text' ? block.text : '{}';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = objMatch ? objMatch[0] : cleaned;
    try {
      const parsed = JSON.parse(jsonStr) as V2OcrResponse;
      parsed.line_items = Array.isArray(parsed.line_items) ? parsed.line_items : [];
      return parsed;
    } catch {
      throw new Error(`Failed to parse v2 OCR response: ${jsonStr.slice(0, 200)}`);
    }
  }

  private async prepareImage(
    imagePath: string,
  ): Promise<{ base64: string; mediaType: ImageMediaType }> {
    const buf = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    if (buf.byteLength < 256 * 1024) {
      return { base64: buf.toString('base64'), mediaType: mediaTypeFor(imagePath) };
    }
    try {
      const img = sharp(buf, { failOn: 'none' }).rotate();
      const meta = await img.metadata();
      const longerEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longerEdge <= VISION_MAX_EDGE_PX) {
        return { base64: buf.toString('base64'), mediaType: mediaTypeFor(imagePath) };
      }
      const resized = await img
        .resize({
          width: meta.width && meta.width >= (meta.height ?? 0) ? VISION_MAX_EDGE_PX : undefined,
          height: meta.height && meta.height > (meta.width ?? 0) ? VISION_MAX_EDGE_PX : undefined,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
      const mediaType: ImageMediaType = ext === '.gif' ? 'image/gif' : 'image/jpeg';
      return { base64: resized.toString('base64'), mediaType };
    } catch (e) {
      this.logger.warn(`Resize failed for ${imagePath} (${(e as Error).message}) — sending original.`);
      return { base64: buf.toString('base64'), mediaType: mediaTypeFor(imagePath) };
    }
  }
}
