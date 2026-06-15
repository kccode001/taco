/**
 * Representative demo seed for the TACO v2 analytics-revamp (SKU × Area pivot).
 *
 * Fills the live `/taro/v2/analytics` page so every deferred (data-driven) panel
 * renders as a real research lead instead of an empty state. Built to satisfy
 * the PRD §8 market-intel contract WITHOUT any AI/OCR spend, schema change, or
 * pipeline run — rows are inserted straight into the v2 invoice spine.
 *
 * What it lays down (all tagged with the sentinel note so it is self-contained
 * and rerunnable — see WIPE below):
 *   - 36 `done` invoices across 5 wilayah (Bandung dense, then Cirebon, JKT1,
 *     Malang, SBY North), each on a real `taro_v2_stores` toko, dated INSIDE the
 *     live 30-day window (offsets 2..28 days back from today, so `@30d` fills no
 *     matter WHEN this is reseeded).
 *   - 3–5 matched-TACO line items per invoice from a 16-SKU recognizable decor
 *     set (10 "core" SKUs seen everywhere → ≥3 invoices each for the R2 hero and
 *     ≥10 distinct in Bandung for the R1 single-area top-10 collapse; 6 "tail"
 *     SKUs restricted to a subset of regions → genuine SKU×region gaps for R4).
 *   - Realistic per-observation price jitter (±7%) so price-bands/sku-price-
 *     history show meaningful spread, PLUS one planted ≥25% outlier (Amber Elm in
 *     Bandung) so AC-5 / AC-26 render a flagged marker.
 *   - Same-receipt TACO + resolved-competitor lines on 7 invoices across 4
 *     regions (Grasmerino/Aica/Violam/Greenlam/Formica) → R3 fills with a real
 *     |%gap| desc list (total_same_receipt_pairs well above 3), PLUS 2 unknown-
 *     brand competitor lines so the AC-11 "tak dikenali" footer count shows.
 *   - One `valid` invoice-image row per invoice so the R5 modal + R3 `image_url`
 *     link is non-null (no bytes on disk — DB-only, no pipeline).
 *
 * WIPE / RERUN: idempotent. Every run first DELETEs all invoices carrying the
 * sentinel note (`notes = SENTINEL`) — line items + images cascade off the
 * invoice FK — then reinserts a fresh set. It NEVER touches the pre-existing
 * organic v2 invoices, regions, stores, taco_skus, or competitor_brands. Safe
 * for KC to wipe/reseed at will.
 *
 * Prereqs (already true on this box): `npm run seed:regions`,
 * `npm run seed` (taco_skus), `npm run seed:v2-stores`, `npm run seed:v2-competitors`.
 *
 * Run: npm run seed:v2-analytics-demo
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

import { Region, RegionType } from '../entities/region.entity';
import { StoreV2 } from '../entities/v2/store-v2.entity';
import { TacoSku } from '../entities/taco-sku.entity';
import { CompetitorBrand } from '../entities/competitor-brand.entity';

/** Tag carried by every row this seed owns — the wipe/reseed key. */
const SENTINEL = 'seed:v2-analytics-demo';

/** Wilayah this demo spreads across (must already exist as active areas). */
const REGION_CODES = [
  'C-BU1-ASM-BANDUNG',
  'C-BU1-ASM-CIREBON',
  'J-BU1-ASM-JKT1',
  'E-BU1-ASM-MALANG',
  'E-BU1-ASM-SBY-NORTH',
] as const;

/** Invoices per region (Bandung deliberately dense for the R1 top-10 collapse). */
const INVOICE_COUNT: Record<string, number> = {
  'C-BU1-ASM-BANDUNG': 12,
  'C-BU1-ASM-CIREBON': 8,
  'J-BU1-ASM-JKT1': 7,
  'E-BU1-ASM-MALANG': 5,
  'E-BU1-ASM-SBY-NORTH': 4,
};

interface SkuSpec {
  code: string;
  /** undefined → seen in every region; otherwise restricted (→ R4 whitespace). */
  regions?: string[];
}

