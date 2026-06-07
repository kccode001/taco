import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { parse } from 'csv-parse/sync';
import OpenAI from 'openai';
import {
  TacoSku,
  TacoSkuCategory,
  normalizeTacoSkuCategory,
} from '../database/entities/taco-sku.entity';
import { CreateTacoSkuDto } from './dto/create-taco-sku.dto';
import { UpdateTacoSkuDto } from './dto/update-taco-sku.dto';
import { SkuQueryDto } from './dto/sku-query.dto';

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
  private readonly openai?: OpenAI;

  constructor(
    @InjectRepository(TacoSku)
    private readonly tacoSkusRepo: Repository<TacoSku>,
  ) {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

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
    const sku = this.tacoSkusRepo.create({
      code: dto.code,
      name: dto.name,
      category: dto.category,
      standard_price: dto.standard_price,
      uom: dto.uom || 'pcs',
    });

    const saved = await this.tacoSkusRepo.save(sku);
    this.generateEmbedding(saved).catch((err) =>
      console.error(`Failed to generate embedding for SKU ${saved.id}:`, err),
    );
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
          this.generateEmbedding(saved).catch((err) =>
            console.error(`Embedding refresh failed for ${saved.code}:`, err),
          );
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
          this.generateEmbedding(saved).catch((err) =>
            console.error(`Embedding failed for ${saved.code}:`, err),
          );
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

    const nameChanged = dto.name !== undefined && dto.name !== sku.name;
    const categoryChanged = dto.category !== undefined && dto.category !== sku.category;

    Object.assign(sku, dto);
    const saved = await this.tacoSkusRepo.save(sku);

    if (nameChanged || categoryChanged) {
      this.generateEmbedding(saved).catch((err) =>
        console.error(`Failed to regenerate embedding for SKU ${saved.id}:`, err),
      );
    }

    return saved;
  }

  async remove(id: string): Promise<void> {
    const sku = await this.findOne(id);
    await this.tacoSkusRepo.remove(sku);
  }

  async generateEmbedding(sku: TacoSku): Promise<void> {
    if (!this.openai) return; // OPENAI_API_KEY not configured — skip silently.
    const text = `${sku.code} ${sku.name} ${sku.category}`;

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
    });

    const embedding = response.data[0].embedding;
    await this.tacoSkusRepo.update(sku.id, {
      embedding: JSON.stringify(embedding),
    });
  }
}
