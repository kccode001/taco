import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompetitorSku } from '../database/entities/competitor-sku.entity';
import { EmbeddingsService, QUEUE_COMPETITOR_SKU } from './embeddings.service';

@Processor(QUEUE_COMPETITOR_SKU)
export class CompetitorSkuEmbeddingProcessor {
  private readonly logger = new Logger(CompetitorSkuEmbeddingProcessor.name);

  constructor(
    @InjectRepository(CompetitorSku)
    private readonly repo: Repository<CompetitorSku>,
    private readonly embeddings: EmbeddingsService,
  ) {}

  @Process('generate')
  async handle(job: Job<{ id: string }>): Promise<void> {
    const sku = await this.repo.findOne({
      where: { id: job.data.id },
      relations: { brand: true },
    });
    if (!sku) {
      this.logger.warn(`CompetitorSku ${job.data.id} not found — skip embedding.`);
      return;
    }

    const brandName = sku.brand?.name ?? '';
    const text = `${brandName} ${sku.name} ${sku.category ?? ''}`.trim();
    const vec = await this.embeddings.embed(text);
    if (!vec) return;

    await this.repo.update(sku.id, { embedding: JSON.stringify(vec) });
  }
}