/** 10 core SKUs — seen in every region (drive R2 hero + R1). */
const CORE_SKUS: SkuSpec[] = [
  { code: 'TH 701 CR' }, //  Absolute White   80k
  { code: 'TI X0050 CM' }, // Acacia Teak     100k
  { code: 'TI X0092 DM' }, // Acacia Wood     100k
  { code: 'TV 3034 XL' }, //  Alaska Park     130k
  { code: 'TI X0120 DM' }, // Alin Eucalyptus 100k
  { code: 'TH 5022 NT' }, //  Amarillo Walnut  80k
  { code: 'TV 6003 SPC' }, // Amber Elm       130k  (planted outlier in Bandung)
  { code: 'TI X0044 CM' }, // American Teak   100k
  { code: 'TI X0048 CM' }, // American Walnut 100k
  { code: 'TH 231 AC' }, //   Andes Walnut     80k
];

/** 6 tail SKUs — region-restricted on purpose → leaves R4 white-space gaps. */
const TAIL_SKUS: SkuSpec[] = [
  { code: 'TH 7005 DP', regions: ['C-BU1-ASM-BANDUNG', 'C-BU1-ASM-CIREBON'] }, // Amar Terrazzo
  { code: 'TV 2006', regions: ['C-BU1-ASM-BANDUNG', 'E-BU1-ASM-MALANG'] }, //     Antique Oak
  { code: 'FSL 202 A', regions: ['J-BU1-ASM-JKT1'] }, //                          Arctic Frost (premium)
  { code: 'TH 013 AA' }, //                                                       Ash Grey (cheap, everywhere)
  { code: 'TH 806 J', regions: ['C-BU1-ASM-CIREBON', 'J-BU1-ASM-JKT1'] }, //      Ash Zebrano
  { code: 'TH 262 B', regions: ['C-BU1-ASM-BANDUNG', 'E-BU1-ASM-SBY-NORTH'] }, // Asian Oak
];

/** Planted ≥25% outlier (AC-5/AC-26): this SKU in this region, this price. */
const OUTLIER = { code: 'TV 6003 SPC', region: 'C-BU1-ASM-BANDUNG', price: 195000 };

interface CompetitorLineSpec {
  /** null brand → unknown competitor (AC-11 footer count, excluded from rows). */
  brand: string | null;
  raw_text: string;
  unit_price: number;
}

/**
 * Same-receipt competitor lines, keyed `<REGION_CODE>#<invoiceIndexInRegion>`.
 * The Nth invoice of the region receives these competitor line(s) alongside its
 * matched-TACO lines → R3 pairs every TACO line on that receipt against them.
 */
const COMPETITOR_LINES: Record<string, CompetitorLineSpec[]> = {
  'C-BU1-ASM-BANDUNG#0': [{ brand: 'Grasmerino', raw_text: 'GRASMERINO HPL 3MM', unit_price: 60000 }],
  'C-BU1-ASM-BANDUNG#1': [{ brand: 'Aica', raw_text: 'AICA SANGETSU FW 1220', unit_price: 95000 }],
  'C-BU1-ASM-BANDUNG#2': [{ brand: null, raw_text: 'LAMINASI IMPORT 4X8 NO MERK', unit_price: 65000 }],
  'C-BU1-ASM-CIREBON#0': [{ brand: 'Violam', raw_text: 'VIOLAM VL-882', unit_price: 72000 }],
  'C-BU1-ASM-CIREBON#1': [{ brand: 'Greenlam', raw_text: 'GREENLAM GL 1234 SF', unit_price: 110000 }],
  'C-BU1-ASM-CIREBON#2': [{ brand: null, raw_text: 'HPL LOKAL TANPA MERK', unit_price: 58000 }],
  'J-BU1-ASM-JKT1#0': [{ brand: 'Formica', raw_text: 'FORMICA F-7039 AR', unit_price: 125000 }],
  'J-BU1-ASM-JKT1#1': [{ brand: 'Aica', raw_text: 'AICA 18MM CITRA', unit_price: 88000 }],
  'E-BU1-ASM-MALANG#0': [{ brand: 'Violam', raw_text: 'VIOLAM MULTI 18MM', unit_price: 70000 }],
};

