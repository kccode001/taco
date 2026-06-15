/** TACO v2 — Intelijen Pasar (Market Intelligence) API client — v3 4-section.
 *  Wraps the `/api/v2/market-intel/*` endpoints (PRD §8, 2026-06-15 analytics-v3)
 *  that power the rewritten /taro/v2/analytics page. Reuses the authed v1 axios.
 *
 *  Endpoints (this revision):
 *    GET /coverage                       — truth banner + page chip (AC-1/2)
 *    GET /top-skus-per-area?period&area&top_n   — §1 card 3 TACO top-10 (AC-30/19)
 *    GET /top-non-taco?period&area&top_n&sort    — §1 card 4 (AC-31)
 *    GET /category-distribution?period&area      — §2 pie (AC-32)
 *    GET /category-monthly-trend?period&area     — §2 line (AC-33)
 *    GET /category-skus?category&period&area     — §2 drill (AC-34)
 *    GET /price-bands?q&page&page_size&period&area — §3 table +qty (AC-4/35/36)
 *    GET /sku-price-history?sku_id&period&area&store_id — §3 modal +qty (AC-7/25/26/27)
 *    GET /sku-store-pricing?sku_id&period&area    — §3 modal per-store (AC-37)
 *    GET /brand-bucket-distribution?period&area  — §4 pie (AC-38/41)
 *    GET /brand-bucket-detail?bucket&brand&sku&period&area&q&page — §4 drill (AC-39/40)
 *
 *  HONESTY / MOCK POLICY (KC rule: no mock on the live surface):
 *  - DEFAULT = live only. If an endpoint errors (incl. pre-launch 404 before
 *    Mortar lands his v3 routes), the calling panel renders its own honest ERROR
 *    state — never fabricated numbers.
 *  - A mock dataset exists ONLY for pre-launch self-test / Demo-Day dry-runs and
 *    is OPT-IN: enable with build env `NEXT_PUBLIC_MI_MOCK=1` or the URL query
 *    `?mi_mock=1`. `?mi_state=thin|zero|empty|error` forces a panel state for
 *    screenshotting each AC. None of this triggers unless explicitly requested. */

import { api } from "@/lib/api";
import type {
  CoverageV2,
  PaginationV2,
  PriceBandsV2,
  PriceBandRow,
  SkuPriceHistoryV2,
  SkuPriceInvoiceRow,
  TopSkusPerAreaV2,
  TopNonTacoV2,
  TopNonTacoRow,
  CategoryDistributionV2,
  CategoryMonthlyTrendV2,
  CategorySkusV2,
  CategorySkuRow,
  SkuStorePricingV2,
  BrandBucketDistributionV2,
  BrandBucketDetailV2,
  BrandBucket,
} from "./types";

export interface MarketScope {
  period: string;
  /** Region id; empty/undefined = all areas. */
  area?: string;
}

type MiDebugState = "thin" | "zero" | "empty" | "error" | null;

const PAGE_SIZE = 10;

function miParams(scope: MarketScope, extra?: Record<string, string>) {
  return {
    period: scope.period,
    ...(scope.area ? { area: scope.area } : {}),
    ...(extra ?? {}),
  };
}

/** TypeORM numeric(18,3) columns arrive as strings ("70000.000") — coerce. */
const num = (v: unknown): number =>
  typeof v === "string" ? parseFloat(v) || 0 : typeof v === "number" ? v : 0;

/** BE returns percents already ×100 (e.g. 34.0); canonical = fraction (0.34). */
const pctToFrac = (p: unknown): number => {
  const n = num(p);
  return Number.isFinite(n) ? n / 100 : 0;
};

/** Whether the opt-in mock layer is active (env flag or `?mi_mock=1`). */
export function isMiMock(): boolean {
  if (process.env.NEXT_PUBLIC_MI_MOCK === "1") return true;
  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search).get("mi_mock") === "1";
  }
  return false;
}

function miDebugState(): MiDebugState {
  if (typeof window === "undefined") return null;
  const s = new URLSearchParams(window.location.search).get("mi_state");
  if (s === "thin" || s === "zero" || s === "empty" || s === "error") return s;
  return null;
}

async function liveOrMock<T>(live: () => Promise<T>, mock: () => T): Promise<T> {
  if (isMiMock()) {
    if (miDebugState() === "error") throw new Error("mi_state=error (forced)");
    return mock();
  }
  return live();
}

// ════════════════════════════════════════════════════════════════════════════
// LIVE adapters — Mortar's wire JSON → FE canonical. Tolerant on field aliases
// and numeric-string coercion so shape drift degrades gracefully rather than
// NaN-ing the panel.
// ════════════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

function adaptCoverage(be: any): CoverageV2 {
  return {
    n_invoices: num(be?.n_invoices),
    m_stores: num(be?.m_stores),
    k_areas: num(be?.k_areas),
    last_invoice_date: be?.last_invoice_date ?? null,
  };
}

function adaptPagination(be: any): PaginationV2 | undefined {
  if (!be) return undefined;
  return {
    page: num(be.page) || 1,
    page_size: num(be.page_size) || PAGE_SIZE,
    total: num(be.total),
  };
}

function adaptPriceBands(be: any): PriceBandsV2 {
  const list: any[] = be?.price_bands ?? be?.skus ?? be?.rows ?? [];
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    pagination: adaptPagination(be?.pagination),
    skus: list.map(
      (b): PriceBandRow => ({
        sku_id: String(b.sku_id),
        sku_name: b.sku_name ?? "",
        sku_code: b.sku_code ?? null,
        catalog_category: b.catalog_category ?? null,
        n_invoices: num(b.n_invoices),
        p_min: num(b.p_min),
        p_median: num(b.p_median),
        p_avg: b.p_avg != null ? num(b.p_avg) : undefined,
        p_max: num(b.p_max),
        price_sum_sample: b.price_sum_sample != null ? num(b.price_sum_sample) : undefined,
        spread_pct: pctToFrac(b.spread_pct),
        outliers: (b.outliers ?? []).map((o: any) => ({
          invoice_id: String(o.invoice_id),
          supplier_name: o.supplier_name ?? "",
          region_name: o.region_name ?? "",
          unit_price: num(o.unit_price),
          direction: o.direction === "below" ? "below" : "above",
          invoice_date: o.invoice_date ?? undefined,
        })),
        unit: b.unit ?? undefined,
        qty_min: b.qty_min != null ? num(b.qty_min) : undefined,
        qty_avg: b.qty_avg != null ? num(b.qty_avg) : undefined,
        qty_max: b.qty_max != null ? num(b.qty_max) : undefined,
        qty_sum_sample: b.qty_sum_sample != null ? num(b.qty_sum_sample) : undefined,
        qty_missing_pct: b.qty_missing_pct != null ? pctToFrac(b.qty_missing_pct) : undefined,
        n_qty_present: b.n_qty_present != null ? num(b.n_qty_present) : undefined,
        n_lines: b.n_lines != null ? num(b.n_lines) : undefined,
      })
    ),
  };
}

