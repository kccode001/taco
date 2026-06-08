/**
 * Seed 5 Taro Sales Agent users + distribute the existing 42 demo Taro
 * invoices across them with realistic store names.
 *
 *   taro1@taco.id  J-BU1-ASM-JKT1            (12 invoices)
 *   taro2@taco.id  C-BU1-ASM-BANDUNG         (10 invoices)
 *   taro3@taco.id  E-BU1-ASM-MALANG          ( 8 invoices)
 *   taro4@taco.id  SUM-BU1-SUMBAGSEL         ( 7 invoices)
 *   taro5@taco.id  OI-BU1-ASM-KAL            ( 5 invoices)
 *
 * All passwords: `password123`. Demo only.
 *
 * Idempotent: deletes the five taro_agent users by email before reseeding,
 * then re-tags ALL existing taro_invoices (uploaded_by + store_name) in a
 * deterministic order. Pre-existing region_id values on invoices are NOT
 * changed — only uploaded_by and store_name.
 *
 * Run: npm run seed:taro-sales-agents
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';
dotenv.config();

import { Region, RegionType } from '../entities/region.entity';
import { User, UserRole } from '../entities/user.entity';
import { Territory } from '../entities/territory.entity';
import { TaroInvoice } from '../entities/taro-invoice.entity';
import { TaroInvoiceLineItem } from '../entities/taro-invoice-line-item.entity';
import { TaroInvoiceSkuCorrection } from '../entities/taro-invoice-sku-correction.entity';
import { TaroInvoiceRecommendation } from '../entities/taro-invoice-recommendation.entity';
import { TaroMappingRule } from '../entities/taro-mapping-rule.entity';
import { TacoSku } from '../entities/taco-sku.entity';

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    Region,
    User,
    Territory,
    TaroInvoice,
    TaroInvoiceLineItem,
    TaroInvoiceSkuCorrection,
    TaroInvoiceRecommendation,
    TaroMappingRule,
    TacoSku,
  ],
  synchronize: false,
});

interface AgentSpec {
  email: string;
  name: string;
  phone: string;
  regionCode: string;
  invoiceShare: number; // count of invoices to tag with this agent
  stores: string[]; // pool of realistic hardware-store names
}

const AGENTS: AgentSpec[] = [
  {
    email: 'taro1@taco.id',
    name: 'Budi Santoso',
    phone: '0812-1111-0001',
    regionCode: 'J-BU1-ASM-JKT1',
    invoiceShare: 12,
    stores: [
      'TB Sumber Rezeki',
      'TB Mitra Bangun',
      'TB Karya Jaya',
      'TB Sinar Abadi',
      'TB Maju Bersama',
    ],
  },
  {
    email: 'taro2@taco.id',
    name: 'Siti Aminah',
    phone: '0812-2222-0002',
    regionCode: 'C-BU1-ASM-BANDUNG',
    invoiceShare: 10,
    stores: [
      'TB Cahaya Bandung',
      'TB Berkah Material',
      'TB Anugerah Bangunan',
      'TB Sejahtera',
      'TB Mandiri Kreasi',
    ],
  },
  {
    email: 'taro3@taco.id',
    name: 'Joko Prasetyo',
    phone: '0812-3333-0003',
    regionCode: 'E-BU1-ASM-MALANG',
    invoiceShare: 8,
    stores: [
      'TB Surya Malang',
      'TB Rahmat Bangun',
      'TB Lestari Material',
      'TB Bintang Timur',
    ],
  },
  {
    email: 'taro4@taco.id',
    name: 'Rina Hartati',
    phone: '0812-4444-0004',
    regionCode: 'SUM-BU1-SUMBAGSEL',
    invoiceShare: 7,
    stores: [
      'TB Sriwijaya Jaya',
      'TB Palembang Mandiri',
      'TB Sumatera Abadi',
      'TB Cahaya Selatan',
    ],
  },
  {
    email: 'taro5@taco.id',
    name: 'Ahmad Fauzi',
    phone: '0812-5555-0005',
    regionCode: 'OI-BU1-ASM-KAL',
    invoiceShare: 5,
    stores: [
      'TB Borneo Maju',
      'TB Khatulistiwa',
      'TB Sumber Kalimantan',
    ],
  },
];

function totalShare(): number {
  return AGENTS.reduce((s, a) => s + a.invoiceShare, 0);
}

async function main() {
  await ds.initialize();
  console.log('Connected.');

  const userRepo = ds.getRepository(User);
  const regionRepo = ds.getRepository(Region);
  const invoiceRepo = ds.getRepository(TaroInvoice);

  // 1. Resolve every required region by code.
  const regions = await regionRepo.find({ where: { type: RegionType.AREA } });
  const regionByCode = new Map(regions.map((r) => [r.code, r]));
  for (const a of AGENTS) {
    if (!regionByCode.has(a.regionCode)) {
      throw new Error(
        `Region ${a.regionCode} not found — run \`npm run seed:regions\` first.`,
      );
    }
  }

  // 2. Wipe + recreate the 5 taro_agent users by email.
  const emails = AGENTS.map((a) => a.email);
  const existing = await userRepo
    .createQueryBuilder()
    .where('email IN (:...emails)', { emails })
    .getMany();
  if (existing.length > 0) {
    console.log(`Removing ${existing.length} stale taro_agent users...`);
    await userRepo
      .createQueryBuilder()
      .delete()
      .where('email IN (:...emails)', { emails })
      .execute();
  }

  const password_hash = await bcrypt.hash('password123', 10);
  const createdAgents: Array<{ spec: AgentSpec; user: User }> = [];
  for (const spec of AGENTS) {
    const region = regionByCode.get(spec.regionCode)!;
    const user = await userRepo.save(
      userRepo.create({
        email: spec.email,
        password_hash,
        name: spec.name,
        role: UserRole.TARO_AGENT,
        phone: spec.phone,
        taro_region_id: region.id,
        is_active: true,
      }),
    );
    createdAgents.push({ spec, user });
    console.log(`  + ${spec.email.padEnd(20)} ${spec.regionCode}`);
  }

  // 3. Distribute existing taro_invoices across these 5 agents.
  //    Sorted by uploaded_at ascending so the assignment is deterministic
  //    across reruns.
  const invoices = await invoiceRepo
    .createQueryBuilder('inv')
    .orderBy('inv.uploaded_at', 'ASC')
    .addOrderBy('inv.id', 'ASC')
    .getMany();
  console.log(`Found ${invoices.length} taro_invoices to retag.`);

  // Build a flat assignment array: 12× agent1, 10× agent2, etc. — capped at
  // the actual invoice count so we don't over-assign if seed data shrinks.
  const targetTotal = Math.min(invoices.length, totalShare());
  const assignment: Array<{ spec: AgentSpec; user: User }> = [];
  for (const ag of createdAgents) {
    for (let i = 0; i < ag.spec.invoiceShare; i++) {
      assignment.push(ag);
      if (assignment.length >= targetTotal) break;
    }
    if (assignment.length >= targetTotal) break;
  }

  // Tail invoices (if any beyond targetTotal) wrap onto agent[0] so every row
  // gets uploaded_by.
  while (assignment.length < invoices.length) {
    assignment.push(createdAgents[0]);
  }

  const storeRng = (seed: number) => {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const rng = storeRng(20260608);

  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    const { user, spec } = assignment[i];
    const storeName = spec.stores[Math.floor(rng() * spec.stores.length)];
    await invoiceRepo.update(inv.id, {
      uploaded_by: user.id,
      store_name: storeName,
    });
  }

  console.log(`\nRetagged ${invoices.length} invoices.`);
  for (const ag of createdAgents) {
    const count = assignment.filter((a) => a.user.id === ag.user.id).length;
    console.log(`  ${ag.spec.email.padEnd(20)} → ${count} invoices`);
  }

  await ds.destroy();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
