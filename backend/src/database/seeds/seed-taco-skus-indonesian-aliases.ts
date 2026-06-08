/**
 * One-time backfill: append Indonesian-language aliases to TACO SKUs whose
 * English names map to common Bahasa terms found on supplier invoices.
 *
 * Why — KC noticed lines like "Engsel Taco Lurus" or "Rel DT. Push on Taco
 * 50cm" weren't matching even though the catalog has Hinge / Drawer Slide
 * entries. The cosine similarity between Indonesian raw text and the English
 * SKU description is too weak (~0.4) to clear the OCR mapping threshold.
 *
 * Strategy — name-keyword → Indonesian alias map. For each active SKU whose
 * `name` contains the English keyword, append the Indonesian alias (and the
 * raw-text form combined with "TACO") to `product_name_aliases`. Already-
 * present aliases are skipped case-insensitively so re-runs are idempotent.
 *
 * After backfill, every touched SKU is re-embedded via the same Bull queue
 * the OCR processor uses, so RAG rescoring sees the new aliases without
 * a server restart.
 *
 * Run:
 *   OPENAI_API_KEY=... npm run seed:taco-skus-indonesian-aliases
 *   OPENAI_API_KEY=... npm run seed:taco-skus-indonesian-aliases -- --dry-run
 *   OPENAI_API_KEY=... npm run seed:taco-skus-indonesian-aliases -- --skip-embed
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
dotenv.config();

import { TacoSku } from '../entities/taco-sku.entity';

const EMBEDDING_MODEL = 'text-embedding-3-large';

/**
 * Each mapping fires when ANY keyword (case-insensitive substring) appears in
 * the SKU name. All aliases in the entry are appended verbatim — typically
 * a Bahasa noun plus 1-2 raw-text variants ("TACO {alias}", "{alias} Taco").
 */
interface KeywordMap {
  /** Case-insensitive substrings to look for in `sku.name`. */
  keywords: string[];
  /** Aliases to append. Often: Bahasa term + "TACO {term}" + raw-text variants. */
  aliases: string[];
  /** Optional category gate to avoid false positives. */
  catalogCategory?: string;
}

const MAP: KeywordMap[] = [
  // --- Hinges ("Engsel") ---
  {
    keywords: ['Hinge'],
    aliases: ['Engsel', 'Engsel TACO', 'TACO Engsel', 'Engsel Lurus', 'Engsel Taco Lurus'],
    catalogCategory: 'Hardware',
  },

  // --- Drawer slides / rails ("Rel") ---
  {
    keywords: ['Drawer Slide', 'Ball Bearing Slide', 'Standard Glide', 'Drawer Box'],
    aliases: ['Rel', 'Rel TACO', 'TACO Rel', 'Rel Laci', 'Rel DT', 'Rel DT TACO', 'Rel Push on TACO', 'Rel Push On'],
    catalogCategory: 'Hardware',
  },

  // --- Undermount slide (same Rel family) ---
  {
    keywords: ['Undermount Slide'],
    aliases: ['Rel Undermount', 'Rel Bawah TACO', 'Rel TACO Undermount'],
    catalogCategory: 'Hardware',
  },

  // --- Aluminium handles ("Handle"/"Tarikan") ---
  {
    keywords: ['Aluminium Handle'],
    aliases: ['Handle', 'Tarikan', 'Tarikan Pintu', 'TACO Handle', 'Handle TACO'],
    catalogCategory: 'Hardware',
  },

  // --- Lock ("Kunci") ---
  {
    keywords: ['Lock', 'Camlock'],
    aliases: ['Kunci', 'Kunci Laci', 'TACO Kunci'],
    catalogCategory: 'Hardware',
  },

  // --- LED strip ("Lampu LED") ---
  {
    keywords: ['LED Strip'],
    aliases: ['Lampu LED', 'LED TACO', 'Strip LED'],
    catalogCategory: 'Hardware',
  },

  // --- Gas Spring ("Hidrolik") ---
  {
    keywords: ['Gas Spring'],
    aliases: ['Hidrolik', 'Gas Spring TACO', 'TACO Hidrolik'],
    catalogCategory: 'Hardware',
  },

  // --- Aluminium edging / frame / shelf — general aluminium hardware terms ---
  {
    keywords: ['Aluminium Edging'],
    aliases: ['List Aluminium', 'Edging Aluminium', 'Edging TACO'],
    catalogCategory: 'Hardware',
  },
  {
    keywords: ['Aluminium Frame'],
    aliases: ['Frame Aluminium', 'Rangka Aluminium', 'TACO Frame'],
    catalogCategory: 'Hardware',
  },
  {
    keywords: ['Aluminium List'],
    aliases: ['List Aluminium', 'Lis Aluminium', 'TACO List'],
    catalogCategory: 'Hardware',
  },
  {
    keywords: ['Aluminium Shelf'],
    aliases: ['Rak Aluminium', 'Shelf TACO', 'TACO Shelf'],
    catalogCategory: 'Hardware',
  },

  // --- Pipes & brackets (less common on invoices) ---
  {
    keywords: ['Bracket'],
    aliases: ['Braket', 'Bracket TACO'],
    catalogCategory: 'Hardware',
  },
  {
    keywords: ['Stainless Pipe', 'Oval Stainless Pipe'],
    aliases: ['Pipa Stainless', 'Pipa SS'],
    catalogCategory: 'Hardware',
  },

  // --- HPL / Laminate sheets ---
  {
    keywords: ['TACO HPL Standard', 'HPL'],
    aliases: ['HPL', 'HPL TACO', 'TACO HPL', 'Laminate', 'Laminate TACO'],
    catalogCategory: 'Laminates',
  },

  // --- PVC Edging ---
  {
    keywords: ['PVC Edging'],
    aliases: ['Edging PVC', 'Tepi Laminate', 'List PVC', 'TACO Edging PVC'],
  },

  // --- Flooring ---
  {
    keywords: ['Flooring', 'SPC', 'Vinyl'],
    aliases: ['Lantai', 'Lantai TACO', 'TACO Lantai', 'Vinyl TACO'],
    catalogCategory: 'Flooring',
  },

  // --- Wall panels (FIDECO) ---
  {
    keywords: ['Wall Panel', 'Linen', 'Trofeo'],
    aliases: ['Panel Dinding', 'Panel TACO', 'TACO Panel'],
    catalogCategory: 'FIDECO',
  },
];

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [TacoSku],
  synchronize: false,
});

