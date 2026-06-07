import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { EmbeddingsService, QUEUE_TACO_SKU } from './embeddings.service';

@Processor(QUEUE_TACO_SKU)
export class TacoSkuEmbeddingProcessor {
  private readonly logger = new Logger(TacoSkuEmbeddingProcessor.name);

  constructor(
    @InjectRepository(TacoSku)
    private readonly repo: Repository<TacoSku>,
    private readonly embeddings: EmbeddingsService,
  ) {}

  @Process('generate')
  async handle(job: Job<{ id: string }>): Promise<void> {
    const sku = await this.repo.findOne({ where: { id: job.data.id } });
    if (!sku) {
      this.logger.warn(`TacoSku ${job.data.id} not found — skip embedding.`);
      return;
    }

    const text = `${sku.code} ${sku.name} ${sku.category}`;
    const vec = await this.embeddings.embed(text);
    if (!vec) return; // no API key — skip silently

    await this.repo.update(sku.id, { embedding: JSON.stringify(vec) });
  }
}
