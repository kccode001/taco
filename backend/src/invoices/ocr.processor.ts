import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { Invoice, InvoiceStatus } from '../database/entities/invoice.entity';
import { InvoiceLineItem } from '../database/entities/invoice-line-item.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { CompetitorSku } from '../database/entities/competitor-sku.entity';

interface OcrLineItem {
  raw_text: string;
  product_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  confidence: number;
}

interface EmbeddingMatch {
  id: string;
  similarity: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

@Processor('ocr')
export class OcrProcessor {
  private readonly anthropic: Anthropic;
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(Invoice)
    private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemsRepo: Repository<InvoiceLineItem>,
    @InjectRepository(TacoSku)
    private readonly tacoSkusRepo: Repository<TacoSku>,
    @InjectRepository(CompetitorSku)
    private readonly competitorSkusRepo: Repository<CompetitorSku>,
  ) {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  @Process('process-ocr')
  async handleOcr(job: Job<{ invoiceId: string; imagePath: string }>): Promise<void> {
    const { invoiceId, imagePath } = job.data;

    const invoice = await this.invoicesRepo.findOne({ where: { id: invoiceId } });
    if (!invoice) return;

    try {
      // Step 1: Read image as base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const ext = imagePath.split('.').pop()?.toLowerCase() || 'jpeg';
      const mediaTypeMap: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'> =
        {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          gif: 'image/gif',
          webp: 'image/webp',
        };
      const mediaType = mediaTypeMap[ext] ?? 'image/jpeg';

      // Step 2: Call Claude Opus 4.8 with vision to extract line items
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 4096,
        system:
          'You are an invoice OCR system. Extract all line items from this invoice image. Return a JSON array only, no other text. Each item: { raw_text, product_name, qty, unit, unit_price, confidence } where confidence is 0-1.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: 'Extract all line items from this invoice.',
              },
            ],
          },
        ],
      });

      const rawText =
        response.content[0].type === 'text' ? response.content[0].text : '[]';

      let lineItems: OcrLineItem[] = [];
      try {
        const cleaned = rawText
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        lineItems = JSON.parse(cleaned) as OcrLineItem[];
      } catch {
        throw new Error(`Failed to parse Claude OCR response: ${rawText}`);
      }

      // Step 3: Load all SKU embeddings for similarity search
      const tacoSkus = await this.tacoSkusRepo.find({ where: { is_active: true } });
      const competitorSkus = await this.competitorSkusRepo.find();

      // Step 4: Process each line item
      const lineItemEntities: Partial<InvoiceLineItem>[] = [];

      for (const item of lineItems) {
        const entity: Partial<InvoiceLineItem> = {
          invoice_id: invoiceId,
          raw_text: item.raw_text,
          product_name: item.product_name,
          qty: item.qty,
          unit: item.unit,
          unit_price: item.unit_price,
          confidence: item.confidence,
          is_unclear: false,
          is_unknown: false,
        };

        // confidence < 0.6: mark unclear, skip matching
        if (item.confidence < 0.6) {
          entity.is_unclear = true;
          lineItemEntities.push(entity);
          continue;
        }

        // Generate text embedding for this product name
        const embeddingResponse = await this.openai.embeddings.create({
          model: 'text-embedding-3-large',
          input: item.product_name,
        });
        const itemEmbedding = embeddingResponse.data[0].embedding;

        // Similarity search against taco_skus
        let bestTacoMatch: EmbeddingMatch | null = null;
        for (const sku of tacoSkus) {
          if (!sku.embedding) continue;
          try {
            const skuEmbedding: number[] = JSON.parse(sku.embedding) as number[];
            const similarity = cosineSimilarity(itemEmbedding, skuEmbedding);
            if (similarity >= 0.7 && (!bestTacoMatch || similarity > bestTacoMatch.similarity)) {
              bestTacoMatch = { id: sku.id, similarity };
            }
          } catch {
            // skip invalid embedding
          }
        }

        // Similarity search against competitor_skus
        let bestCompetitorMatch: EmbeddingMatch | null = null;
        for (const sku of competitorSkus) {
          if (!sku.embedding) continue;
          try {
            const skuEmbedding: number[] = JSON.parse(sku.embedding) as number[];
            const similarity = cosineSimilarity(itemEmbedding, skuEmbedding);
            if (
              similarity >= 0.7 &&
              (!bestCompetitorMatch || similarity > bestCompetitorMatch.similarity)
            ) {
              bestCompetitorMatch = { id: sku.id, similarity };
            }
          } catch {
            // skip invalid embedding
          }
        }

        if (bestTacoMatch) {
          entity.taco_sku_id = bestTacoMatch.id;
        } else if (bestCompetitorMatch) {
          entity.competitor_sku_id = bestCompetitorMatch.id;
          // Flag competitor SKU for review
          await this.competitorSkusRepo.update(bestCompetitorMatch.id, {
            flagged_for_review: true,
          });
        } else {
          // No match above 0.7 threshold
          entity.is_unknown = true;
        }

        lineItemEntities.push(entity);
      }

      // Step 6: Persist all line items
      await this.lineItemsRepo.save(lineItemEntities);

      // Step 7: Mark invoice as done
      await this.invoicesRepo.update(invoiceId, {
        status: InvoiceStatus.DONE,
        processed_at: new Date(),
      });
    } catch (error) {
      await this.invoicesRepo.update(invoiceId, {
        status: InvoiceStatus.FAILED,
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
