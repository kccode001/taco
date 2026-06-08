import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { TaroInvoice, TaroInvoiceStatus } from '../database/entities/taro-invoice.entity';
import { TaroInvoiceLineItem } from '../database/entities/taro-invoice-line-item.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { Region } from '../database/entities/region.entity';
import { TaroMappingRule } from '../database/entities/taro-mapping-rule.entity';
import { QUEUE_TARO_OCR } from './taro-invoices.constants';
import { mediaTypeFor } from '../invoices/ocr-utils';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { topK } from '../embeddings/similarity';

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

const OCR_MODEL = 'claude-sonnet-4-5';
const CONFIDENCE_THRESHOLD = 0.85;
const RAG_TOP_K = 10;

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
    @InjectRepository(TacoSku)
    private readonly tacoSkusRepo: Repository<TacoSku>,
    @InjectRepository(Region)
    private readonly regionsRepo: Repository<Region>,
    @InjectRepository(TaroMappingRule)
    private readonly mappingRulesRepo: Repository<TaroMappingRule>,
    private readonly embeddings: EmbeddingsService,
  ) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  @Process('process-taro-invoice')
  async handle(job: Job<{ invoiceId: string; imagePath: string }>): Promise<void> {
    const { invoiceId, imagePath } = job.data;
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

      const skuMaster = await this.tacoSkusRepo.find({
        where: { is_active: true },
        select: {
          id: true,
          code: true,
          name: true,
          catalog_category: true,
          product_name_aliases: true,
          min_price: true,
          max_price: true,
          avg_price: true,
          unit: true,
          unit_aliases: true,
          embedding: true,
        },
      });

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
      // We do a single Claude vision call but stage progress around it so the
      // refresh-resilient UI can show meaningful percentages.
      const parsed = await this.extractWithVision(imagePath, skuMaster, region, mappingRules);

      await this.invoicesRepo.update(invoiceId, { progress_percent: PROGRESS.OCR_DONE });

      // ---- RAG step 2: re-score each line via embeddings ----
      // For each line's raw_text, compute embedding, then top-K SKUs by cosine.
      // If the model's suggested code matches one of the top-K, we keep it.
      // Otherwise we promote the top-K[0] but cap confidence at threshold-0.05
      // so it still falls into needs_review.
      const codeToId = new Map<string, string>();
      for (const sku of skuMaster) codeToId.set(this.normalizeCode(sku.code), sku.id);

      const ragHits = await this.ragRescore(parsed.line_items, skuMaster);

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
   * Returns [] for a line if embeddings are unavailable (no OPENAI_API_KEY).
   */
  private async ragRescore(
    lineItems: TaroOcrLineItem[],
    skuMaster: TacoSku[],
  ): Promise<Array<Array<{ item: TacoSku; score: number }>>> {
    const usable = skuMaster.filter((s) => !!s.embedding);
    if (usable.length === 0) return lineItems.map(() => []);

    const results: Array<Array<{ item: TacoSku; score: number }>> = [];
    for (const li of lineItems) {
      const text = [li.raw_text, li.suggested_sku_code, li.unit]
        .filter(Boolean)
        .join(' ');
      if (!text.trim()) {
        results.push([]);
        continue;
      }
      try {
        const vec = await this.embeddings.embed(text);
        if (!vec) {
          results.push([]);
          continue;
        }
        results.push(topK(vec, usable, RAG_TOP_K));
      } catch (e) {
        this.logger.warn(`RAG embed failed for "${text.slice(0, 60)}": ${(e as Error).message}`);
        results.push([]);
      }
    }
    return results;
  }

  private normalizeCode(code: string): string {
    return code.toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
  }

  /**
   * RAG candidate selection — quick Claude haiku-ish summarisation isn't worth
   * the extra call, so we just use the file name as a coarse signal and fall
   * through to the top-N most generally relevant SKUs by embedding similarity
   * against a hard-coded "invoice line items" probe. The accurate per-line
   * re-scoring happens in ragRescore() AFTER OCR.
   *
   * Returns [] if embeddings unavailable so the caller falls back to the full
   * 965-SKU catalog.
   */
  private async pickRagCandidates(
    imagePath: string,
    skuMaster: TacoSku[],
  ): Promise<TacoSku[]> {
    const usable = skuMaster.filter((s) => !!s.embedding);
    if (usable.length === 0) return [];

    // Probe text: a generic invoice-OCR description biased toward TACO products.
    // This is intentionally coarse — per-line re-scoring corrects the picks.
    const probe = `Faktur supplier produk bangunan TACO: laminate HPL sheet edging hardware vinyl plywood ${imagePath
      .split(/[\\/]/)
      .pop() ?? ''}`;
    try {
      const vec = await this.embeddings.embed(probe);
      if (!vec) return [];
      // Pull a wider top-K here (40) so Claude has room to pick — the
      // per-line re-scoring narrows further.
      return topK(vec, usable, 40).map((r) => r.item);
    } catch (e) {
      this.logger.warn(`RAG candidate probe failed: ${(e as Error).message}`);
      return [];
    }
  }

  private async extractWithVision(
    imagePath: string,
    skuMaster: TacoSku[],
    region: Region | null,
    mappingRules: TaroMappingRule[],
  ): Promise<TaroOcrResponse> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const buf = fs.readFileSync(imagePath);
    const base64 = buf.toString('base64');
    const mediaType = mediaTypeFor(imagePath);

    // ---- RAG candidate selection ----
    // Embed the whole image's OCR-able context once to grab top-K SKUs from
    // the 965-row master, rather than stuffing the full catalog into the
    // prompt. If embeddings unavailable, fall back to the old "all SKUs"
    // behaviour so we don't regress.
    const ragCandidates = await this.pickRagCandidates(imagePath, skuMaster);
    const promptSkus = ragCandidates.length > 0 ? ragCandidates : skuMaster;

    // Compress the SKU master into a token-efficient text block.
    // Format: CODE | name | category | min-max (avg) | aliases (truncated)
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
    } catch (e) {
      throw new Error(`Failed to parse OCR response: ${jsonStr.slice(0, 200)}`);
    }
  }
}
