/**
 * Wipe Taro invoice transactional data for a clean demo state.
 *
 * Deletes (in FK-safe order):
 *   1. taro_invoice_recommendations
 *   2. taro_invoice_sku_corrections
 *   3. taro_invoice_line_items
 *   4. taro_invoices
 *   5. taro_mapping_rules
 *
 * Wrapped in a transaction; logs row counts before/after.
 *
 * Preserves master data:
 *   - taco_skus (catalog + embeddings)
 *   - regions (5 regions + 5 BUs + 18 ASM areas)
 *   - users + taro_agent_regions (sales agents)
 *
 * Run: npm run seed:clear-taro-data
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const TXN_TABLES = [
  'taro_invoice_recommendations',
  'taro_invoice_sku_corrections',
  'taro_invoice_line_items',
  'taro_invoices',
  'taro_mapping_rules',
] as const;

const MASTER_TABLES = [
  'taco_skus',
  'regions',
  'users',
  'taro_agent_regions',
] as const;

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // No entities — using raw SQL only. Skip TypeORM metadata so the script
  // does not error if entity files drift from the schema.
  entities: [],
  synchronize: false,
});

async function countRows(
  runner: { query: (sql: string) => Promise<any> },
  tables: readonly string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) {
    try {
      const rows = await runner.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
      out[t] = rows?.[0]?.n ?? 0;
    } catch (err: any) {
      out[t] = -1;
      console.warn(`  (skip) ${t}: ${err.message}`);
    }
  }
  return out;
}

function fmt(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([t, n]) => `    ${t.padEnd(36)} ${n}`)
    .join('\n');
}

async function main() {
  await ds.initialize();
  console.log('Connected to', process.env.DATABASE_URL?.replace(/:[^@]+@/, ':***@'));

  console.log('\nPre-wipe transactional counts:');
  const before = await countRows(ds, TXN_TABLES);
  console.log(fmt(before));

  console.log('\nPre-wipe master counts (should remain unchanged):');
  const masterBefore = await countRows(ds, MASTER_TABLES);
  console.log(fmt(masterBefore));

  console.log('\nWiping transactional tables (transaction)...');
  await ds.transaction(async (manager) => {
    for (const table of TXN_TABLES) {
      // DELETE (not TRUNCATE) so we stay inside the transaction and don't
      // need elevated privileges. The 5 tables are small (demo scale), so
      // perf isn't a concern.
      const res = await manager.query(`DELETE FROM ${table}`);
      const deleted = Array.isArray(res) ? res.length : (res?.affected ?? 0);
      console.log(`  DELETE FROM ${table}  ->  ${deleted} rows`);
    }
  });

  console.log('\nPost-wipe transactional counts (expect all 0):');
  const after = await countRows(ds, TXN_TABLES);
  console.log(fmt(after));

  console.log('\nPost-wipe master counts (should be unchanged):');
  const masterAfter = await countRows(ds, MASTER_TABLES);
  console.log(fmt(masterAfter));

  // Sanity
  const stillDirty = Object.entries(after).filter(([, n]) => n > 0);
  if (stillDirty.length > 0) {
    console.error('\nERROR: tables not empty after wipe:', stillDirty);
    process.exitCode = 2;
  } else {
    console.log('\nAll transactional tables are empty.');
  }

  // Master sanity check (warn-only — KC can re-seed if needed).
  for (const t of MASTER_TABLES) {
    if (masterBefore[t] !== masterAfter[t]) {
      console.warn(
        `WARN: master table ${t} changed (${masterBefore[t]} -> ${masterAfter[t]})`,
      );
    }
  }

  await ds.destroy();
}

main().catch((err) => {
  console.error('Clear failed:', err);
  process.exit(1);
});
