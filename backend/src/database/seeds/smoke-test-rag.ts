/**
 * RAG smoke test: pick FDB 8301 E ("Linen Beige") and a fake OCR raw_text,
 * then print the top-N nearest SKUs by cosine. Verifies the backfill landed
 * meaningful embeddings.
 *
 * Run: OPENAI_API_KEY=... npx ts-node -r tsconfig-paths/register \
 *      src/database/seeds/smoke-test-rag.ts
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
dotenv.config();

import { TacoSku } from '../entities/taco-sku.entity';
import { cosine, parseEmbedding } from '../../embeddings/similarity';

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [TacoSku],
  synchronize: false,
});

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  await ds.initialize();
  const repo = ds.getRepository(TacoSku);
  const all = await repo.find({ where: { is_active: true } });
  console.log(`Loaded ${all.length} SKUs (${all.filter((s) => !!s.embedding).length} with embedding).`);

  const probes = [
    'Linen Beige FDB 8301 panel kayu wall',
    'TH 226 AC laminate edging strip',
    'TH 5037 NT decorative HPL sheet',
    'FDB 8301 E',
  ];

  for (const probeText of probes) {
    const probeRes = await client.embeddings.create({
      model: 'text-embedding-3-large',
      input: probeText,
    });
    const probeVec = probeRes.data[0].embedding;

    const scored: Array<{ code: string; name: string; score: number }> = [];
    for (const sku of all) {
      const v = parseEmbedding(sku.embedding);
      if (!v) continue;
      scored.push({ code: sku.code, name: sku.name, score: cosine(probeVec, v) });
    }
    scored.sort((a, b) => b.score - a.score);

    console.log(`\nProbe: "${probeText}"  →  top 5:`);
    for (const row of scored.slice(0, 5)) {
      console.log(`  ${row.score.toFixed(3)}  ${row.code.padEnd(14)} | ${row.name}`);
    }
  }

  await ds.destroy();
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
