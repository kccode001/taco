/**
 * Seed 5 adhesive SKUs (Lem Taco Active + StarMax lines) into the TACO catalog,
 * then embed them inline via OpenAI so they're immediately matchable by RAG.
 *
 * Why hardcoded — only 5 rows; `xlsx` is not in backend deps and pulling it in
 * just for one-off seeding is overkill. Source of truth is
 * `scrapes/taco/TACO_catalog_product_list_v2_ADHESIVE.xlsx` (sheet "Adhesive");
 * if KC re-runs with a different file, edit the ADHESIVE_ROWS constant below.
 *
 * Adds a new free-text catalog_category value "TACO ADHESIVE" to the
 * taco_skus.catalog_category column (no DB migration needed — the column is
 * `text`, not a Postgres enum).
 *
 * Idempotent: upserts by `code`. Re-running overwrites name/aliases/prices and
 * re-embeds.
 *
 * Run:
 *   OPENAI_API_KEY=... npm run seed:taco-adhesive-skus
 *   OPENAI_API_KEY=... npm run seed:taco-adhesive-skus -- --skip-embed
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
dotenv.config();

import { TacoSku, TacoSkuCategory } from '../entities/taco-sku.entity';

const EMBEDDING_MODEL = 'text-embedding-3-large';
const CATALOG_CATEGORY = 'TACO ADHESIVE';

// Shared aliases that ride on every Lem Taco SKU — KC's OCR feedback shows
// supplier invoices spell "Active" inconsistently ("Activ", "Aktif") and the
// generic "Lem Kuning Taco" / "Lem Taco" terms hit every variant.
const SHARED_LTA_ALIASES = [
  'Lem Taco',
  'Lem Kuning Taco',
  'Lem Taco Active',
  'Lem Taco Activ',
  'Lem Taco Aktif',
  'Lem Active',
  'Lem Activ',
  'Lem Aktif',
  'Lem Kuning',
  'Contact Cement Taco',
  'Yellow Glue Taco',
];

const SHARED_LTSM_ALIASES = [
  'Lem Taco',
  'Lem Taco StarMax',
  'Lem Taco Star Max',
  'Lem StarMax',
  'Lem Star Max',
  'Lem Taco Premium',
  'Lem Premium Taco',
  'Contact Cement StarMax',
];

interface AdhesiveRow {
  code: string;
  name: string;
  aliases: string[];
  unit: string;
  unit_aliases: string[];
  min_price: number;
  max_price: number;
  avg_price: number;
}

const ADHESIVE_ROWS: AdhesiveRow[] = [
  {
    code: 'LTA-600',
    name: 'Lem Taco Active 600 gr',
    aliases: [
      'Lem Kuning Taco 600 gram kaleng kecil',
      'Lem Taco Active 600',
      'Lem Active 600gr',
      'Lem Taco Activ 600',
      'Lem Kuning 600',
      'Lem Taco Activ',
      'LTA 600',
      'LTA600',
      ...SHARED_LTA_ALIASES,
    ],
    unit: 'PCS',
    unit_aliases: ['Kaleng', 'Can', 'kaleng', 'pcs'],
    min_price: 35000,
    max_price: 45000,
    avg_price: 40000,
  },
  {
    code: 'LTA-2500',
    name: 'Lem Taco Active 2.5 kg',
    aliases: [
      'Lem Kuning Taco 2500 gram medium serbaguna HPL vinyl',
      'Lem Taco Active 2.5kg',
      'Lem Taco Active 2500',
      'Lem Active 2.5 kg',
      'Lem Active 2500gr',
      'Lem Taco Activ 2.5kg',
      'Lem Taco Activ 2500',
      'Lem Kuning 2.5 kg',
      'Lem Kuning 2500',
      'LTA 2500',
      'LTA2500',
      ...SHARED_LTA_ALIASES,
    ],
    unit: 'PCS',
    unit_aliases: ['Kaleng', 'Can', 'Tin', 'kaleng', 'pcs'],
    min_price: 120000,
    max_price: 140000,
    avg_price: 130000,
  },
  {
    code: 'LTA-10K',
    name: 'Lem Taco Active 10 kg',
    aliases: [
      'Lem Kuning Taco 10 kilogram kaleng besar bulk contact cement',
      'Lem Taco Active 10kg',
      'Lem Taco Active 10 kg',
      'Lem Active 10 kg',
      'Lem Active 10kg',
      'Lem Taco Activ 10kg',
      'Lem Taco Aktif 10kg',
      'Lem Kuning 10 kg',
      'Lem Kuning 10kg',
      'LTA 10K',
      'LTA10K',
      'LTA-10kg',
      ...SHARED_LTA_ALIASES,
    ],
    unit: 'PCS',
    unit_aliases: ['Kaleng', 'Pail', 'Can', 'kaleng', 'pail', 'pcs'],
    min_price: 450000,
    max_price: 480000,
    avg_price: 465000,
  },
  {
    code: 'LTSM-2500',
    name: 'Lem Taco StarMax Serba Guna 2.5 kg',
    aliases: [
      'Lem Taco Premium StarMax 2500gr lebih kental pekat',
      'Lem Taco StarMax 2.5kg',
      'Lem Taco StarMax 2500',
      'Lem StarMax 2.5kg',
      'Lem StarMax 2500',
      'Lem Taco Star Max 2.5kg',
      'Lem Taco StarMax Serbaguna 2.5kg',
      'LTSM 2500',
      'LTSM2500',
      ...SHARED_LTSM_ALIASES,
    ],
    unit: 'PCS',
    unit_aliases: ['Kaleng', 'Tin', 'kaleng', 'pcs'],
    min_price: 145000,
    max_price: 165000,
    avg_price: 155000,
  },
  {
    code: 'LTSM-10K',
    name: 'Lem Taco StarMax Serba Guna 10 kg',
    aliases: [
      'Lem Taco Premium StarMax 10kg multi material HPL plywood SPC PVC',
      'Lem Taco StarMax 10kg',
      'Lem Taco StarMax 10 kg',
      'Lem StarMax 10kg',
      'Lem StarMax 10 kg',
      'Lem Taco Star Max 10kg',
      'Lem Taco StarMax Serbaguna 10kg',
      'LTSM 10K',
      'LTSM10K',
      'LTSM-10kg',
      ...SHARED_LTSM_ALIASES,
    ],
    unit: 'PCS',
    unit_aliases: ['Kaleng', 'Pail', 'kaleng', 'pail', 'pcs'],
    min_price: 510000,
    max_price: 555000,
    avg_price: 530000,
  },
];

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [TacoSku],
  synchronize: false,
});

function dedupePreserveCase(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  return out;
}

function composeEmbeddingText(sku: TacoSku): string {
  // Mirror composeTacoSkuEmbeddingText() in the runtime processor so cosine
  // similarity between OCR-time text and stored vector stays meaningful.
  const aliases = (sku.product_name_aliases ?? []).join(', ') || '(none)';
  const unitAliases = (sku.unit_aliases ?? []).join(', ') || '(none)';
  const category = sku.catalog_category ?? sku.category ?? '(uncategorized)';
  const unit = sku.unit ?? sku.uom ?? '(unspecified)';
  return `${sku.name}. Aliases: ${aliases}. Category: ${category}. Unit: ${unit}, ${unitAliases}. Price range Rp ${sku.min_price}-${sku.max_price}.`;
}

async function main() {
  const skipEmbed = process.argv.includes('--skip-embed');

  if (!skipEmbed && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to embed the new SKUs. Pass --skip-embed to defer.');
  }

  await ds.initialize();
  const repo = ds.getRepository(TacoSku);

  let inserted = 0;
  let updated = 0;
  const savedSkus: TacoSku[] = [];

  for (const row of ADHESIVE_ROWS) {
    const aliases = dedupePreserveCase(row.aliases);
    const unitAliases = dedupePreserveCase(row.unit_aliases);
    const existing = await repo.findOne({ where: { code: row.code } });

    const payload: Partial<TacoSku> = {
      code: row.code,
      name: row.name,
      // Survey 9-cat grouping: adhesive doesn't fit any of the 9 buckets,
      // so park it in LAINNYA — D3 stock-level cards stay unaffected.
      category: TacoSkuCategory.LAINNYA,
      catalog_category: CATALOG_CATEGORY,
      sku_prefix: row.code.split('-')[0],
      product_name_aliases: aliases,
      unit: row.unit,
      unit_aliases: unitAliases,
      min_price: row.min_price,
      max_price: row.max_price,
      avg_price: row.avg_price,
      standard_price: row.avg_price,
      uom: row.unit.toLowerCase(),
      is_active: true,
    };

    let saved: TacoSku;
    if (existing) {
      await repo.update({ id: existing.id }, payload);
      saved = (await repo.findOne({ where: { id: existing.id } }))!;
      updated++;
    } else {
      saved = await repo.save(repo.create(payload));
      inserted++;
    }
    savedSkus.push(saved);
    console.log(
      `  ${existing ? '~' : '+'} ${saved.code.padEnd(10)} ${saved.name} — aliases=${saved.product_name_aliases.length} unit_aliases=${saved.unit_aliases.length}`,
    );
  }

  console.log(`\nUpsert complete — inserted=${inserted} updated=${updated} total_seeded=${savedSkus.length}`);

  if (skipEmbed) {
    console.log('Skipping embedding generation (--skip-embed).');
    await ds.destroy();
    return;
  }

  console.log(`\nEmbedding ${savedSkus.length} SKUs via ${EMBEDDING_MODEL}…`);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let embedded = 0;
  for (const sku of savedSkus) {
    const text = composeEmbeddingText(sku);
    try {
      const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text });
      const vec = res.data[0]?.embedding;
      if (!vec) {
        console.warn(`  ! ${sku.code}: empty embedding response`);
        continue;
      }
      await repo.update(sku.id, { embedding: JSON.stringify(vec) });
      embedded++;
      console.log(`  ✓ ${sku.code.padEnd(10)} dims=${vec.length}`);
    } catch (err) {
      console.warn(`  ! ${sku.code}: embed failed — ${(err as Error).message}`);
    }
  }
  console.log(`\nEmbedded ${embedded}/${savedSkus.length} SKUs.`);

  const total = await repo.count();
  console.log(`taco_skus total rows now: ${total}`);

  await ds.destroy();
}

main().catch((err) => {
  console.error('Adhesive seed failed:', err);
  process.exit(1);
});