function pickAliasesFor(sku: TacoSku): string[] {
  const name = sku.name?.toLowerCase() ?? '';
  if (!name) return [];
  const added: string[] = [];
  for (const m of MAP) {
    if (m.catalogCategory && sku.catalog_category !== m.catalogCategory) continue;
    const hits = m.keywords.some((k) => name.includes(k.toLowerCase()));
    if (!hits) continue;
    for (const a of m.aliases) {
      if (a && !added.includes(a)) added.push(a);
    }
  }
  return added;
}

async function embedSku(client: OpenAI, sku: TacoSku): Promise<number[] | null> {
  // Same composition as composeTacoSkuEmbeddingText() in the runtime processor
  // — keeps OCR-time + backfill-time text identical so cosine similarity is
  // meaningful.
  const aliases = (sku.product_name_aliases ?? []).join(', ') || '(none)';
  const unitAliases = (sku.unit_aliases ?? []).join(', ') || '(none)';
  const category = sku.catalog_category ?? sku.category ?? '(uncategorized)';
  const unit = sku.unit ?? sku.uom ?? '(unspecified)';
  const text = `${sku.name}. Aliases: ${aliases}. Category: ${category}. Unit: ${unit}, ${unitAliases}. Price range Rp ${sku.min_price}-${sku.max_price}.`;
  const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return res.data[0]?.embedding ?? null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const skipEmbed = process.argv.includes('--skip-embed');

  if (!dryRun && !skipEmbed && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to re-embed touched SKUs. Pass --skip-embed to defer.');
  }

  await ds.initialize();
  const repo = ds.getRepository(TacoSku);
  const all = await repo.find({ where: { is_active: true } });

  let touched = 0;
  let aliasAdds = 0;
  const touchedSkus: TacoSku[] = [];

  for (const sku of all) {
    const candidate = pickAliasesFor(sku);
    if (candidate.length === 0) continue;

    const existing = sku.product_name_aliases ?? [];
    const existingLower = new Set(existing.map((s) => s.toLowerCase()));
    const adds: string[] = [];
    for (const a of candidate) {
      if (!existingLower.has(a.toLowerCase())) {
        adds.push(a);
        existingLower.add(a.toLowerCase());
      }
    }
    if (adds.length === 0) continue;

    const next = [...existing, ...adds];
    touched++;
    aliasAdds += adds.length;
    if (!dryRun) {
      await repo.update(sku.id, { product_name_aliases: next });
      sku.product_name_aliases = next;
      touchedSkus.push(sku);
    }
    console.log(`  + ${sku.code.padEnd(10)} ${sku.name} ← [${adds.join(', ')}]`);
  }

  console.log(`\nTouched ${touched} SKUs, added ${aliasAdds} aliases.`);

  if (dryRun) {
    console.log('Dry-run — no DB writes.');
    await ds.destroy();
    return;
  }

  if (skipEmbed) {
    console.log('Skipping embedding regeneration (--skip-embed).');
    await ds.destroy();
    return;
  }

  console.log(`\nRe-embedding ${touchedSkus.length} touched SKUs…`);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let done = 0;
  for (const sku of touchedSkus) {
    try {
      const vec = await embedSku(client, sku);
      if (vec) {
        await repo.update(sku.id, { embedding: JSON.stringify(vec) });
      }
      done++;
      if (done % 10 === 0) console.log(`  re-embedded ${done}/${touchedSkus.length}`);
    } catch (e) {
      console.warn(`  embed failed for ${sku.code}: ${(e as Error).message}`);
    }
  }
  console.log(`Re-embedded ${done}/${touchedSkus.length} SKUs.`);

  await ds.destroy();
}

main().catch((err) => {
  console.error('Indonesian aliases backfill failed:', err);
  process.exit(1);
});
