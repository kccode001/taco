import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import OpenAI from 'openai';

export const EMBEDDING_MODEL = 'text-embedding-3-large';
export const EMBEDDING_DIMS = 3072;

export const QUEUE_TACO_SKU = 'embeddings.taco-sku';
export const QUEUE_COMPETITOR_SKU = 'embeddings.competitor-sku';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly openai?: OpenAI;

  constructor(
    @InjectQueue(QUEUE_TACO_SKU) private readonly tacoQueue: Queue,
    @InjectQueue(QUEUE_COMPETITOR_SKU) private readonly competitorQueue: Queue,
  ) {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } else {
      this.logger.warn('OPENAI_API_KEY missing — embedding pipeline will be a no-op.');
    }
  }

  enqueueTacoSku(id: string): Promise<unknown> {
    return this.tacoQueue.add('generate', { id });
  }

  enqueueTacoSkuBatch(ids: string[]): Promise<unknown[]> {
    // Process in batches of 100 (AC: bulk import path) — BullMQ handles the
    // concurrency, we just enqueue each as its own job.
    return Promise.all(ids.map((id) => this.enqueueTacoSku(id)));
  }

  enqueueCompetitorSku(id: string): Promise<unknown> {
    return this.competitorQueue.add('generate', { id });
  }

  enqueueCompetitorSkuBatch(ids: string[]): Promise<unknown[]> {
    return Promise.all(ids.map((id) => this.enqueueCompetitorSku(id)));
  }

  /** Generate an embedding for arbitrary text. Used by OCR matching path. */
  async embed(text: string): Promise<number[] | null> {
    if (!this.openai) return null;
    const response = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0].embedding;
  }
}