/** Realistic distributor names (raw, for the R5 invoice list + normalize helper). */
const SUPPLIERS = [
  'PT Sumber Bangunan Jaya',
  'CV Mitra Dekorasi Interior',
  'UD Karya Laminate Abadi',
  'PT Cipta Griya Material',
  'Toko Bangunan Sentosa',
  'CV Anugerah Panel Nusantara',
  'PT Indah Surya Decor',
  'H. Dadang Material',
];

/** Deterministic RNG so reruns produce the same prices/distribution. */
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

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // Read-only lookups only. ALL writes go through raw parameterized SQL so the
  // InvoiceV2/LineItemV2 relation graph never has to be registered here (a prior
  // seed hit "Entity metadata not found" trying to register it).
  entities: [Region, StoreV2, TacoSku, CompetitorBrand],
  synchronize: false,
});

/** YYYY-MM-DD `dayOffset` days before today (server local frame). */
function dateNDaysAgo(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function round500(n: number): number {
  return Math.round(n / 500) * 500;
}

async function main() {
  await ds.initialize();
  console.log('Connected.');

  const regionRepo = ds.getRepository(Region);
  const storeRepo = ds.getRepository(StoreV2);
  const skuRepo = ds.getRepository(TacoSku);
  const brandRepo = ds.getRepository(CompetitorBrand);

  // ---- resolve lookups -----------------------------------------------------
  const regions = await regionRepo.find({
    where: REGION_CODES.map((code) => ({ code, type: RegionType.AREA })),
  });
  const regionByCode = new Map(regions.map((r) => [r.code, r]));
  const missingRegions = REGION_CODES.filter((c) => !regionByCode.has(c));
  if (missingRegions.length) {
    throw new Error(
      `Missing area regions: ${missingRegions.join(', ')} — run \`npm run seed:regions\` first.`,
    );
  }

  const allSpecs = [...CORE_SKUS, ...TAIL_SKUS];
  const skus = await skuRepo.find();
  const skuByCode = new Map(skus.map((s) => [s.code, s]));
  const missingSkus = allSpecs.filter((s) => !skuByCode.has(s.code));
  if (missingSkus.length) {
    throw new Error(
      `Missing taco_skus: ${missingSkus.map((s) => s.code).join(', ')} — run \`npm run seed\` first.`,
    );
  }

  const brands = await brandRepo.find();
  const brandByName = new Map(brands.map((b) => [b.name, b]));
  const neededBrands = [
    ...new Set(
      Object.values(COMPETITOR_LINES)
        .flat()
        .map((c) => c.brand)
        .filter((b): b is string => b !== null),
    ),
  ];
  const missingBrands = neededBrands.filter((b) => !brandByName.has(b));
  if (missingBrands.length) {
    throw new Error(
      `Missing competitor_brands: ${missingBrands.join(', ')} — run \`npm run seed:v2-competitors\` first.`,
    );
  }

  // Stores per region (real toko rows — assigned round-robin per invoice).
  const storesByRegion = new Map<string, StoreV2[]>();
  for (const code of REGION_CODES) {
    const region = regionByCode.get(code)!;
    const rows = await storeRepo.find({ where: { area_id: region.id } });
    if (rows.length === 0) {
      throw new Error(
        `Region ${code} has no taro_v2_stores — run \`npm run seed:v2-stores\` first.`,
      );
    }
    storesByRegion.set(code, rows);
  }

  // ---- WIPE: drop only our own sentinel-tagged invoices (cascades) ---------
  const wiped: { cnt: string }[] = await ds.query(
    `WITH del AS (DELETE FROM taro_v2_invoices WHERE notes = $1 RETURNING id)
     SELECT COUNT(*)::text AS cnt FROM del`,
    [SENTINEL],
  );
  console.log(`Wiped ${wiped[0]?.cnt ?? '0'} prior demo-seed invoices (cascaded line items + images).`);

  // ---- generate ------------------------------------------------------------
  const rng = mulberry32(20260615);
  const PRICE_TXT = (n: number) => n.toFixed(2);

  // Per-SKU effective base price (avg_price, fallback to a sane default).
  const basePrice = (code: string): number => {
    const s = skuByCode.get(code)!;
    return s.avg_price || s.max_price || s.min_price || 100000;
  };

  let totalInvoices = 0;
  let totalTacoLines = 0;
  let totalCompetitorLines = 0;
  let resolvedCompetitorLines = 0;
  let unknownCompetitorLines = 0;
  let totalImages = 0;
  let plantedOutlier = false;

  let globalIdx = 0; // drives date spread across the whole 30-day window
  let supplierIdx = 0;

  for (const code of REGION_CODES) {
    const region = regionByCode.get(code)!;
    const stores = storesByRegion.get(code)!;
    const nInvoices = INVOICE_COUNT[code];

    // Region SKU pool = all core + tail SKUs allowed in this region.
    const pool: string[] = [
      ...CORE_SKUS.map((s) => s.code),
      ...TAIL_SKUS.filter((s) => !s.regions || s.regions.includes(code)).map(
        (s) => s.code,
      ),
    ];

    let poolPtr = 0; // round-robin → guarantees even SKU coverage across invoices

    for (let i = 0; i < nInvoices; i++) {
      const invoiceId = randomUUID();
      const store = stores[i % stores.length];
      const supplier = SUPPLIERS[supplierIdx++ % SUPPLIERS.length];
      // Spread dates 2..28 days back; stagger per invoice so trends have ≥3 dates.
      const dayOffset = 2 + ((globalIdx * 7 + i * 3) % 26);
      globalIdx++;
      const invoiceDate = dateNDaysAgo(dayOffset);

      // 3–5 matched-TACO lines, round-robin over the region pool (no dup per inv).
      const lineCount = 3 + (i % 3);
      const chosen: string[] = [];
      while (chosen.length < lineCount && chosen.length < pool.length) {
        const c = pool[poolPtr % pool.length];
        poolPtr++;
        if (!chosen.includes(c)) chosen.push(c);
      }

      const lineRows: Array<{
        line_no: number;
        raw_text: string;
        classification: string;
        confidence_band: string;
        confidence_score: string;
        matched_sku_id: string | null;
        brand_id: string | null;
        brand_name: string | null;
        is_competitor: boolean;
        quantity: string;
        unit: string | null;
        unit_price: string;
        total_price: string;
      }> = [];

      let lineNo = 1;
      let invoiceTotal = 0;

      for (const skuCode of chosen) {
        const sku = skuByCode.get(skuCode)!;
        const base = basePrice(skuCode);
        let unitPrice = round500(base * (0.93 + rng() * 0.14)); // ±7%
        // Plant the single clear outlier (AC-5): first hit of the target combo.
        if (!plantedOutlier && skuCode === OUTLIER.code && code === OUTLIER.region) {
          unitPrice = OUTLIER.price;
          plantedOutlier = true;
        }
        const qty = 1 + Math.floor(rng() * 8); // 1..8
        const total = unitPrice * qty;
        invoiceTotal += total;
        lineRows.push({
          line_no: lineNo++,
          raw_text: `${sku.code} ${sku.name}`,
          classification: 'taco_very_high',
          confidence_band: 'very_high',
          confidence_score: '0.960',
          matched_sku_id: sku.id,
          brand_id: null,
          brand_name: null,
          is_competitor: false,
          quantity: qty.toFixed(3),
          unit: sku.unit ?? 'PCS',
          unit_price: PRICE_TXT(unitPrice),
          total_price: PRICE_TXT(total),
        });
        totalTacoLines++;
      }

      // Same-receipt competitor lines for designated invoices (R3).
      const compSpecs = COMPETITOR_LINES[`${code}#${i}`] ?? [];
      for (const spec of compSpecs) {
        const brandRow = spec.brand ? brandByName.get(spec.brand)! : null;
        const qty = 1 + Math.floor(rng() * 5);
        const total = spec.unit_price * qty;
        invoiceTotal += total;
        lineRows.push({
          line_no: lineNo++,
          raw_text: spec.raw_text,
          classification: 'not_taco_high',
          confidence_band: 'high',
          confidence_score: '0.910',
          matched_sku_id: null,
          brand_id: brandRow?.id ?? null,
          brand_name: brandRow?.name ?? null,
          is_competitor: true,
          quantity: qty.toFixed(3),
          unit: 'PCS',
          unit_price: PRICE_TXT(spec.unit_price),
          total_price: PRICE_TXT(total),
        });
        totalCompetitorLines++;
        if (brandRow) resolvedCompetitorLines++;
        else unknownCompetitorLines++;
      }

      // Insert invoice header (status='done', dated in-window, sentinel note).
      await ds.query(
        `INSERT INTO taro_v2_invoices
           (id, area_id, store_id, uploaded_by, status, supplier_name,
            invoice_date, total_amount, notes, progress_percent)
         VALUES ($1,$2,$3,NULL,'done',$4,$5,$6,$7,100)`,
        [
          invoiceId,
          region.id,
          store.id,
          supplier,
          invoiceDate,
          PRICE_TXT(invoiceTotal),
          SENTINEL,
        ],
      );
      totalInvoices++;

      // One valid image so R5/R3 `image_url` resolves (no bytes on disk).
      const imageId = randomUUID();
      await ds.query(
        `INSERT INTO taro_v2_invoice_images
           (id, invoice_id, file_path, file_name, validation_status, clarity_ok, is_invoice)
         VALUES ($1,$2,$3,$4,'valid',true,true)`,
        [
          imageId,
          invoiceId,
          `taro-v2/demo/${invoiceId}.jpg`,
          `demo-${code}-${i + 1}.jpg`,
        ],
      );
      totalImages++;

      // Insert the line items (attach the image).
      for (const lr of lineRows) {
        await ds.query(
          `INSERT INTO taro_v2_invoice_line_items
             (id, invoice_id, image_id, line_no, raw_text, classification,
              confidence_band, confidence_score, matched_sku_id, brand_id,
              brand_name, is_competitor, needs_review, quantity, unit,
              unit_price, total_price, edited)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13,$14,$15,$16,false)`,
          [
            randomUUID(),
            invoiceId,
            imageId,
            lr.line_no,
            lr.raw_text,
            lr.classification,
            lr.confidence_band,
            lr.confidence_score,
            lr.matched_sku_id,
            lr.brand_id,
            lr.brand_name,
            lr.is_competitor,
            lr.quantity,
            lr.unit,
            lr.unit_price,
            lr.total_price,
          ],
        );
      }
    }
  }

  // ---- summary -------------------------------------------------------------
  const counts: Array<{ k: string; v: string }> = await ds.query(
    `SELECT 'invoices' k, COUNT(*)::text v FROM taro_v2_invoices WHERE notes=$1
     UNION ALL SELECT 'distinct_toko', COUNT(DISTINCT store_id)::text FROM taro_v2_invoices WHERE notes=$1
     UNION ALL SELECT 'distinct_wilayah', COUNT(DISTINCT area_id)::text FROM taro_v2_invoices WHERE notes=$1`,
    [SENTINEL],
  );

  console.log('\nSeed complete. Demo-owned rows:');
  for (const c of counts) console.log(`  ${c.k.padEnd(18)} ${c.v}`);
  console.log(`  taco_lines         ${totalTacoLines}`);
  console.log(`  competitor_lines   ${totalCompetitorLines} (resolved ${resolvedCompetitorLines} / unknown ${unknownCompetitorLines})`);
  console.log(`  images             ${totalImages}`);
  console.log(`  planted_outlier    ${plantedOutlier ? 'yes (Amber Elm @ Bandung 195000)' : 'NO — CHECK'}`);

  await ds.destroy();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
