import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { CompetitorSku } from '../database/entities/competitor-sku.entity';
import {
  EmbeddingsService,
  QUEUE_TACO_SKU,
  QUEUE_COMPETITOR_SKU,
} from './embeddings.service';
import { TacoSkuEmbeddingProcessor } from './taco-sku.processor';
import { CompetitorSkuEmbeddingProcessor } from './competitor-sku.processor';
import { SkuEmbeddingCache } from './sku-embedding-cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TacoSku, CompetitorSku]),
    BullModule.registerQueue(
      { name: QUEUE_TACO_SKU },
      { name: QUEUE_COMPETITOR_SKU },
    ),
  ],
  providers: [
    EmbeddingsService,
    TacoSkuEmbeddingProcessor,
    CompetitorSkuEmbeddingProcessor,
    SkuEmbeddingCache,
  ],
  exports: [EmbeddingsService, SkuEmbeddingCache],
})
export class EmbeddingsModule {}
