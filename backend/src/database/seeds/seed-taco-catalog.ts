import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

import {
  TacoSku,
  TacoSkuCategory,
  normalizeTacoSkuCategory,
} from '../entities/taco-sku.entity';

/**
 * Seed / re-seed the TACO SKU master from `taco-catalog.md`.
 *
 * - Idempotent: upserts by `code`.
 * - Parses pipe-delimited markdown table.
 * - Splits "Product Name Alias / Synonym" comma-separated → product_name_aliases[].
 * - Splits "Unit Alias / Synonym" comma-separated → unit_aliases[].
 * - Maps Category → 9-cat enum via existing normalizer (FIDECO/Flooring/Hardware/Laminates).
 * - Persists min/max/avg prices as integer Rupiah.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' \
 *     -r tsconfig-paths/register src/database/seeds/seed-taco-catalog.ts
 *
 *   Optional env: CATALOG_PATH=/abs/path/to/taco-catalog.md
 */

const CATALOG_PATH =
  process.env.CATALOG_PATH ??
  path.resolve(__dirname, '../../../../taco-catalog.md');

// Catalog category (column 1 of the .md) → TacoSkuCategory enum (9-cat).
// The catalog only has FIDECO / Flooring / Hardware / Laminates today; everything
// else falls back to LAINNYA so nothing is dropped on the floor.
const CATEGORY_TO_ENUM: Record<string, TacoSkuCategory> = {
  fideco: TacoSkuCategory.SHEET, // panel/board sheet goods
  flooring: TacoSkuCategory.VINYL, // catalog flooring rows are LVT/LVP vinyl
  hardware: TacoSkuCategory.HARDWARE,
  laminates: TacoSkuCategory.LAMINATE,
};

interface CatalogRow {
  category: string;
  sku: string;
  name: string;
  aliases: string[];
  unit: string;
  unit_aliases: string[];
  min_price: number;
  max_price: number;
  avg_price: number;
}

function parseInt0(raw: string): number {
  const n = parseInt(raw.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseCatalog(md: string): CatalogRow[] {
  const rows: CatalogRow[] = [];
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 9) continue;
    if (cells[0].toLowerCase() === 'category') continue; // header
    if (cells[0].startsWith('---')) continue; // separator
    const [category, sku, name, aliasesRaw, unit, unitAliasesRaw, minRaw, maxRaw, avgRaw] = cells;
    if (!sku || !name) continue;
    rows.push({
      category,
      sku,
      name,
      aliases: aliasesRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      unit,
      unit_aliases: unitAliasesRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      min_price: parseInt0(minRaw),
      max_price: parseInt0(maxRaw),
      avg_price: parseInt0(avgRaw),
    });
  }
  return rows;
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`Catalog file not found: ${CATALOG_PATH}`);
  }
  const md = fs.readFileSync(CATALOG_PATH, 'utf-8');
  const rows = parseCatalog(md);
  console.log(`Parsed ${rows.length} catalog rows from ${CATALOG_PATH}`);

  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [TacoSku],
    synchronize: false,
  });
  await ds.initialize();
  const repo = ds.getRepository(TacoSku);

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const catalogCat = row.category.trim();
    const enumCat =
      normalizeTacoSkuCategory(catalogCat) ?? CATEGORY_TO_ENUM[catalogCat.toLowerCase()] ?? TacoSkuCategory.LAINNYA;
    const prefix = row.sku.split(/\s+/)[0];

    const existing = await repo.findOne({ where: { code: row.sku } });
    const payload: Partial<TacoSku> = {
      code: row.sku,
      name: row.name,
      category: enumCat,
      catalog_category: catalogCat,
      sku_prefix: prefix,
      product_name_aliases: row.aliases,
      unit: row.unit,
      unit_aliases: row.unit_aliases,
      min_price: row.min_price,
      max_price: row.max_price,
      avg_price: row.avg_price,
      standard_price: row.avg_price, // keep legacy field in sync
      uom: row.unit?.toLowerCase() || 'pcs',
      is_active: true,
    };
    if (existing) {
      await repo.update({ id: existing.id }, payload);
      updated++;
    } else {
      await repo.save(repo.create(payload));
      inserted++;
    }
  }

  const total = await repo.count();
  console.log(`Seed complete — inserted=${inserted} updated=${updated} total=${total}`);

  // Spot check a couple of SKUs.
  const spot = await repo.findOne({ where: { code: 'FDB 8301 E' } });
  if (spot) {
    console.log(
      `Spot check FDB 8301 E → synonyms=${spot.product_name_aliases.length}, unit_synonyms=${spot.unit_aliases.length}, prices=${spot.min_price}/${spot.avg_price}/${spot.max_price}`,
    );
  }
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