function adaptHistory(be: any): SkuPriceHistoryV2 {
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    sku_id: String(be?.sku_id ?? ""),
    sku_name: be?.sku_name ?? "",
    sku_code: be?.sku_code ?? null,
    catalog_category: be?.catalog_category ?? null,
    p_min: num(be?.p_min),
    p_avg: num(be?.p_avg ?? be?.p_average ?? be?.p_mean),
    p_max: num(be?.p_max),
    price_sum_sample: be?.price_sum_sample != null ? num(be.price_sum_sample) : undefined,
    unit: be?.unit ?? undefined,
    qty_min: be?.qty_min != null ? num(be.qty_min) : undefined,
    qty_avg: be?.qty_avg != null ? num(be.qty_avg) : undefined,
    qty_max: be?.qty_max != null ? num(be.qty_max) : undefined,
    qty_sum_sample: be?.qty_sum_sample != null ? num(be.qty_sum_sample) : undefined,
    qty_missing_pct: be?.qty_missing_pct != null ? pctToFrac(be.qty_missing_pct) : undefined,
    n_qty_present: be?.n_qty_present != null ? num(be.n_qty_present) : undefined,
    n_lines: be?.n_lines != null ? num(be.n_lines) : undefined,
    trend: (be?.trend ?? []).map((t: any) => ({
      invoice_id: String(t.invoice_id),
      invoice_date: t.invoice_date,
      unit_price: num(t.unit_price),
      quantity: t.quantity != null ? num(t.quantity) : null,
      store_id: t.store_id ?? null,
      store_name: t.store_name ?? "",
      region_id: t.region_id ?? null,
      region_name: t.region_name ?? "",
      outlier_direction: t.outlier_direction ?? null,
    })),
    invoices: (be?.invoices ?? []).map((e: any) => ({
      invoice_id: String(e.invoice_id),
      store_name: e.store_name ?? "",
      region_name: e.region_name ?? "",
      supplier_name: e.supplier_name ?? "",
      invoice_date: e.invoice_date,
      unit_price: num(e.unit_price),
      quantity: e.quantity != null ? num(e.quantity) : null,
      image_url: e.image_url ?? e.raw_image_url ?? null,
      outlier_direction: e.outlier_direction ?? null,
    })),
  };
}

function adaptTopSkus(be: any): TopSkusPerAreaV2 {
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    regions: (be?.regions ?? []).map((r: any) => ({
      region_id: r.region_id ?? null,
      region_name: r.region_name ?? "",
      n_invoices: num(r.n_invoices),
      skus: (r.skus ?? []).map((s: any) => ({
        sku_id: String(s.sku_id),
        sku_name: s.sku_name ?? "",
        occurrence_count: num(s.occurrence_count),
        occurrence_pct: pctToFrac(s.occurrence_pct),
      })),
    })),
  };
}

function adaptTopNonTaco(be: any): TopNonTacoV2 {
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    rows: (be?.rows ?? []).map(
      (r: any): TopNonTacoRow => ({
        bucket: r.bucket === "kompetitor" ? "kompetitor" : "lain_lain",
        brand_name: r.brand_name ?? null,
        label: r.label ?? r.sku_label ?? r.ocr_text ?? "",
        sku_code: r.sku_code ?? null,
        n_invoices: num(r.n_invoices),
        median_qty: num(r.median_qty),
        median_price: num(r.median_price),
      })
    ),
  };
}

function adaptCategoryDist(be: any): CategoryDistributionV2 {
  const cats: any[] = be?.categories ?? be?.rows ?? [];
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    total_taco_lines: num(be?.total_taco_lines),
    categories: cats.map((c) => ({
      category: c.category ?? "Tidak terkategori",
      n_lines: num(c.n_lines),
      pct: c.pct != null ? pctToFrac(c.pct) : 0,
    })),
  };
}

function adaptCategoryTrend(be: any): CategoryMonthlyTrendV2 {
  const rows: any[] = be?.rows ?? [];
  const mapped = rows.map((r) => ({
    month: r.month ?? "",
    category: r.category ?? "Tidak terkategori",
    invoice_count: num(r.invoice_count),
  }));
  const months: string[] = be?.months ?? Array.from(new Set(mapped.map((r) => r.month)));
  const categories: string[] =
    be?.categories ?? Array.from(new Set(mapped.map((r) => r.category)));
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    months,
    categories,
    rows: mapped,
  };
}

function adaptCategorySkus(be: any): CategorySkusV2 {
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    category: be?.category ?? "",
    sub_categories: be?.sub_categories ?? undefined,
    skus: (be?.skus ?? []).map(
      (s: any): CategorySkuRow => ({
        sku_id: String(s.sku_id),
        sku_name: s.sku_name ?? "",
        sku_code: s.sku_code ?? null,
        sub_category: s.sub_category ?? s.category ?? null,
        n_invoices: num(s.n_invoices),
      })
    ),
  };
}

function adaptStorePricing(be: any): SkuStorePricingV2 {
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    stores: (be?.stores ?? []).map((s: any) => ({
      store_id: String(s.store_id ?? s.store_name ?? ""),
      store_name: s.store_name ?? "",
      region_name: s.region_name ?? "",
      n_invoices: num(s.n_invoices),
      p_min: num(s.p_min),
      p_avg: num(s.p_avg),
      p_max: num(s.p_max),
      history: (s.history ?? []).map((h: any) => ({
        invoice_date: h.invoice_date,
        unit_price: num(h.unit_price),
      })),
    })),
  };
}

function adaptBrandBucketDist(be: any): BrandBucketDistributionV2 {
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    unknown_competitor_count: num(be?.unknown_competitor_count),
    buckets: (be?.buckets ?? []).map((b: any) => ({
      bucket: (b.bucket ?? "lain_lain") as BrandBucket,
      n_lines: num(b.n_lines),
      pct: b.pct != null ? pctToFrac(b.pct) : 0,
    })),
  };
}

