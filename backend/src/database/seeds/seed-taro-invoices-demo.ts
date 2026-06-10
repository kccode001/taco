/**
 * Demo Taro invoices for the regional analytics dashboard.
 *
 * Inserts ~40 fake Taro invoices distributed across all 18 ASM areas + a few
 * "Tanpa Region" stragglers, spread over the last 3 months. Each invoice gets
 * 3–8 line items pointing at real TACO SKUs so analytics queries (top SKUs,
 * monthly volume, price extremes) return meaningful values.
 *
 * Distribution is intentionally uneven so Jakarta surfaces as the top region
 * and Outer Islands stay sparse — matches KC's ASM volume expectation.
 *
 * Idempotent: deletes every existing taro_invoice (and via FK cascade, their
 * line items) before reseeding. Does NOT touch regions, taco_skus, or any
 * other table.
 *
 * Run: npm run seed:taro-invoices-demo
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

import { Region, RegionType } from '../entities/region.entity';
import {
  TaroInvoice,
  TaroInvoiceStatus,
} from '../entities/taro-invoice.entity';
import { TaroInvoiceLineItem } from '../entities/taro-invoice-line-item.entity';
import { TaroInvoiceSkuCorrection } from '../entities/taro-invoice-sku-correction.entity';
import { TaroInvoiceRecommendation } from '../entities/taro-invoice-recommendation.entity';
import { TaroMappingRule } from '../entities/taro-mapping-rule.entity';
import { TacoSku } from '../entities/taco-sku.entity';
import { CompetitorBrand } from '../entities/competitor-brand.entity';
import { User } from '../entities/user.entity';
import { Territory } from '../entities/territory.entity';
import { TaroAgentRegion } from '../entities/taro-agent-region.entity';

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    Region,
    TaroInvoice,
    TaroInvoiceLineItem,
    TaroInvoiceSkuCorrection,
    TaroInvoiceRecommendation,
    TaroMappingRule,
    TacoSku,
    CompetitorBrand,
    User,
    Territory,
    TaroAgentRegion,
  ],
  synchronize: false,
});

/** Weighted draw: returns an index according to weights[i]. */
function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
  const out: T[] = [];
  const pool = [...arr];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

