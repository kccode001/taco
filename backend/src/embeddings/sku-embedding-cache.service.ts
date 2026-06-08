import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { parseEmbedding } from './similarity';

/**
 * Cached, pre-parsed TacoSku embeddings + lightweight projection of the
 * fields the OCR processor needs to build its prompt. Loading and JSON-parsing
 * 965 × 3072-dim vectors on every OCR job was the dominant overhead — this
 * service does it once on startup and refreshes when SKUs change.
 *
 * Refresh is opt-in (call `invalidate()` after any TACO SKU CRUD). If a CRUD
 * path is missed the cache will simply be stale; a server restart resets it.
 */
export interface CachedSku {
  id: string;
  code: string;
  name: string;
  catalog_category: string | null;
  product_name_aliases: string[];
  unit: string | null;
  unit_aliases: string[];
  min_price: number;
  max_price: number;
  avg_price: number;
  /** null when no embedding was generated for this SKU yet. */
  vec: number[] | null;
  /** Pre-computed L2 norm for fast cosine similarity. */
  norm: number;
}

@Injectable()
export class SkuEmbeddingCache implements OnModuleInit {
  private readonly logger = new Logger(SkuEmbeddingCache.name);
  private cached: CachedSku[] = [];
  private loadedAt: number = 0;
  private loadingPromise: Promise<void> | null = null;

  constructor(
    @InjectRepository(TacoSku)
    private readonly repo: Repository<TacoSku>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Warm the cache asynchronously so app startup isn't blocked if the DB is
    // slow. Subsequent calls await loadingPromise.
    this.loadingPromise = this.reload().catch((e) => {
      this.logger.warn(`Initial SKU cache load failed: ${(e as Error).message}`);
    });
  }

  /** Force a reload from DB. Call after any TACO SKU create/update/delete. */
  async invalidate(): Promise<void> {
    this.loadingPromise = this.reload();
    await this.loadingPromise;
  }

  /** Returns the cached SKUs, awaiting initial load if needed. */
  async getAll(): Promise<CachedSku[]> {
    if (this.loadingPromise) await this.loadingPromise;
    return this.cached;
  }

  /** Returns only SKUs that have a usable embedding vector. */
  async getWithEmbeddings(): Promise<CachedSku[]> {
    const all = await this.getAll();
    return all.filter((s) => s.vec !== null);
  }

  /** Diagnostic: number of cached SKUs + when they were loaded. */
  stats(): { count: number; loadedAt: number; withEmbeddings: number } {
    return {
      count: this.cached.length,
      loadedAt: this.loadedAt,
      withEmbeddings: this.cached.filter((s) => s.vec !== null).length,
    };
  }

  private async reload(): Promise<void> {
    const t0 = Date.now();
    const rows = await this.repo.find({
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
    const next: CachedSku[] = rows.map((r) => {
      const vec = parseEmbedding(r.embedding);
      let norm = 0;
      if (vec) {
        let s = 0;
        for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
        norm = Math.sqrt(s);
      }
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        catalog_category: r.catalog_category,
        product_name_aliases: r.product_name_aliases ?? [],
        unit: r.unit,
        unit_aliases: r.unit_aliases ?? [],
        min_price: r.min_price,
        max_price: r.max_price,
        avg_price: r.avg_price,
        vec,
        norm,
      };
    });
    this.cached = next;
    this.loadedAt = Date.now();
    const withEmb = next.filter((s) => s.vec !== null).length;
    this.logger.log(
      `Loaded ${next.length} TACO SKUs (${withEmb} with embeddings) in ${Date.now() - t0}ms`,
    );
  }
}
