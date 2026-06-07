import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { FotoKatalog, FotoKatalogStatus } from './foto-katalog.entity';
import { QUEUE_OCR_FOTO_KATALOG } from './invoices.service';
import { cosineSimilarity, mediaTypeFor } from './ocr-utils';

interface OcrKatalogRow {
  name: string;
  price: number;
  confidence: number;
}

const OCR_MODEL = 'claude-opus-4-8';

/**
 * Foto Katalog OCR — TACO pricing extraction from a store's posted price board
 * or TACO catalog. Distinct from competitor invoice OCR; matches against the
 * 9 TACO categories (scoped to TacoSku embeddings).
 *
 * Output is a draft list of suggested {taco_sku_id, harga_jual_tukang_suggested,
 * confidence} for the FE to confirm in step D1 (TACO pricing).
 */
@Processor(QUEUE_OCR_FOTO_KATALOG)
export class FotoKatalogProcessor {
  private readonly logger = new Logger(FotoKatalogProcessor.name);
  private readonly anthropic: Anthropic;

  constructor(
    @InjectRepository(FotoKatalog) private readonly katalogRepo: Repository<FotoKatalog>,
    @InjectRepository(TacoSku) private readonly tacoSkusRepo: Repository<TacoSku>,
    private readonly embeddings: EmbeddingsService,
  ) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  @Process('process-foto-katalog')
  async handle(job: Job<{ fotoKatalogId: string; imagePath: string }>): Promise<void> {
    const { fotoKatalogId, imagePath } = job.data;
    const katalog = await this.katalogRepo.findOne({ where: { id: fotoKatalogId } });
    if (!katalog) return;

    try {
      const rows = await this.extractWithVision(imagePath);
      const tacoSkus = await this.tacoSkusRepo.find({ where: { is_active: true } });

      const results: FotoKatalog['result_skus'] = [];
      for (const row of rows) {
        const base = {
          raw_name: row.name,
          raw_price: row.price,
          harga_jual_tukang_suggested: row.price,
          confidence: row.confidence,
        };

        if (row.confidence < 0.6) {
          results.push({ ...base, is_unclear: true });
          continue;
        }

        const vec = await this.embeddings.embed(row.name);
        if (!vec) {
          results.push({ ...base, is_unknown: true });
          continue;
        }

        let bestSku: TacoSku | null = null;
        let bestSim = 0;
        for (const sku of tacoSkus) {
          if (!sku.embedding) continue;
          try {
            const skuVec = JSON.parse(sku.embedding) as number[];
            const sim = cosineSimilarity(vec, skuVec);
            if (sim > bestSim) {
              bestSim = sim;
              bestSku = sku;
            }
          } catch {
            /* skip */
          }
        }

        if (bestSku && bestSim >= 0.7) {
          results.push({
            ...base,
            taco_sku_id: bestSku.id,
            taco_sku_code: bestSku.code,
            taco_sku_name: bestSku.name,
            confidence: Math.min(row.confidence, bestSim),
          });
        } else {
          results.push({ ...base, is_unknown: true });
        }
      }

      await this.katalogRepo.update(fotoKatalogId, {
        status: FotoKatalogStatus.DONE,
        result_skus: results,
        processed_at: new Date(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Foto Katalog OCR failed for ${fotoKatalogId}: ${message}`);
      await this.katalogRepo.update(fotoKatalogId, {
        status: FotoKatalogStatus.FAILED,
        error_message: message,
      });
    }
  }

  private async extractWithVision(imagePath: string): Promise<OcrKatalogRow[]> {
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
        'You are a TACO product price-board OCR system for an Indonesian building-materials',
        'company. Extract every TACO product row from the photo (price board / catalog).',
        'For each row return: name (verbatim product name as printed), price (IDR, number),',
        'confidence (0-1). Output JSON array ONLY — no prose, no markdown fences.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Extract every TACO product row.' },
          ],
        },
      ],
    });

    const block = response.content[0];
    const raw = block.type === 'text' ? block.text : '[]';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as OcrKatalogRow[];
    } catch {
      throw new Error(`Failed to parse Foto Katalog OCR response: ${cleaned.slice(0, 200)}`);
    }
  }
}
