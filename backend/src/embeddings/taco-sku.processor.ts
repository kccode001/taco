import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { EmbeddingsService, QUEUE_TACO_SKU } from './embeddings.service';
import { SkuEmbeddingCache } from './sku-embedding-cache.service';

@Processor(QUEUE_TACO_SKU)
export class TacoSkuEmbeddingProcessor {
  private readonly logger = new Logger(TacoSkuEmbeddingProcessor.name);

  constructor(
    @InjectRepository(TacoSku)
    private readonly repo: Repository<TacoSku>,
    private readonly embeddings: EmbeddingsService,
    private readonly skuCache: SkuEmbeddingCache,
  ) {}

  @Process('generate')
  async handle(job: Job<{ id: string }>): Promise<void> {
    const sku = await this.repo.findOne({ where: { id: job.data.id } });
    if (!sku) {
      this.logger.warn(`TacoSku ${job.data.id} not found — skip embedding.`);
      return;
    }

    const text = composeTacoSkuEmbeddingText(sku);
    const vec = await this.embeddings.embed(text);
    if (!vec) {
      this.logger.warn(`Embedding for taco_sku ${sku.id} skipped (no API key).`);
      return;
    }

    await this.repo.update(sku.id, { embedding: JSON.stringify(vec) });
    this.logger.log(`Re-embedded taco_sku ${sku.code} (${sku.id})`);
    // Refresh the OCR cache so newly-embedded SKUs become matchable without
    // a server restart.
    this.skuCache.invalidate().catch(() => {});
  }
}

/**
 * Canonical embedding text for a TACO SKU. Includes the human-facing name,
 * all synonyms (`product_name_aliases`), the catalog group, the canonical unit
 * + unit aliases, and the price band. Matches the OCR-time text composition so
 * cosine similarity is meaningful.
 */
export function composeTacoSkuEmbeddingText(sku: TacoSku): string {
  const aliases = (sku.product_name_aliases ?? []).join(', ') || '(none)';
  const unitAliases = (sku.unit_aliases ?? []).join(', ') || '(none)';
  const category = sku.catalog_category ?? sku.category ?? '(uncategorized)';
  const unit = sku.unit ?? sku.uom ?? '(unspecified)';
  const minPrice = sku.min_price ?? 0;
  const maxPrice = sku.max_price ?? 0;
  return `${sku.name}. Aliases: ${aliases}. Category: ${category}. Unit: ${unit}, ${unitAliases}. Price range Rp ${minPrice}-${maxPrice}.`;
}