function adaptBrandBucketDetail(be: any): BrandBucketDetailV2 {
  const inv: any[] = be?.invoices ?? [];
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    bucket: (be?.bucket ?? "kompetitor") as BrandBucket,
    pagination: adaptPagination(be?.pagination),
    unknown_competitor_count:
      be?.unknown_competitor_count != null ? num(be.unknown_competitor_count) : undefined,
    brands: be?.brands
      ? be.brands.map((b: any) => ({
          brand_id: b.brand_id ?? null,
          brand_name: b.brand_name ?? "",
          n_lines: num(b.n_lines),
          n_invoices: num(b.n_invoices),
        }))
      : undefined,
    skus: be?.skus
      ? be.skus.map((s: any) => ({
          sku_label: s.sku_label ?? s.sku_name ?? "",
          sku_code: s.sku_code ?? null,
          sku_id: s.sku_id != null ? String(s.sku_id) : null,
          n_invoices: num(s.n_invoices),
          p_min: num(s.p_min),
          p_avg: num(s.p_avg),
          p_max: num(s.p_max),
        }))
      : undefined,
    invoices: be?.invoices
      ? inv.map(
          (e: any): SkuPriceInvoiceRow => ({
            invoice_id: String(e.invoice_id),
            store_name: e.store_name ?? "",
            region_name: e.region_name ?? "",
            supplier_name: e.supplier_name ?? "",
            invoice_date: e.invoice_date,
            unit_price: num(e.unit_price),
            quantity: e.quantity != null ? num(e.quantity) : null,
            image_url: e.image_url ?? e.raw_image_url ?? null,
            outlier_direction: e.outlier_direction ?? null,
          })
        )
      : undefined,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ════════════════════════════════════════════════════════════════════════════
// MOCK dataset (pre-launch self-test only) — authored in canonical shape, so
// the live adapters above are bypassed. Numbers mirror the v3 design fixture
// (42 invoice · 24 toko · 4 wilayah) so screenshots match design/12-*.html.
// Fixtures use TACO's real catalog families (HPL / laminate / flooring / edging
// / FIDECO), NOT the retired v2 mortar placeholders.
// ════════════════════════════════════════════════════════════════════════════

const MOCK_DATE = "2026-06-14";
const fullCov: CoverageV2 = { n_invoices: 42, m_stores: 24, k_areas: 4, last_invoice_date: MOCK_DATE };
const areaCov: CoverageV2 = { n_invoices: 14, m_stores: 8, k_areas: 1, last_invoice_date: MOCK_DATE };

function thinCoverage(): CoverageV2 {
  return { n_invoices: 2, m_stores: 1, k_areas: 1, last_invoice_date: "2026-06-10" };
}

/** Generic client-side paginate + case-insensitive substring search for mocks. */
function paginate<T>(
  rows: T[],
  q: string | undefined,
  page: number,
  match: (r: T, needle: string) => boolean
): { rows: T[]; pagination: PaginationV2 } {
  const needle = (q ?? "").trim().toLowerCase();
  const filtered = needle ? rows.filter((r) => match(r, needle)) : rows;
  const total = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  return {
    rows: filtered.slice(start, start + PAGE_SIZE),
    pagination: { page, page_size: PAGE_SIZE, total },
  };
}

interface MockSku {
  sku_id: string;
  sku_name: string;
  sku_code: string;
  catalog_category: string;
  sub_category: string;
  unit: string;
  n_invoices: number;
  p_min: number;
  p_avg: number;
  p_max: number;
  price_sum_sample: number;
  qty_min: number;
  qty_avg: number;
  qty_max: number;
  qty_sum_sample: number;
  n_qty_present: number;
  n_lines: number;
  outlier: "above" | "below" | null;
}

const MOCK_SKUS: MockSku[] = [
  { sku_id: "sku-hpl-th061", sku_name: "TACO HPL TH-061 AA Doff", sku_code: "HPL-TH061", catalog_category: "Laminates", sub_category: "HPL", unit: "lbr", n_invoices: 31, p_min: 142000, p_avg: 168000, p_max: 235000, price_sum_sample: 5200000, qty_min: 12, qty_avg: 34, qty_max: 80, qty_sum_sample: 952, n_qty_present: 28, n_lines: 31, outlier: "above" },
  { sku_id: "sku-sheet-s2101", sku_name: "TACO Sheet S2-101 Putih", sku_code: "SHT-S2101", catalog_category: "Laminates", sub_category: "SHEET", unit: "lbr", n_invoices: 27, p_min: 88000, p_avg: 96000, p_max: 110000, price_sum_sample: 2600000, qty_min: 8, qty_avg: 21, qty_max: 50, qty_sum_sample: 525, n_qty_present: 25, n_lines: 27, outlier: null },
  { sku_id: "sku-edg-pvc22", sku_name: "TACO Edging PVC 22mm", sku_code: "EDG-PVC22", catalog_category: "Hardware", sub_category: "EDGING", unit: "roll", n_invoices: 22, p_min: 28000, p_avg: 31000, p_max: 38000, price_sum_sample: 700000, qty_min: 3, qty_avg: 9, qty_max: 24, qty_sum_sample: 72, n_qty_present: 8, n_lines: 22, outlier: null },
  { sku_id: "sku-vnl-vf303", sku_name: "TACO Vinyl VF-303 Oak", sku_code: "VNL-VF303", catalog_category: "Flooring", sub_category: "VINYL", unit: "m²", n_invoices: 18, p_min: 88000, p_avg: 121000, p_max: 130000, price_sum_sample: 2200000, qty_min: 5, qty_avg: 16, qty_max: 40, qty_sum_sample: 256, n_qty_present: 16, n_lines: 18, outlier: "below" },
  { sku_id: "sku-fdc-ply18", sku_name: "FIDECO Plywood 18mm", sku_code: "FDC-PLY18", catalog_category: "FIDECO", sub_category: "PLYWOOD", unit: "lbr", n_invoices: 15, p_min: 168000, p_avg: 182000, p_max: 205000, price_sum_sample: 2700000, qty_min: 4, qty_avg: 12, qty_max: 30, qty_sum_sample: 168, n_qty_present: 14, n_lines: 15, outlier: null },
  { sku_id: "sku-eco-eh2203", sku_name: "TACO ECO HPL EH-2203", sku_code: "EH-2203", catalog_category: "Laminates", sub_category: "ECO_HPL", unit: "lbr", n_invoices: 12, p_min: 96000, p_avg: 108000, p_max: 124000, price_sum_sample: 1300000, qty_min: 5, qty_avg: 14, qty_max: 32, qty_sum_sample: 168, n_qty_present: 11, n_lines: 12, outlier: null },
  { sku_id: "sku-hpl-th204", sku_name: "TACO HPL TH-204 Walnut", sku_code: "HPL-TH204", catalog_category: "Laminates", sub_category: "HPL", unit: "lbr", n_invoices: 10, p_min: 150000, p_avg: 172000, p_max: 198000, price_sum_sample: 1720000, qty_min: 6, qty_avg: 18, qty_max: 36, qty_sum_sample: 180, n_qty_present: 9, n_lines: 10, outlier: null },
  { sku_id: "sku-flr-lvt22", sku_name: "TACO Lantai LVT-22 Teak", sku_code: "FLR-LVT22", catalog_category: "Flooring", sub_category: "VINYL", unit: "m²", n_invoices: 9, p_min: 110000, p_avg: 128000, p_max: 145000, price_sum_sample: 1150000, qty_min: 4, qty_avg: 11, qty_max: 28, qty_sum_sample: 99, n_qty_present: 8, n_lines: 9, outlier: null },
  { sku_id: "sku-hdw-screw", sku_name: "TACO Sekrup Panel 4cm", sku_code: "HDW-SCR40", catalog_category: "Hardware", sub_category: "HARDWARE", unit: "dus", n_invoices: 8, p_min: 42000, p_avg: 48000, p_max: 55000, price_sum_sample: 384000, qty_min: 2, qty_avg: 7, qty_max: 15, qty_sum_sample: 56, n_qty_present: 7, n_lines: 8, outlier: null },
  { sku_id: "sku-fdc-mdf12", sku_name: "FIDECO MDF 12mm", sku_code: "FDC-MDF12", catalog_category: "FIDECO", sub_category: "PLYWOOD", unit: "lbr", n_invoices: 7, p_min: 132000, p_avg: 148000, p_max: 165000, price_sum_sample: 1036000, qty_min: 3, qty_avg: 9, qty_max: 22, qty_sum_sample: 63, n_qty_present: 6, n_lines: 7, outlier: null },
  { sku_id: "sku-hpl-th099", sku_name: "TACO HPL TH-099 Beton", sku_code: "HPL-TH099", catalog_category: "Laminates", sub_category: "HPL", unit: "lbr", n_invoices: 6, p_min: 138000, p_avg: 158000, p_max: 176000, price_sum_sample: 948000, qty_min: 4, qty_avg: 10, qty_max: 20, qty_sum_sample: 60, n_qty_present: 5, n_lines: 6, outlier: null },
  { sku_id: "sku-edg-abs10", sku_name: "TACO Edging ABS 10mm", sku_code: "EDG-ABS10", catalog_category: "Hardware", sub_category: "EDGING", unit: "roll", n_invoices: 5, p_min: 22000, p_avg: 26000, p_max: 31000, price_sum_sample: 130000, qty_min: 2, qty_avg: 6, qty_max: 14, qty_sum_sample: 30, n_qty_present: 4, n_lines: 5, outlier: null },
  { sku_id: "sku-flr-spc01", sku_name: "TACO SPC Floor 01 Maple", sku_code: "FLR-SPC01", catalog_category: "Flooring", sub_category: "VINYL", unit: "m²", n_invoices: 4, p_min: 135000, p_avg: 152000, p_max: 168000, price_sum_sample: 608000, qty_min: 5, qty_avg: 13, qty_max: 26, qty_sum_sample: 52, n_qty_present: 4, n_lines: 4, outlier: null },
  { sku_id: "sku-misc-glue", sku_name: "TACO Lem HPL 600gr", sku_code: "ADH-LEM600", catalog_category: "", sub_category: "LAINNYA", unit: "klg", n_invoices: 3, p_min: 38000, p_avg: 43000, p_max: 49000, price_sum_sample: 129000, qty_min: 2, qty_avg: 5, qty_max: 10, qty_sum_sample: 15, n_qty_present: 3, n_lines: 3, outlier: null },
];

function toBandRow(s: MockSku): PriceBandRow {
  const median = Math.round((s.p_min + s.p_max) / 2);
  const outliers = s.outlier
    ? [
        {
          invoice_id: `${s.sku_code}-OUT`,
          supplier_name: s.outlier === "above" ? "PT Karya Panel" : "UD Mitra Laminate",
          region_name: s.outlier === "above" ? "Jakarta" : "Surabaya",
          unit_price: s.outlier === "above" ? s.p_max : s.p_min,
          direction: s.outlier,
          invoice_date: "2026-06-12",
        },
      ]
    : [];
  return {
    sku_id: s.sku_id,
    sku_name: s.sku_name,
    sku_code: s.sku_code,
    catalog_category: s.catalog_category || null,
    n_invoices: s.n_invoices,
    p_min: s.p_min,
    p_median: median,
    p_avg: s.p_avg,
    p_max: s.p_max,
    price_sum_sample: s.price_sum_sample,
    spread_pct: (s.p_max - s.p_min) / median,
    outliers,
    unit: s.unit,
    qty_min: s.qty_min,
    qty_avg: s.qty_avg,
    qty_max: s.qty_max,
    qty_sum_sample: s.qty_sum_sample,
    qty_missing_pct: 1 - s.n_qty_present / s.n_lines,
    n_qty_present: s.n_qty_present,
    n_lines: s.n_lines,
  };
}

function buildMockBands(scope: MarketScope, q?: string, page = 1): PriceBandsV2 {
  const rowsAll = MOCK_SKUS.map(toBandRow);
  const { rows, pagination } = paginate(rowsAll, q, page, (r, n) =>
    r.sku_name.toLowerCase().includes(n) || (r.sku_code ?? "").toLowerCase().includes(n)
  );
  return { coverage: scope.area ? areaCov : fullCov, skus: rows, pagination };
}

function buildMockHistory(
  skuId: string,
  area?: string,
  storeId?: string
): SkuPriceHistoryV2 {
  const sku = MOCK_SKUS.find((s) => s.sku_id === skuId) ?? MOCK_SKUS[0];
  // Full (Semua/Semua) contributing set — 6 invoices, last = outlier when planted.
  const stores = [
    { store_id: "st-maju", store_name: "Toko Maju Interior", region_id: "r-jkt", region_name: "Jakarta", supplier_name: "PT Karya Panel" },
    { store_id: "st-sumber", store_name: "Sumber Dekorasi", region_id: "r-bdg", region_name: "Bandung", supplier_name: "UD Mitra Laminate" },
    { store_id: "st-interior", store_name: "Interior Jaya", region_id: "r-sby", region_name: "Surabaya", supplier_name: "PT Sumber Panel" },
  ];
  const base = sku.p_avg;
  const planted = sku.outlier === "above" ? sku.p_max : sku.outlier === "below" ? sku.p_min : base;
  const full = [
    { ...stores[1], invoice_id: `${sku.sku_code}-1`, invoice_date: "2026-06-02", unit_price: base - 10000, quantity: sku.qty_min, image_url: null as string | null, outlier_direction: null as "above" | "below" | null },
    { ...stores[0], invoice_id: `${sku.sku_code}-2`, invoice_date: "2026-06-04", unit_price: base - 4000, quantity: sku.qty_avg, image_url: "https://placehold.co/600x800/png?text=INV2", outlier_direction: null },
    { ...stores[2], invoice_id: `${sku.sku_code}-3`, invoice_date: "2026-06-06", unit_price: base, quantity: sku.qty_avg, image_url: "https://placehold.co/600x800/png?text=INV3", outlier_direction: null },
    { ...stores[1], invoice_id: `${sku.sku_code}-4`, invoice_date: "2026-06-08", unit_price: base + 2000, quantity: sku.qty_max, image_url: null, outlier_direction: null },
    { ...stores[2], invoice_id: `${sku.sku_code}-5`, invoice_date: "2026-06-10", unit_price: base - 2000, quantity: sku.qty_avg, image_url: "https://placehold.co/600x800/png?text=INV5", outlier_direction: null },
    { ...stores[0], invoice_id: `${sku.sku_code}-6`, invoice_date: "2026-06-12", unit_price: planted, quantity: sku.qty_min, image_url: "https://placehold.co/600x800/png?text=INV6", outlier_direction: sku.outlier },
  ];
  let rows = full;
  if (storeId) rows = full.filter((r) => r.store_id === storeId).slice(0, 2);
  else if (area) rows = full.filter((r) => r.region_id === area);
  const prices = rows.map((r) => r.unit_price);
  const qtys = rows.map((r) => r.quantity).filter((q): q is number => q != null && q > 0);
  const p_min = prices.length ? Math.min(...prices) : 0;
  const p_max = prices.length ? Math.max(...prices) : 0;
  const p_avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  const storeSet = new Set(rows.map((r) => r.store_id));
  const areaSet = new Set(rows.map((r) => r.region_name));
  return {
    coverage: {
      n_invoices: rows.length,
      m_stores: storeSet.size,
      k_areas: areaSet.size,
      last_invoice_date: rows.length ? rows[rows.length - 1].invoice_date : null,
    },
    sku_id: sku.sku_id,
    sku_name: sku.sku_name,
    sku_code: sku.sku_code,
    catalog_category: sku.catalog_category || null,
    p_min,
    p_avg,
    p_max,
    price_sum_sample: prices.reduce((a, b) => a + b, 0),
    unit: sku.unit,
    qty_min: qtys.length ? Math.min(...qtys) : 0,
    qty_avg: qtys.length ? Math.round(qtys.reduce((a, b) => a + b, 0) / qtys.length) : 0,
    qty_max: qtys.length ? Math.max(...qtys) : 0,
    qty_sum_sample: qtys.reduce((a, b) => a + b, 0),
    qty_missing_pct: rows.length ? 1 - qtys.length / rows.length : 0,
    n_qty_present: qtys.length,
    n_lines: rows.length,
    trend: rows.map((r) => ({
      invoice_id: r.invoice_id,
      invoice_date: r.invoice_date,
      unit_price: r.unit_price,
      quantity: r.quantity,
      store_id: r.store_id,
      store_name: r.store_name,
      region_id: r.region_id,
      region_name: r.region_name,
      outlier_direction: r.outlier_direction,
    })),
    invoices: [...rows].reverse().map((r) => ({
      invoice_id: r.invoice_id,
      store_name: r.store_name,
      region_name: r.region_name,
      supplier_name: r.supplier_name,
      invoice_date: r.invoice_date,
      unit_price: r.unit_price,
      quantity: r.quantity,
      image_url: r.image_url,
      outlier_direction: r.outlier_direction,
    })),
  };
}

function buildMockStorePricing(skuId: string): SkuStorePricingV2 {
  const sku = MOCK_SKUS.find((s) => s.sku_id === skuId) ?? MOCK_SKUS[0];
  const base = sku.p_avg;
  const maxp = sku.outlier === "above" ? sku.p_max : base + 12000;
  return {
    coverage: { n_invoices: sku.n_invoices, m_stores: 3, k_areas: 3, last_invoice_date: MOCK_DATE },
    stores: [
      { store_id: "st-maju", store_name: "Toko Maju Interior", region_name: "Jakarta", n_invoices: 9, p_min: base - 10000, p_avg: base + 2000, p_max: maxp, history: [
        { invoice_date: "2026-05-28", unit_price: base - 8000 }, { invoice_date: "2026-06-02", unit_price: base - 4000 }, { invoice_date: "2026-06-06", unit_price: base - 2000 }, { invoice_date: "2026-06-09", unit_price: base }, { invoice_date: "2026-06-12", unit_price: maxp },
      ] },
      { store_id: "st-sumber", store_name: "Sumber Dekorasi", region_name: "Bandung", n_invoices: 7, p_min: sku.p_min, p_avg: base - 8000, p_max: base, history: [
        { invoice_date: "2026-05-30", unit_price: sku.p_min }, { invoice_date: "2026-06-05", unit_price: base - 10000 }, { invoice_date: "2026-06-10", unit_price: base },
      ] },
      { store_id: "st-interior", store_name: "Interior Jaya", region_name: "Surabaya", n_invoices: 6, p_min: base - 6000, p_avg: base, p_max: base + 8000, history: [
        { invoice_date: "2026-06-01", unit_price: base - 6000 }, { invoice_date: "2026-06-08", unit_price: base + 8000 },
      ] },
    ],
  };
}

const MOCK_TOPSKU_NAMES: [string, string, number][] = [
  ["sku-hpl-th061", "TACO HPL TH-061 AA Doff", 31],
  ["sku-sheet-s2101", "TACO Sheet S2-101 Putih", 27],
  ["sku-edg-pvc22", "TACO Edging PVC 22mm", 22],
  ["sku-vnl-vf303", "TACO Vinyl VF-303 Oak", 18],
  ["sku-fdc-ply18", "FIDECO Plywood 18mm", 15],
  ["sku-eco-eh2203", "TACO ECO HPL EH-2203", 12],
  ["sku-hpl-th204", "TACO HPL TH-204 Walnut", 10],
  ["sku-flr-lvt22", "TACO Lantai LVT-22 Teak", 9],
  ["sku-hdw-screw", "TACO Sekrup Panel 4cm", 8],
  ["sku-fdc-mdf12", "FIDECO MDF 12mm", 7],
];

function buildMockTopSkus(scope: MarketScope): TopSkusPerAreaV2 {
  const mkSkus = (n_invoices: number, names: [string, string, number][]) =>
    names.map(([id, nm, c]) => ({
      sku_id: id,
      sku_name: nm,
      occurrence_count: c,
      occurrence_pct: Math.min(1, c / n_invoices),
    }));
  if (scope.area) {
    return {
      coverage: areaCov,
      regions: [
        { region_id: "r-jkt", region_name: "Jakarta", n_invoices: 14, skus: mkSkus(14, MOCK_TOPSKU_NAMES.map(([i, n, c]) => [i, n, Math.max(2, Math.round(c * 0.45))])) },
      ],
    };
  }
  return {
    coverage: fullCov,
    regions: [
      { region_id: "r-jkt", region_name: "Jakarta", n_invoices: 14, skus: mkSkus(14, MOCK_TOPSKU_NAMES.slice(0, 6).map(([i, n, c]) => [i, n, Math.max(2, Math.round(c * 0.45))])) },
      { region_id: "r-bdg", region_name: "Bandung", n_invoices: 12, skus: mkSkus(12, MOCK_TOPSKU_NAMES.slice(0, 6).map(([i, n, c]) => [i, n, Math.max(2, Math.round(c * 0.38))])) },
      { region_id: "r-sby", region_name: "Surabaya", n_invoices: 10, skus: mkSkus(10, MOCK_TOPSKU_NAMES.slice(0, 6).map(([i, n, c]) => [i, n, Math.max(2, Math.round(c * 0.32))])) },
      // Medan — N<3 → AC-3 per-column thin-data in the page (carried for §1 area filter).
      { region_id: "r-mdn", region_name: "Medan", n_invoices: 2, skus: [] },
    ],
  };
}

const MOCK_TOPNONTACO: TopNonTacoRow[] = [
  { bucket: "kompetitor", brand_name: "Violam", label: "VL-880", sku_code: "VL-880", n_invoices: 19, median_qty: 22, median_price: 145000 },
  { bucket: "kompetitor", brand_name: "Greenlam", label: "G-1201", sku_code: "G-1201", n_invoices: 14, median_qty: 12, median_price: 152000 },
  { bucket: "lain_lain", brand_name: null, label: "Lem Kuning 600gr", n_invoices: 12, median_qty: 30, median_price: 41000 },
  { bucket: "kompetitor", brand_name: "Grasmerino", label: "GM-44", sku_code: "GM-44", n_invoices: 9, median_qty: 8, median_price: 138000 },
  { bucket: "lain_lain", brand_name: null, label: "Paku 5cm", n_invoices: 7, median_qty: 40, median_price: 18000 },
  { bucket: "kompetitor", brand_name: "Lamitak", label: "LT-300", sku_code: "LT-300", n_invoices: 5, median_qty: 6, median_price: 160000 },
  { bucket: "lain_lain", brand_name: null, label: "Engsel Sendok", n_invoices: 4, median_qty: 15, median_price: 12000 },
];

function buildMockTopNonTaco(sort: string): TopNonTacoV2 {
  const rows = [...MOCK_TOPNONTACO].sort((a, b) =>
    sort === "price" ? b.median_price - a.median_price : b.median_qty - a.median_qty
  );
  return { coverage: fullCov, rows };
}

const MOCK_CATEGORIES: { category: string; n_lines: number }[] = [
  { category: "Laminates", n_lines: 214 },
  { category: "Flooring", n_lines: 112 },
  { category: "Hardware", n_lines: 84 },
  { category: "FIDECO", n_lines: 42 },
  { category: "Tidak terkategori", n_lines: 14 },
];

function buildMockCategoryDist(): CategoryDistributionV2 {
  const total = MOCK_CATEGORIES.reduce((a, c) => a + c.n_lines, 0);
  return {
    coverage: fullCov,
    total_taco_lines: total,
    categories: MOCK_CATEGORIES.map((c) => ({ ...c, pct: c.n_lines / total })),
  };
}

function buildMockCategoryTrend(): CategoryMonthlyTrendV2 {
  const months = ["Feb", "Mar", "Apr", "Mei", "Jun"];
  const series: Record<string, number[]> = {
    Laminates: [6, 9, 12, 15, 18],
    Flooring: [2, 3, 5, 6, 8],
    Hardware: [1, 2, 3, 4, 4],
    FIDECO: [1, 1, 2, 2, 3],
  };
  const categories = Object.keys(series);
  const rows: CategoryMonthlyTrendV2["rows"] = [];
  for (const cat of categories) {
    months.forEach((m, i) => rows.push({ month: m, category: cat, invoice_count: series[cat][i] }));
  }
  return { coverage: fullCov, months, categories, rows };
}

function buildMockCategorySkus(category: string): CategorySkusV2 {
  const skus = MOCK_SKUS.filter(
    (s) => (s.catalog_category || "Tidak terkategori") === category
  ).map(
    (s): CategorySkuRow => ({
      sku_id: s.sku_id,
      sku_name: s.sku_name,
      sku_code: s.sku_code,
      sub_category: s.sub_category,
      n_invoices: s.n_invoices,
    })
  );
  return {
    coverage: { n_invoices: 31, m_stores: 19, k_areas: 4, last_invoice_date: MOCK_DATE },
    category,
    sub_categories: Array.from(new Set(skus.map((s) => s.sub_category).filter((x): x is string => !!x))),
    skus,
  };
}

function buildMockBrandBucketDist(): BrandBucketDistributionV2 {
  const buckets = [
    { bucket: "taco" as BrandBucket, n_lines: 641 },
    { bucket: "kompetitor" as BrandBucket, n_lines: 407 },
    { bucket: "lain_lain" as BrandBucket, n_lines: 185 },
  ];
  const total = buckets.reduce((a, b) => a + b.n_lines, 0);
  return {
    coverage: fullCov,
    unknown_competitor_count: 23,
    buckets: buckets.map((b) => ({ ...b, pct: b.n_lines / total })),
  };
}

const MOCK_KOMPETITOR_BRANDS = [
  { brand_id: "b-violam", brand_name: "Violam", n_lines: 168, n_invoices: 19 },
  { brand_id: "b-greenlam", brand_name: "Greenlam", n_lines: 121, n_invoices: 14 },
  { brand_id: "b-grasmerino", brand_name: "Grasmerino", n_lines: 91, n_invoices: 9 },
  { brand_id: "b-lamitak", brand_name: "Lamitak", n_lines: 27, n_invoices: 5 },
];

const MOCK_BRAND_SKUS: Record<string, { sku_label: string; n_invoices: number; p_min: number; p_avg: number; p_max: number }[]> = {
  "b-violam": [
    { sku_label: "VL-880 Doff Putih", n_invoices: 12, p_min: 128000, p_avg: 145000, p_max: 160000 },
    { sku_label: "VL-512 Oak", n_invoices: 5, p_min: 132000, p_avg: 150000, p_max: 168000 },
    { sku_label: "VL-204 Glossy", n_invoices: 3, p_min: 120000, p_avg: 138000, p_max: 152000 },
  ],
  "b-greenlam": [
    { sku_label: "G-1201 Carbon", n_invoices: 9, p_min: 138000, p_avg: 152000, p_max: 170000 },
    { sku_label: "G-880 Maple", n_invoices: 5, p_min: 130000, p_avg: 148000, p_max: 162000 },
  ],
  "b-grasmerino": [
    { sku_label: "GM-44 Linen", n_invoices: 6, p_min: 122000, p_avg: 138000, p_max: 150000 },
    { sku_label: "GM-12 Beton", n_invoices: 3, p_min: 118000, p_avg: 132000, p_max: 145000 },
  ],
  "b-lamitak": [{ sku_label: "LT-300 Doff", n_invoices: 5, p_min: 145000, p_avg: 160000, p_max: 178000 }],
};

const MOCK_LAINLAIN_SKUS = [
  { sku_label: "Lem Kuning 600gr", n_invoices: 12, p_min: 35000, p_avg: 41000, p_max: 48000 },
  { sku_label: "Paku 5cm (kiloan)", n_invoices: 7, p_min: 14000, p_avg: 18000, p_max: 24000 },
  { sku_label: "Engsel Sendok", n_invoices: 4, p_min: 9000, p_avg: 12000, p_max: 16000 },
];

function buildMockBrandDetail(
  bucket: BrandBucket,
  brand?: string,
  sku?: string,
  q?: string,
  page = 1
): BrandBucketDetailV2 {
  const unknown = 23;
  // Level 3 — invoice list for a SKU.
  if (sku) {
    const invoices: SkuPriceInvoiceRow[] = [
      { invoice_id: "3101", store_name: "Toko Maju Interior", region_name: "Jakarta", supplier_name: "PT Karya Panel", invoice_date: "2026-06-12", unit_price: 145000, quantity: 18, image_url: "https://placehold.co/600x800/png?text=3101", outlier_direction: null },
      { invoice_id: "3088", store_name: "Sumber Dekorasi", region_name: "Bandung", supplier_name: "UD Mitra Laminate", invoice_date: "2026-06-09", unit_price: 138000, quantity: 24, image_url: null, outlier_direction: null },
      { invoice_id: "3060", store_name: "Interior Jaya", region_name: "Surabaya", supplier_name: "PT Sumber Panel", invoice_date: "2026-06-05", unit_price: 152000, quantity: 12, image_url: "https://placehold.co/600x800/png?text=3060", outlier_direction: null },
    ];
    return { coverage: { n_invoices: invoices.length, m_stores: 3, k_areas: 3, last_invoice_date: MOCK_DATE }, bucket, invoices, unknown_competitor_count: unknown };
  }
  // Level 2 — SKU list for a brand (or whole bucket for taco/lain_lain).
  if (brand || bucket === "taco" || bucket === "lain_lain") {
    let list: { sku_label: string; sku_code?: string | null; sku_id?: string | null; n_invoices: number; p_min: number; p_avg: number; p_max: number }[];
    if (bucket === "taco") {
      list = MOCK_SKUS.slice(0, 6).map((s) => ({ sku_label: s.sku_name, sku_code: s.sku_code, sku_id: s.sku_id, n_invoices: s.n_invoices, p_min: s.p_min, p_avg: s.p_avg, p_max: s.p_max }));
    } else if (bucket === "lain_lain") {
      list = MOCK_LAINLAIN_SKUS.map((s) => ({ ...s, sku_code: null, sku_id: null }));
    } else {
      list = (MOCK_BRAND_SKUS[brand ?? ""] ?? []).map((s) => ({ ...s, sku_code: null, sku_id: null }));
    }
    const { rows, pagination } = paginate(list, q, page, (r, n) => r.sku_label.toLowerCase().includes(n));
    return { coverage: { n_invoices: 19, m_stores: 12, k_areas: 4, last_invoice_date: MOCK_DATE }, bucket, skus: rows, pagination, unknown_competitor_count: unknown };
  }
  // Level 1 — brand list (Kompetitor bucket).
  const brands =
    bucket === "kompetitor"
      ? MOCK_KOMPETITOR_BRANDS
      : [{ brand_id: "taco", brand_name: "TACO", n_lines: 641, n_invoices: 38 }];
  const { rows, pagination } = paginate(brands, q, page, (r, n) => r.brand_name.toLowerCase().includes(n));
  return { coverage: { n_invoices: 28, m_stores: 18, k_areas: 4, last_invoice_date: MOCK_DATE }, bucket, brands: rows, pagination, unknown_competitor_count: unknown };
}

// ════════════════════════════════════════════════════════════════════════════
// Fetchers (live-first; mock only when explicitly opted in)
// ════════════════════════════════════════════════════════════════════════════

export async function fetchCoverage(scope: MarketScope): Promise<CoverageV2> {
  return liveOrMock<CoverageV2>(
    async () =>
      adaptCoverage(
        (await api.get("/v2/market-intel/coverage", { params: miParams(scope) })).data
      ),
    () => {
      if (miDebugState() === "thin") return thinCoverage();
      if (miDebugState() === "empty")
        return { n_invoices: 0, m_stores: 0, k_areas: 0, last_invoice_date: null };
      return scope.area ? areaCov : fullCov;
    }
  );
}

export async function fetchTopSkusPerArea(scope: MarketScope): Promise<TopSkusPerAreaV2> {
  return liveOrMock<TopSkusPerAreaV2>(
    async () =>
      adaptTopSkus(
        (
          await api.get("/v2/market-intel/top-skus-per-area", {
            params: miParams(scope, { top_n: "10" }),
          })
        ).data
      ),
    () => {
      if (miDebugState() === "thin") return { coverage: thinCoverage(), regions: [] };
      return buildMockTopSkus(scope);
    }
  );
}

export async function fetchTopNonTaco(
  scope: MarketScope,
  sort: "qty" | "price" = "qty"
): Promise<TopNonTacoV2> {
  return liveOrMock<TopNonTacoV2>(
    async () =>
      adaptTopNonTaco(
        (
          await api.get("/v2/market-intel/top-non-taco", {
            params: miParams(scope, { top_n: "10", sort }),
          })
        ).data
      ),
    () => {
      if (miDebugState() === "thin") return { coverage: thinCoverage(), rows: [] };
      return buildMockTopNonTaco(sort);
    }
  );
}

export async function fetchCategoryDistribution(
  scope: MarketScope
): Promise<CategoryDistributionV2> {
  return liveOrMock<CategoryDistributionV2>(
    async () =>
      adaptCategoryDist(
        (await api.get("/v2/market-intel/category-distribution", { params: miParams(scope) })).data
      ),
    () => {
      if (miDebugState() === "thin")
        return { coverage: thinCoverage(), total_taco_lines: 0, categories: [] };
      return buildMockCategoryDist();
    }
  );
}

export async function fetchCategoryMonthlyTrend(
  scope: MarketScope
): Promise<CategoryMonthlyTrendV2> {
  return liveOrMock<CategoryMonthlyTrendV2>(
    async () =>
      adaptCategoryTrend(
        (
          await api.get("/v2/market-intel/category-monthly-trend", {
            params: miParams(scope, { granularity: "month" }),
          })
        ).data
      ),
    () => {
      if (miDebugState() === "thin")
        return { coverage: thinCoverage(), months: [], categories: [], rows: [] };
      return buildMockCategoryTrend();
    }
  );
}

export async function fetchCategorySkus(
  category: string,
  scope: MarketScope
): Promise<CategorySkusV2> {
  return liveOrMock<CategorySkusV2>(
    async () =>
      adaptCategorySkus(
        (
          await api.get("/v2/market-intel/category-skus", {
            params: miParams(scope, { category }),
          })
        ).data
      ),
    () => buildMockCategorySkus(category)
  );
}

export async function fetchPriceBands(
  scope: MarketScope,
  q?: string,
  page = 1,
  sort: "n" | "price" | "qty" = "n"
): Promise<PriceBandsV2> {
  return liveOrMock<PriceBandsV2>(
    async () =>
      adaptPriceBands(
        (
          await api.get("/v2/market-intel/price-bands", {
            params: miParams(scope, {
              page: String(page),
              page_size: String(PAGE_SIZE),
              sort,
              ...(q ? { q } : {}),
            }),
          })
        ).data
      ),
    () => {
      const dbg = miDebugState();
      if (dbg === "thin")
        return { coverage: thinCoverage(), skus: [], pagination: { page: 1, page_size: PAGE_SIZE, total: 0 } };
      if (dbg === "empty")
        return {
          coverage: { n_invoices: 8, m_stores: 5, k_areas: 2, last_invoice_date: "2026-06-12" },
          skus: [],
          pagination: { page: 1, page_size: PAGE_SIZE, total: 0 },
        };
      return buildMockBands(scope, q, page);
    }
  );
}

export async function fetchSkuPriceHistory(
  skuId: string,
  opts: { period: string; area?: string; storeId?: string }
): Promise<SkuPriceHistoryV2> {
  return liveOrMock<SkuPriceHistoryV2>(
    async () =>
      adaptHistory(
        (
          await api.get("/v2/market-intel/sku-price-history", {
            params: {
              sku_id: skuId,
              period: opts.period,
              ...(opts.area ? { area: opts.area } : {}),
              ...(opts.storeId ? { store_id: opts.storeId } : {}),
            },
          })
        ).data
      ),
    () => buildMockHistory(skuId, opts.area, opts.storeId)
  );
}

export async function fetchSkuStorePricing(
  skuId: string,
  opts: { period: string; area?: string }
): Promise<SkuStorePricingV2> {
  return liveOrMock<SkuStorePricingV2>(
    async () =>
      adaptStorePricing(
        (
          await api.get("/v2/market-intel/sku-store-pricing", {
            params: {
              sku_id: skuId,
              period: opts.period,
              ...(opts.area ? { area: opts.area } : {}),
            },
          })
        ).data
      ),
    () => buildMockStorePricing(skuId)
  );
}

export async function fetchBrandBucketDistribution(
  scope: MarketScope
): Promise<BrandBucketDistributionV2> {
  return liveOrMock<BrandBucketDistributionV2>(
    async () =>
      adaptBrandBucketDist(
        (await api.get("/v2/market-intel/brand-bucket-distribution", { params: miParams(scope) })).data
      ),
    () => {
      const dbg = miDebugState();
      if (dbg === "thin")
        return { coverage: thinCoverage(), buckets: [], unknown_competitor_count: 0 };
      if (dbg === "empty")
        return {
          coverage: { n_invoices: 6, m_stores: 4, k_areas: 2, last_invoice_date: "2026-06-12" },
          buckets: [{ bucket: "taco", n_lines: 48, pct: 1 }],
          unknown_competitor_count: 2,
        };
      return buildMockBrandBucketDist();
    }
  );
}

export async function fetchBrandBucketDetail(
  bucket: BrandBucket,
  scope: MarketScope,
  opts?: { brand?: string; sku?: string; q?: string; page?: number }
): Promise<BrandBucketDetailV2> {
  const page = opts?.page ?? 1;
  return liveOrMock<BrandBucketDetailV2>(
    async () =>
      adaptBrandBucketDetail(
        (
          await api.get("/v2/market-intel/brand-bucket-detail", {
            params: miParams(scope, {
              bucket,
              page: String(page),
              page_size: String(PAGE_SIZE),
              ...(opts?.brand ? { brand: opts.brand } : {}),
              ...(opts?.sku ? { sku: opts.sku } : {}),
              ...(opts?.q ? { q: opts.q } : {}),
            }),
          })
        ).data
      ),
    () => buildMockBrandDetail(bucket, opts?.brand, opts?.sku, opts?.q, page)
  );
}

export { PAGE_SIZE };
