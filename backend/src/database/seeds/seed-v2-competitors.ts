/**
 * Seed REAL TACO competitors for the Indonesian HPL / decorative-laminate
 * market and clean up placeholder/test brands.
 *
 * TACO sells HPL, laminate, edging and decorative surfaces; its real-world
 * competitors in that category are other HPL / decorative-laminate brands.
 * This seed:
 *   1. Upserts the real competitor set (active): Grasmerino, Violam, Aica,
 *      Greenlam, Arborite.
 *   2. Deactivates obvious placeholder/test rows (a country name + the two
 *      curl/test brands) so they drop off the active Kompetitor list.
 *   3. Re-tags the handful of v2 competitor invoice lines onto real brands so
 *      the dashboard "Sinyal Kompetitor" report shows real brand names across
 *      areas instead of a leftover test brand / untagged lines. (This is the
 *      same resolution an admin performs in the Resolusi flow.)
 *
 * Idempotent — safe to re-run.
 *
 * Run: npm run seed:v2-competitors
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

import { CompetitorBrand } from '../entities/competitor-brand.entity';

/** Real Indonesian-market HPL / decorative-laminate competitor brands. */
const REAL_COMPETITORS: { name: string; country: string }[] = [
  { name: 'Grasmerino', country: 'Indonesia' },
  { name: 'Violam', country: 'Indonesia' },
  { name: 'Aica', country: 'Indonesia' },
  { name: 'Greenlam', country: 'India' },
  { name: 'Arborite', country: 'Kanada' },
];

/** Placeholder / test rows to deactivate (not real brands). */
const PLACEHOLDER_NAMES = [
  'Malaysia',
  'TestBrand_CurlTest_EDITED',
  'NewInlineTestBrand',
];

/**
 * Re-tag v2 competitor invoice lines (matched by raw_text) onto real brands so
 * the competitor signal report renders real names. Lines not found are skipped.
 */
const RETAG_LINES: { raw_text: string; brand: string }[] = [
  { raw_text: 'F 10', brand: 'Grasmerino' }, // was NewInlineTestBrand (test)
  { raw_text: 'MULTI 18MM', brand: 'Violam' }, // was untagged competitor
  { raw_text: '18 mm', brand: 'Aica' }, // was untagged competitor
];

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [CompetitorBrand],
  synchronize: false,
});

async function main() {
  await ds.initialize();
  console.log('Connected.');

  const brandRepo = ds.getRepository(CompetitorBrand);

  // 1. Upsert real competitors (active).
  let created = 0;
  let reactivated = 0;
  const brandByName = new Map<string, CompetitorBrand>();
  for (const c of REAL_COMPETITORS) {
    let row = await brandRepo.findOne({ where: { name: c.name } });
    if (!row) {
      row = brandRepo.create({ name: c.name, country: c.country, is_active: true });
      row = await brandRepo.save(row);
      created++;
    } else if (!row.is_active || !row.country) {
      row.is_active = true;
      if (!row.country) row.country = c.country;
      row = await brandRepo.save(row);
      reactivated++;
    }
    brandByName.set(c.name, row);
  }

  // 2. Deactivate placeholders/tests.
  let deactivated = 0;
  for (const name of PLACEHOLDER_NAMES) {
    const row = await brandRepo.findOne({ where: { name } });
    if (row && row.is_active) {
      row.is_active = false;
      await brandRepo.save(row);
      deactivated++;
    }
  }

  // 3. Re-tag competitor invoice lines onto real brands (raw SQL — the line
  //    entity's relation graph isn't loaded in this lightweight DataSource).
  for (const rt of RETAG_LINES) {
    const brand = brandByName.get(rt.brand);
    if (!brand) continue;
    await ds.query(
      `UPDATE taro_v2_invoice_line_items
         SET brand_id = $1, brand_name = $2
       WHERE raw_text = $3 AND is_competitor = true`,
      [brand.id, brand.name, rt.raw_text],
    );
  }
  const taggedRows: { cnt: string }[] = await ds.query(
    `SELECT COUNT(*)::text AS cnt FROM taro_v2_invoice_line_items
      WHERE is_competitor = true AND brand_name IS NOT NULL`,
  );
  const retagged = taggedRows[0]?.cnt ?? '0';

  console.log(
    `Done. Real brands: ${created} created, ${reactivated} reactivated. ` +
      `Placeholders deactivated: ${deactivated}. Named competitor lines now: ${retagged}.`,
  );
  await ds.destroy();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
