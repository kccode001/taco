/**
 * Generate text-embedding-3-large embeddings for every active TACO SKU and
 * persist them on `taco_skus.embedding` (JSON-encoded float[] as text).
 *
 * RAG-ready: invoice OCR will pull top-N nearest SKUs by cosine similarity
 * instead of stuffing all 965 rows into the Claude prompt.
 *
 * Idempotent: re-running overwrites embeddings. Pass `--missing-only` to skip
 * SKUs that already have an embedding.
 *
 * Run:
 *   OPENAI_API_KEY=... npm run seed:taco-sku-embeddings
 *   OPENAI_API_KEY=... npm run seed:taco-sku-embeddings -- --missing-only
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
dotenv.config();

import { TacoSku } from '../entities/taco-sku.entity';

const EMBEDDING_MODEL = 'text-embedding-3-large';
const BATCH_SIZE = 64;
const RETRIES = 3;

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [TacoSku],
  synchronize: false,
});

function composeText(sku: TacoSku): string {
  const synonyms = (sku.product_name_aliases ?? []).filter(Boolean);
  const unitAliases = (sku.unit_aliases ?? []).filter(Boolean);
  const category = sku.catalog_category ?? sku.category ?? 'Lainnya';
  return [
    `${sku.name}.`,
    `Aliases: ${synonyms.join(', ') || '-'}.`,
    `Category: ${category}.`,
    `Unit: ${sku.unit ?? sku.uom}, ${unitAliases.join(', ') || '-'}.`,
    `Price range Rp ${sku.min_price}-${sku.max_price}.`,
  ].join(' ');
}

async function embedBatch(client: OpenAI, texts: string[]): Promise<number[][]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
      });
      return res.data.map((d) => d.embedding);
    } catch (err) {
      lastErr = err;
      const delay = 1000 * Math.pow(2, attempt);
      console.warn(`Embedding batch failed (attempt ${attempt + 1}/${RETRIES}); retrying in ${delay}ms — ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function main() {
  const missingOnly = process.argv.includes('--missing-only');

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to run the embedding backfill.');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  await ds.initialize();

  const repo = ds.getRepository(TacoSku);
  const qb = repo.createQueryBuilder('s').where('s.is_active = true');
  if (missingOnly) {
    qb.andWhere('s.embedding IS NULL');
  }
  const skus = await qb.orderBy('s.code', 'ASC').getMany();
  console.log(`Found ${skus.length} SKUs to embed (missingOnly=${missingOnly}).`);

  let done = 0;
  for (let i = 0; i < skus.length; i += BATCH_SIZE) {
    const batch = skus.slice(i, i + BATCH_SIZE);
    const texts = batch.map(composeText);

    const vectors = await embedBatch(client, texts);
    if (vectors.length !== batch.length) {
      throw new Error(
        `Embedding count mismatch: requested ${batch.length}, received ${vectors.length}`,
      );
    }

    for (let j = 0; j < batch.length; j++) {
      await repo.update(batch[j].id, { embedding: JSON.stringify(vectors[j]) });
    }
    done += batch.length;
    console.log(`  embedded ${done}/${skus.length} (last: ${batch[batch.length - 1].code})`);
  }

  console.log(`Done — embedded ${done} SKUs.`);
  await ds.destroy();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
