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
import { QUEUE_TARO_OCR } from './taro-invoices.constants';
import { mediaTypeFor } from '../invoices/ocr-utils';

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
        },
      });

      const parsed = await this.extractWithVision(imagePath, skuMaster);

      // Build a lookup table: normalized code → sku id.
      const codeToId = new Map<string, string>();
      for (const sku of skuMaster) {
        codeToId.set(this.normalizeCode(sku.code), sku.id);
      }

      const entities: Partial<TaroInvoiceLineItem>[] = parsed.line_items.map((li, idx) => {
        const matchedId = li.suggested_sku_code
          ? codeToId.get(this.normalizeCode(li.suggested_sku_code)) ?? null
          : null;
        const confidence = Math.max(0, Math.min(1, li.confidence_score ?? 0));
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

      await this.invoicesRepo.update(invoiceId, {
        status: TaroInvoiceStatus.DONE,
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

  private normalizeCode(code: string): string {
    return code.toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
  }

  private async extractWithVision(
    imagePath: string,
    skuMaster: TacoSku[],
  ): Promise<TaroOcrResponse> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const buf = fs.readFileSync(imagePath);
    const base64 = buf.toString('base64');
    const mediaType = mediaTypeFor(imagePath);

    // Compress the SKU master into a token-efficient text block.
    // Format: CODE | name | category | min-max (avg) | aliases (truncated)
    const skuLines = skuMaster.map((s) => {
      const aliases = (s.product_name_aliases ?? []).slice(0, 6).join(', ');
      return `${s.code} | ${s.name} | ${s.catalog_category ?? '-'} | ${s.min_price}-${s.max_price} (${s.avg_price}) | ${aliases}`;
    });

    const skuContext = skuLines.join('\n');

    const systemPrompt = [
      'You are an invoice OCR system for TACO, an Indonesian building-materials brand.',
      'You receive scanned/photo invoices from suppliers (Bahasa Indonesia).',
      'Use the TACO SKU master below as product knowledge — match each invoice row to ONE SKU by code.',
      'Match using: SKU code, product name, name aliases, unit & unit alias hints, and price band.',
      'Return strict JSON with shape:',
      '{ "supplier_name": string|null, "invoice_date": "YYYY-MM-DD"|null, "total_amount": number|null,',
      '  "line_items": [ { "raw_text": string, "suggested_sku_code": string|null, "confidence_score": 0..1, "quantity": number, "unit": string|null, "unit_price": number, "total_price": number } ] }',
      'If no SKU is a confident match, set suggested_sku_code to null and confidence_score < 0.85.',
      'Output JSON ONLY — no prose, no markdown fences.',
      '',
      'TACO SKU MASTER (CODE | name | category | min-max (avg) | aliases):',
      skuContext,
    ].join('\n');

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
