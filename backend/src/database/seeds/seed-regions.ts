/**
 * Seed KC's territory hierarchy: 5 regions × 1 BU each × 18 ASM areas.
 *
 *   region        bu               area
 *   ------        ---              ----
 *   C   (Central)    BU1   Cirebon, Bandung, Semarang, PWK, Yogyakarta
 *   E   (Eastern)    BU1   Malang, BNT, SBY North, SBY South
 *   J   (Jakarta)    BU1   JKT1, JKT2, JKT3, JKT4
 *   OI  (Outer Is.)  BU1   KAL, SUL
 *   SUM (Sumatera)   BU1   SUMBAGSEL, SUMBAGUT, SUMBAGTENG
 *
 * Idempotent: wipes the `regions` table before reseed. Does NOT touch
 * `territories` / `wilayah`.
 *
 * Run: npm run seed:regions
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

import { Region, RegionType } from '../entities/region.entity';
import { TaroInvoice } from '../entities/taro-invoice.entity';
import { TaroInvoiceLineItem } from '../entities/taro-invoice-line-item.entity';
import { TacoSku } from '../entities/taco-sku.entity';

interface AreaDef {
  code: string;
  name: string;
}

interface BuDef {
  code: string;
  name: string;
  areas: AreaDef[];
}

interface RegionDef {
  code: string;
  name: string;
  bus: BuDef[];
}

const TREE: RegionDef[] = [
  {
    code: 'C',
    name: 'Central',
    bus: [
      {
        code: 'C-BU1',
        name: 'BU1',
        areas: [
          { code: 'C-BU1-ASM-CIREBON', name: 'ASM Cirebon' },
          { code: 'C-BU1-ASM-BANDUNG', name: 'ASM Bandung' },
          { code: 'C-BU1-ASM-SEMARANG', name: 'ASM Semarang' },
          { code: 'C-BU1-ASM-PWK', name: 'ASM PWK (Purwakarta)' },
          { code: 'C-BU1-ASM-YOGYAKARTA', name: 'ASM Yogyakarta' },
        ],
      },
    ],
  },
  {
    code: 'E',
    name: 'Eastern',
    bus: [
      {
        code: 'E-BU1',
        name: 'BU1',
        areas: [
          { code: 'E-BU1-ASM-MALANG', name: 'ASM Malang' },
          { code: 'E-BU1-ASM-BNT', name: 'ASM BNT (Banten)' },
          { code: 'E-BU1-ASM-SBY-NORTH', name: 'ASM SBY NORTH (Surabaya North)' },
          { code: 'E-BU1-ASM-SBY-SOUTH', name: 'ASM SBY SOUTH (Surabaya South)' },
        ],
      },
    ],
  },
  {
    code: 'J',
    name: 'Jakarta',
    bus: [
      {
        code: 'J-BU1',
        name: 'BU1',
        areas: [
          { code: 'J-BU1-ASM-JKT1', name: 'ASM JKT1' },
          { code: 'J-BU1-ASM-JKT2', name: 'ASM JKT2' },
          { code: 'J-BU1-ASM-JKT3', name: 'ASM JKT3' },
          { code: 'J-BU1-ASM-JKT4', name: 'ASM JKT4' },
        ],
      },
    ],
  },
  {
    code: 'OI',
    name: 'Outer Islands',
    bus: [
      {
        code: 'OI-BU1',
        name: 'BU1',
        areas: [
          { code: 'OI-BU1-ASM-KAL', name: 'ASM KAL (Kalimantan)' },
          { code: 'OI-BU1-ASM-SUL', name: 'ASM SUL (Sulawesi)' },
        ],
      },
    ],
  },
  {
    code: 'SUM',
    name: 'Sumatera',
    bus: [
      {
        code: 'SUM-BU1',
        name: 'BU1',
        areas: [
          { code: 'SUM-BU1-SUMBAGSEL', name: 'SUMBAGSEL (South Sumatera)' },
          { code: 'SUM-BU1-SUMBAGUT', name: 'SUMBAGUT (North Sumatera)' },
          { code: 'SUM-BU1-SUMBAGTENG', name: 'SUMBAGTENG (Central Sumatera)' },
        ],
      },
    ],
  },
];

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Region, TaroInvoice, TaroInvoiceLineItem, TacoSku],
  synchronize: false,
});

async function main() {
  await ds.initialize();
  console.log('Connected.');

  const repo = ds.getRepository(Region);

  // Null out any existing region_id on taro_invoices before wiping regions, so
  // we don't trip FKs (region_id is nullable + ON DELETE NO ACTION by default).
  await ds.query('UPDATE taro_invoices SET region_id = NULL WHERE region_id IS NOT NULL');
  await ds.query('DELETE FROM regions');
  console.log('Cleared regions.');

  let regionSortBase = 0;
  let totalRegions = 0;
  let totalBus = 0;
  let totalAreas = 0;

  for (const regionDef of TREE) {
    const regionRow = await repo.save(
      repo.create({
        code: regionDef.code,
        name: regionDef.name,
        type: RegionType.REGION,
        parent_id: null,
        sort_order: regionSortBase,
        active: true,
        display_path: regionDef.name,
      }),
    );
    totalRegions++;

    let buSort = 0;
    for (const buDef of regionDef.bus) {
      const buRow = await repo.save(
        repo.create({
          code: buDef.code,
          name: buDef.name,
          type: RegionType.BU,
          parent_id: regionRow.id,
          sort_order: buSort++,
          active: true,
          display_path: `${regionDef.name} - ${buDef.name}`,
        }),
      );
      totalBus++;

      let areaSort = 0;
      for (const areaDef of buDef.areas) {
        await repo.save(
          repo.create({
            code: areaDef.code,
            name: areaDef.name,
            type: RegionType.AREA,
            parent_id: buRow.id,
            sort_order: areaSort++,
            active: true,
            display_path: `${regionDef.name} - ${buDef.name} - ${areaDef.name}`,
          }),
        );
        totalAreas++;
      }
    }
    regionSortBase += 10;
  }

  console.log(
    `Seeded ${totalRegions} regions, ${totalBus} BUs, ${totalAreas} areas (${
      totalRegions + totalBus + totalAreas
    } rows total).`,
  );

  await ds.destroy();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
