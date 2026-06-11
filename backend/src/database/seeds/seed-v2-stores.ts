/**
 * Seed v2 stores (taro_v2_stores) across multiple AREA regions.
 *
 * Adds realistic toko names to these areas (in addition to the existing
 * ASM Bandung stores so area filters and the dashboard show geographic spread):
 *
 *   ASM JKT1          J-BU1-ASM-JKT1
 *   ASM JKT2          J-BU1-ASM-JKT2
 *   ASM Cirebon       C-BU1-ASM-CIREBON
 *   ASM Malang        E-BU1-ASM-MALANG
 *   ASM SBY NORTH     E-BU1-ASM-SBY-NORTH
 *
 * Idempotent — skips any (area_id, name) pair that already exists.
 *
 * Run: npm run seed:v2-stores
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

import { Region, RegionType } from '../entities/region.entity';
import { StoreV2 } from '../entities/v2/store-v2.entity';

const TARGET_AREA_CODES = [
  'J-BU1-ASM-JKT1',
  'J-BU1-ASM-JKT2',
  'C-BU1-ASM-CIREBON',
  'E-BU1-ASM-MALANG',
  'E-BU1-ASM-SBY-NORTH',
];

/** Realistic toko names per area code. */
const STORES_BY_CODE: Record<string, string[]> = {
  'J-BU1-ASM-JKT1': [
    'Sinar Bangunan Jakarta Pusat',
    'Mitra Dekor JKT1',
    'Toko Pratama Furniture',
    'Indah Kreasi Interor',
  ],
  'J-BU1-ASM-JKT2': [
    'Toko Bangunan Mulia JKT2',
    'Griya Material Utama',
    'Delta Furnindo',
    'Toko Jaya Makmur',
  ],
  'C-BU1-ASM-CIREBON': [
    'Cahaya Bangunan Cirebon',
    'Toko Mandiri Cirebon',
    'Karya Indah Furniture',
    'Berkah Bangunan',
  ],
  'E-BU1-ASM-MALANG': [
    'Toko Bangunan Malang Raya',
    'Sejahtera Interior Malang',
    'Sumber Rejeki Furniture',
    'Toko Andalan Malang',
  ],
  'E-BU1-ASM-SBY-NORTH': [
    'Mulia Bangunan Surabaya',
    'Toko Sinar Harapan SBY',
    'Gresik Raya Material',
    'Indofurni Utara',
  ],
};

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Region, StoreV2],
  synchronize: false,
});

async function main() {
  await ds.initialize();
  console.log('Connected.');

  const regionRepo = ds.getRepository(Region);
  const storeRepo = ds.getRepository(StoreV2);

  // Resolve area IDs by code.
  const areaRows = await regionRepo.find({
    where: TARGET_AREA_CODES.map((code) => ({ code, type: RegionType.AREA })),
  });

  const areaByCode = new Map<string, string>(
    areaRows.map((r) => [r.code, r.id]),
  );

  const missing = TARGET_AREA_CODES.filter((c) => !areaByCode.has(c));
  if (missing.length) {
    console.warn(`Missing area codes (run seed:regions first): ${missing.join(', ')}`);
  }

  let inserted = 0;
  let skipped = 0;

  for (const code of TARGET_AREA_CODES) {
    const areaId = areaByCode.get(code);
    if (!areaId) continue;

    for (const storeName of STORES_BY_CODE[code] ?? []) {
      const existing = await storeRepo.findOne({
        where: { area_id: areaId, name: storeName },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await storeRepo.save(
        storeRepo.create({ area_id: areaId, name: storeName, created_by: null }),
      );
      inserted++;
    }
  }

  console.log(`Done. Inserted ${inserted} stores, skipped ${skipped} duplicates.`);
  await ds.destroy();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
