import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { parse } from 'csv-parse/sync';
import {
  TacoSku,
  TacoSkuCategory,
  normalizeTacoSkuCategory,
} from '../database/entities/taco-sku.entity';
import { CreateTacoSkuDto } from './dto/create-taco-sku.dto';
import { UpdateTacoSkuDto } from './dto/update-taco-sku.dto';
import { SkuQueryDto } from './dto/sku-query.dto';
import { SkuEmbeddingCache } from '../embeddings/sku-embedding-cache.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';

export interface BulkImportRowResult {
  row: number;
  ok: boolean;
  action?: 'insert' | 'update' | 'skip';
  code?: string;
  name?: string;
  category?: TacoSkuCategory;
  standard_price?: number;
  uom?: string;
  errors?: string[];
}

export interface BulkImportResult {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  inserted: number;
  updated: number;
  rows: BulkImportRowResult[];
}

@Injectable()
export class TacoSkusService {
  private readonly logger = new Logger(TacoSkusService.name);

  constructor(
    @InjectRepository(TacoSku)
    private readonly tacoSkusRepo: Repository<TacoSku>,
    private readonly skuCache: SkuEmbeddingCache,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async findAll(query: SkuQueryDto): Promise<TacoSku[]> {
    const qb = this.tacoSkusRepo
      .createQueryBuilder('sku')
      .where('sku.is_active = :active', { active: true });

    if (query.category) {
      const norm = normalizeTacoSkuCategory(query.category) ?? query.category;
      qb.andWhere('sku.category = :cat', { cat: norm });
    }

    if (query.search) {
      qb.andWhere(
        '(sku.name ILIKE :search OR sku.code ILIKE :search OR sku.category::text ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    return qb.orderBy('sku.name', 'ASC').getMany();
  }

  async findOne(id: string): Promise<TacoSku> {
    const sku = await this.tacoSkusRepo.findOne({ where: { id } });
    if (!sku) throw new NotFoundException(`TacoSku ${id} not found`);
    return sku;
  }

  async create(dto: CreateTacoSkuDto): Promise<TacoSku> {
    const avg = dto.avg_price ?? dto.standard_price ?? 0;
    const sku = this.tacoSkusRepo.create({
      code: dto.code,
      name: dto.name,
      category: dto.category,
      catalog_category: dto.catalog_category ?? null,
      unit: dto.unit ?? null,
      product_name_aliases: dto.product_name_aliases ?? [],
      unit_aliases: dto.unit_aliases ?? [],
      min_price: dto.min_price ?? 0,
      max_price: dto.max_price ?? 0,
      avg_price: avg,
      standard_price: dto.standard_price ?? avg,
      uom: dto.uom || 'pcs',
    });

    const saved = await this.tacoSkusRepo.save(sku);
    this.skuCache.invalidate().catch(() => {});
    // KC directive: every create embeds. No manual status, no pending state.
    await this.queueEmbedding(saved.id);
    return saved;
  }

  /**
   * Bulk import TACO SKUs from CSV. AC-21 — TACO SKU master drives OCR matching.
   * Modes:
   *   dryRun=true  — validate every row, return per-row report, no DB writes
   *   dryRun=false — validate + upsert by `code`, return per-row report + counts
   *
   * Required columns: code, name, category, standard_price
   * Optional:        uom
   *
   * Category is normalized against the 9-category enum (LAMINATE, HPL, ECO_HPL,
   * SHEET, EDGING, HARDWARE, VINYL, PLYWOOD, LAINNYA). Aliases like "Eco HPL"
   * and "eco-hpl" map to ECO_HPL.
   */
  async bulkImport(csvContent: string, dryRun: boolean): Promise<BulkImportResult> {
    let records: Record<string, string>[];
    try {
      records = parse(csvContent, {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, string>[];
    } catch (err) {
      return {
        dryRun,
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        inserted: 0,
        updated: 0,
        rows: [
          {
            row: 0,
            ok: false,
            errors: [`CSV parse failed: ${err instanceof Error ? err.message : 'unknown'}`],
          },
        ],
      };
    }

    const rows: BulkImportRowResult[] = [];
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const rowNum = i + 2; // header on row 1
      const errors: string[] = [];

      const code = (r.code || '').trim();
      const name = (r.name || '').trim();
      const rawCategory = (r.category || '').trim();
      const rawPrice = (r.standard_price || '').trim();
      const uom = (r.uom || 'pcs').trim();

      if (!code) errors.push('code is required');
      if (!name) errors.push('name is required');
      if (!rawCategory) errors.push('category is required');

      const category = normalizeTacoSkuCategory(rawCategory);
      if (rawCategory && !category) {
        errors.push(
          `category "${rawCategory}" is not one of the 9 supported categories`,
        );
      }

      const price = parseFloat(rawPrice);
      if (!rawPrice || Number.isNaN(price)) {
        errors.push(`standard_price "${rawPrice}" is not a valid number`);
      }

      if (errors.length > 0) {
        rows.push({ row: rowNum, ok: false, code, name, errors });
        continue;
      }

      let action: 'insert' | 'update' = 'insert';
      if (!dryRun) {
        const existing = await this.tacoSkusRepo.findOne({ where: { code } });
        if (existing) {
          existing.name = name;
          existing.category = category!;
          existing.standard_price = price;
          existing.uom = uom;
          const saved = await this.tacoSkusRepo.save(existing);
          action = 'update';
          updated++;
          await this.queueEmbedding(saved.id);
        } else {
          const sku = this.tacoSkusRepo.create({
            code,
            name,
            category: category!,
            standard_price: price,
            uom,
          });
          const saved = await this.tacoSkusRepo.save(sku);
          action = 'insert';
          inserted++;
          await this.queueEmbedding(saved.id);
        }
      } else {
        const existing = await this.tacoSkusRepo.findOne({ where: { code } });
        action = existing ? 'update' : 'insert';
      }

      rows.push({
        row: rowNum,
        ok: true,
        action,
        code,
        name,
        category: category!,
        standard_price: price,
        uom,
      });
    }

    const validRows = rows.filter((r) => r.ok).length;

    return {
      dryRun,
      totalRows: records.length,
      validRows,
      invalidRows: rows.length - validRows,
      inserted,
      updated,
      rows,
    };
  }

  async update(id: string, dto: UpdateTacoSkuDto): Promise<TacoSku> {
    const sku = await this.findOne(id);

    Object.assign(sku, dto);
    const saved = await this.tacoSkusRepo.save(sku);

    // KC directive: every edit re-embeds. The embedding text composes name +
    // aliases + category + unit + price band, so any patch can shift the vector
    // — always re-queue, never inspect which field changed.
    await this.queueEmbedding(saved.id);

    // Any update could change prompt-visible fields (name, aliases, price band,
    // unit, etc.) — invalidate the cache so the next OCR job sees fresh data.
    this.skuCache.invalidate().catch(() => {});
    return saved;
  }

  async remove(id: string): Promise<void> {
    const sku = await this.findOne(id);
    await this.tacoSkusRepo.remove(sku);
    this.skuCache.invalidate().catch(() => {});
  }

  /**
   * Enqueue a re-embed job for the given SKU. Single source of truth — every
   * create/update/bulk-import row routes through here. The worker
   * (`TacoSkuEmbeddingProcessor`) composes the canonical text (name + aliases
   * + catalog_category + unit + price band), calls OpenAI, persists the new
   * vector, and invalidates the OCR cache.
   *
   * Never throws — embedding is best-effort and must not block a SKU write.
   */
  private async queueEmbedding(id: string): Promise<void> {
    try {
      await this.embeddings.enqueueTacoSku(id);
      this.logger.log(`Queued embedding refresh for taco_sku ${id}`);
    } catch (err) {
      this.logger.error(
        `Failed to enqueue embedding for taco_sku ${id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