/** Deterministic-ish RNG so repeated seeds produce comparable distributions. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  await ds.initialize();
  console.log('Connected.');

  const regionRepo = ds.getRepository(Region);
  const invoiceRepo = ds.getRepository(TaroInvoice);
  const lineItemRepo = ds.getRepository(TaroInvoiceLineItem);
  const skuRepo = ds.getRepository(TacoSku);

  const areas = await regionRepo.find({
    where: { type: RegionType.AREA },
    order: { sort_order: 'ASC', code: 'ASC' },
  });
  if (areas.length === 0) {
    throw new Error(
      'No ASM areas found. Run `npm run seed:regions` first.',
    );
  }
  const skus = await skuRepo.find({ take: 200, order: { code: 'ASC' } });
  if (skus.length === 0) {
    throw new Error('No TACO SKUs found. Run `npm run seed` first.');
  }

  console.log(`Loaded ${areas.length} ASM areas and ${skus.length} TACO SKUs.`);

  // Wipe demo data first. Line items cascade off the invoice.
  console.log('Clearing existing taro_invoices + dependents...');
  await ds.query('DELETE FROM taro_invoice_sku_corrections');
  await ds.query('DELETE FROM taro_invoice_line_items');
  await ds.query('DELETE FROM taro_invoices');

  // Distribution weights. Jakarta clusters heaviest, then Central/Eastern,
  // then Sumatera, then Outer Islands. The "Tanpa Region" tail mirrors KC's
  // "admin forgot to tag at upload time" reality.
  const weightByCodePrefix: Record<string, number> = {
    'J-': 5.0, // Jakarta — top region
    'C-': 3.0,
    'E-': 2.5,
    'SUM-': 1.5,
    'OI-': 0.8,
  };
  const weights = areas.map((a) => {
    const prefix = Object.keys(weightByCodePrefix).find((p) =>
      a.code.startsWith(p),
    );
    return prefix ? weightByCodePrefix[prefix] : 1.0;
  });

  const rng = mulberry32(20260608);

  const TOTAL_INVOICES = 42;
  const NULL_REGION_COUNT = 3; // a handful of "Tanpa Region" invoices

  // Last 3 months, weighted toward current month
  const now = new Date();
  const monthWeights = [0.5, 0.7, 1.0]; // 3 months ago, last month, this month

  const distribution = new Map<string, number>();
  const distributionByCode = new Map<string, number>();

  let createdInvoices = 0;
  let createdLineItems = 0;

  for (let i = 0; i < TOTAL_INVOICES - NULL_REGION_COUNT; i++) {
    const area = weightedPick(areas, weights, rng);
    const monthOffset = weightedPick([2, 1, 0], monthWeights, rng);
    const uploadedAt = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - monthOffset,
        randInt(rng, 1, 28),
        randInt(rng, 8, 18),
        randInt(rng, 0, 59),
        0,
      ),
    );

    // Slight Jakarta bias on confidence + needs_review rate.
    const isHighConfRegion = area.code.startsWith('J-') || area.code.startsWith('C-');
    const baseConfidence = isHighConfRegion ? 0.92 : 0.78;
    // Provisional — the real status is derived from the generated lines below
    // (an invoice with any needs_review line is NEEDS_REVIEW, not DONE).
    const invoice = await invoiceRepo.save(
      invoiceRepo.create({
        uploaded_at: uploadedAt,
        uploaded_by: null,
        status: TaroInvoiceStatus.DONE,
        supplier_name: null,
        invoice_date: uploadedAt.toISOString().slice(0, 10),
        total_amount: '0',
        raw_image_url: `/api/taro-invoices/demo-${i}/image`,
        pages: 1,
        notes: 'demo seed',
        file_name: `demo-invoice-${i + 1}.pdf`,
        region_id: area.id,
        progress_percent: 100,
      }),
    );
    createdInvoices++;
    distribution.set(area.id, (distribution.get(area.id) ?? 0) + 1);
    distributionByCode.set(
      area.code,
      (distributionByCode.get(area.code) ?? 0) + 1,
    );

    // 3–8 line items per invoice, drawn without replacement so a single invoice
    // never lists the same SKU twice.
    const lineCount = randInt(rng, 3, 8);
    const picked = pickN(skus, lineCount, rng);
    let anyNeedsReview = false;
    for (let j = 0; j < picked.length; j++) {
      const sku = picked[j];
      // Region-flavoured price: same SKU is ~10–25% cheaper in Sumatera / Outer
      // Islands, ~5–15% pricier in Jakarta, so region_price_extremes shows real
      // spread.
      let priceMul = 1.0;
      if (area.code.startsWith('J-')) priceMul = 1.05 + rng() * 0.1;
      else if (area.code.startsWith('C-')) priceMul = 1.0 + rng() * 0.05;
      else if (area.code.startsWith('E-')) priceMul = 0.98 + rng() * 0.05;
      else if (area.code.startsWith('SUM-')) priceMul = 0.85 + rng() * 0.05;
      else if (area.code.startsWith('OI-')) priceMul = 0.78 + rng() * 0.07;

      const basePrice = sku.avg_price || sku.standard_price || 100000;
      const unit_price = Math.round(basePrice * priceMul);
      const quantity = randInt(rng, 1, 10);
      const total_price = unit_price * quantity;

      // 20–25% needs_review rate overall, region-flavoured.
      const conf = Math.max(
        0,
        Math.min(0.999, baseConfidence + (rng() - 0.5) * 0.2),
      );
      const needs_review = conf < 0.85;
      anyNeedsReview = anyNeedsReview || needs_review;

      await lineItemRepo.save(
        lineItemRepo.create({
          invoice_id: invoice.id,
          line_no: j + 1,
          raw_text: `${sku.code} ${sku.name}`,
          matched_sku_id: sku.id,
          confidence_score: conf.toFixed(3),
          needs_review,
          quantity: quantity.toString(),
          unit: sku.unit ?? 'PCS',
          unit_price: unit_price.toString(),
          total_price: total_price.toString(),
          edited: false,
        }),
      );
      createdLineItems++;
    }

    // Derive the invoice status from its own lines: any needs_review line means
    // the invoice is NOT done. Mirrors the runtime recompute so the PWA never
    // shows a "Sudah Selesai" banner over "Perlu Dicek" lines.
    if (anyNeedsReview) {
      await invoiceRepo.update(invoice.id, {
        status: TaroInvoiceStatus.NEEDS_REVIEW,
      });
    }
  }

  // "Tanpa Region" invoices (admin uploaded without tagging).
  for (let i = 0; i < NULL_REGION_COUNT; i++) {
    const monthOffset = weightedPick([2, 1, 0], monthWeights, rng);
    const uploadedAt = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - monthOffset,
        randInt(rng, 1, 28),
      ),
    );
    const invoice = await invoiceRepo.save(
      invoiceRepo.create({
        uploaded_at: uploadedAt,
        uploaded_by: null,
        status: TaroInvoiceStatus.DONE,
        supplier_name: null,
        invoice_date: uploadedAt.toISOString().slice(0, 10),
        total_amount: '0',
        raw_image_url: `/api/taro-invoices/demo-null-${i}/image`,
        pages: 1,
        notes: 'demo seed — untagged',
        file_name: `demo-invoice-untagged-${i + 1}.pdf`,
        region_id: null,
        progress_percent: 100,
      }),
    );
    createdInvoices++;

    const lineCount = randInt(rng, 3, 6);
    const picked = pickN(skus, lineCount, rng);
    for (let j = 0; j < picked.length; j++) {
      const sku = picked[j];
      const unit_price = sku.avg_price || sku.standard_price || 100000;
      const quantity = randInt(rng, 1, 5);
      await lineItemRepo.save(
        lineItemRepo.create({
          invoice_id: invoice.id,
          line_no: j + 1,
          raw_text: `${sku.code} ${sku.name}`,
          matched_sku_id: sku.id,
          confidence_score: '0.880',
          needs_review: false,
          quantity: quantity.toString(),
          unit: sku.unit ?? 'PCS',
          unit_price: unit_price.toString(),
          total_price: (unit_price * quantity).toString(),
          edited: false,
        }),
      );
      createdLineItems++;
    }
  }

  console.log('\nSeed complete.');
  console.log('Summary:');
  console.log(`  Invoices    : ${createdInvoices}`);
  console.log(`  Line items  : ${createdLineItems}`);
  console.log(`  Tanpa Region: ${NULL_REGION_COUNT}`);

  console.log('\nDistribution (invoices per region):');
  const ranked = [...distributionByCode.entries()].sort((a, b) => b[1] - a[1]);
  for (const [code, count] of ranked) {
    console.log(`  ${code.padEnd(24)} ${count}`);
  }

  await ds.destroy();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
