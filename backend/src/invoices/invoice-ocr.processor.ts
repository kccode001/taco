import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { Invoice, InvoiceStatus } from '../database/entities/invoice.entity';
import { InvoiceLineItem } from '../database/entities/invoice-line-item.entity';
import { CompetitorSku } from '../database/entities/competitor-sku.entity';
import { CompetitorBrand } from '../database/entities/competitor-brand.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { QUEUE_OCR_INVOICE } from './invoices.service';
import { cosineSimilarity, mediaTypeFor } from './ocr-utils';

interface OcrLineItem {
  raw_text: string;
  product_name: string;
  brand: string | null;
  qty: number;
  unit: string;
  unit_price: number;
  confidence: number;
}

const OCR_MODEL = 'claude-opus-4-8';

/**
 * Multi-invoice OCR worker. Per AUDIT-009 §03:
 *   - brand is detected per line item (chip per line, editable on tap)
 *   - unit_price is interpreted as Harga Beli (rep view labels it accordingly)
 *   - mixed brands within one invoice are supported
 */
@Processor(QUEUE_OCR_INVOICE)
export class InvoiceOcrProcessor {
  private readonly logger = new Logger(InvoiceOcrProcessor.name);
  private readonly anthropic: Anthropic;

  constructor(
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemsRepo: Repository<InvoiceLineItem>,
    @InjectRepository(CompetitorSku)
    private readonly competitorSkusRepo: Repository<CompetitorSku>,
    @InjectRepository(CompetitorBrand)
    private readonly brandsRepo: Repository<CompetitorBrand>,
    private readonly embeddings: EmbeddingsService,
  ) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  @Process('process-invoice')
  async handle(job: Job<{ invoiceId: string; imagePath: string }>): Promise<void> {
    const { invoiceId, imagePath } = job.data;
    const invoice = await this.invoicesRepo.findOne({ where: { id: invoiceId } });
    if (!invoice) {
      this.logger.warn(`Invoice ${invoiceId} not found — skip OCR.`);
      return;
    }

    try {
      const lineItems = await this.extractWithVision(imagePath);
      const brands = await this.brandsRepo.find({ where: { is_active: true } });
      const competitorSkus = await this.competitorSkusRepo.find();

      const entities: Partial<InvoiceLineItem>[] = [];
      for (const item of lineItems) {
        const entity: Partial<InvoiceLineItem> = {
          invoice_id: invoiceId,
          raw_text: item.raw_text,
          product_name: item.product_name,
          brand_name: item.brand ?? undefined,
          qty: item.qty,
          unit: item.unit,
          unit_price: item.unit_price,
          confidence: item.confidence,
          is_unclear: false,
          is_unknown: false,
        };

        // AC-22 — unclear line: flag, leave note for rep, do not block.
        if (item.confidence < 0.6) {
          entity.is_unclear = true;
          entities.push(entity);
          continue;
        }

        // Brand attribution: match OCR text against known CompetitorBrand by name.
        if (item.brand) {
          const matchedBrand = brands.find(
            (b) => b.name.toLowerCase() === item.brand!.toLowerCase(),
          );
          if (matchedBrand) entity.brand_id = matchedBrand.id;
        }

        // Embedding match against competitor SKU catalog.
        const searchText = item.brand
          ? `${item.brand} ${item.product_name}`
          : item.product_name;
        const itemEmbedding = await this.embeddings.embed(searchText);
        if (!itemEmbedding) {
          // No API key configured — flag as unknown so admin can map later. AC-12.
          entity.is_unknown = true;
          entities.push(entity);
          continue;
        }

        let bestId: string | null = null;
        let bestSim = 0;
        for (const sku of competitorSkus) {
          if (!sku.embedding) continue;
          try {
            const vec = JSON.parse(sku.embedding) as number[];
            const sim = cosineSimilarity(itemEmbedding, vec);
            if (sim > bestSim) {
              bestSim = sim;
              bestId = sku.id;
            }
          } catch {
            /* skip malformed */
          }
        }

        // AC-8 thresholds: ≥0.85 mapped; 0.70–0.85 mapped + amber dot (lower
        // confidence stored unchanged so FE renders amber); <0.70 unknown.
        if (bestId && bestSim >= 0.85) {
          entity.competitor_sku_id = bestId;
        } else if (bestId && bestSim >= 0.7) {
          entity.competitor_sku_id = bestId;
          entity.confidence = Math.min(entity.confidence ?? 1, bestSim);
        } else {
          entity.is_unknown = true; // AC-12 — queued for admin review
        }

        entities.push(entity);
      }

      if (entities.length > 0) {
        await this.lineItemsRepo.save(entities);
      }

      await this.invoicesRepo.update(invoiceId, {
        status: InvoiceStatus.DONE,
        processed_at: new Date(),
      });
    } catch (err) {
      // AC-11 — failure path: persist error_message; rep gets fallback in FE.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Invoice OCR failed for ${invoiceId}: ${message}`);
      await this.invoicesRepo.update(invoiceId, {
        status: InvoiceStatus.FAILED,
        error_message: message,
      });
    }
  }

  private async extractWithVision(imagePath: string): Promise<OcrLineItem[]> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const buf = fs.readFileSync(imagePath);
    const base64 = buf.toString('base64');
    const mediaType = mediaTypeFor(imagePath);

    const response = await this.anthropic.messages.create({
      model: OCR_MODEL,
      max_tokens: 4096,
      system: [
        'You are an invoice OCR system for an Indonesian building-materials distributor.',
        'The invoice may contain MULTIPLE competitor brands per page (Krono, Pergo, Egger,',
        'Wilsonart, Arborite, Formica, Greenlam, Hibrew, IPEX, Saint-Gobain or any other).',
        'For EACH line item, return: raw_text (verbatim row), product_name (cleaned),',
        'brand (best guess from row text — null if unclear), qty (number), unit (string),',
        'unit_price (IDR per unit, number), confidence (0-1).',
        'Output a JSON array ONLY. No prose, no markdown fences.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Extract every line item.' },
          ],
        },
      ],
    });

    const block = response.content[0];
    const raw = block.type === 'text' ? block.text : '[]';
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    try {
      return JSON.parse(cleaned) as OcrLineItem[];
    } catch (e) {
      throw new Error(`Failed to parse OCR response: ${cleaned.slice(0, 200)}`);
    }
  }
}
