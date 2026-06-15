/** TACO v2 — Intelijen Pasar (Market Intelligence) API client — SKU × Area pivot.
 *  Wraps the `/api/v2/market-intel/*` endpoints (PRD §8, 2026-06-15 revamp) that
 *  power the rewritten /taro/v2/analytics page. Reuses the authed v1 axios.
 *
 *  Endpoints (this revision):
 *    GET /coverage              — truth banner + page-level chip (AC-1/2)
 *    GET /price-bands?q&page&page_size  — R2 hero, searchable+paginated (AC-4)
 *    GET /sku-price-history?sku_id&period&area&store_id — R5 modal (AC-7/25/26/27)
 *    GET /top-skus-per-area?period&area&top_n — R1 (AC-8/9/18/19)
 *    GET /price-gap-pairs?q&page&page_size — R3 head-to-head (AC-10/11/20/21/22)
 *    GET /sku-whitespace?q&page&page_size — R4 white-space (AC-23/24)
 *
 *  HONESTY / MOCK POLICY (KC rule: no mock on the live surface):
 *  - DEFAULT = live only. If an endpoint errors (incl. pre-launch 404 before
 *    Mortar lands his module), the calling panel renders its own honest ERROR
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
  TopSkusPerAreaV2,
  PriceGapPairsV2,
  PriceGapPairRow,
  SkuWhitespaceV2,
  WhitespaceRow,
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
// (image_url/raw_image_url, price_bands/skus) and numeric-string coercion so a
// shape drift degrades gracefully rather than NaN-ing the panel.
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
        n_invoices: num(b.n_invoices),
        p_min: num(b.p_min),
        p_median: num(b.p_median),
        p_max: num(b.p_max),
        spread_pct: pctToFrac(b.spread_pct),
        outliers: (b.outliers ?? []).map((o: any) => ({
          invoice_id: String(o.invoice_id),
          supplier_name: o.supplier_name ?? "",
          region_name: o.region_name ?? "",
          unit_price: num(o.unit_price),
          direction: o.direction === "below" ? "below" : "above",
          invoice_date: o.invoice_date ?? undefined,
        })),
      })
    ),
  };
}

function adaptHistory(be: any): SkuPriceHistoryV2 {
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    sku_id: String(be?.sku_id ?? ""),
    sku_name: be?.sku_name ?? "",
    p_min: num(be?.p_min),
    p_avg: num(be?.p_avg ?? be?.p_average ?? be?.p_mean),
    p_max: num(be?.p_max),
    trend: (be?.trend ?? []).map((t: any) => ({
      invoice_id: String(t.invoice_id),
      invoice_date: t.invoice_date,
      unit_price: num(t.unit_price),
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

function adaptGapPairs(be: any): PriceGapPairsV2 {
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    pagination: adaptPagination(be?.pagination),
    unknown_competitor_count: num(be?.unknown_competitor_count),
    rows: (be?.rows ?? []).map(
      (r: any): PriceGapPairRow => ({
        invoice_id: String(r.invoice_id),
        image_url: r.image_url ?? r.raw_image_url ?? null,
        store_name: r.store_name ?? "",
        region_name: r.region_name ?? "",
        invoice_date: r.invoice_date,
        taco_sku_name: r.taco_sku_name ?? "",
        taco_unit_price: num(r.taco_unit_price),
        competitor_brand_name: r.competitor_brand_name ?? "",
        competitor_ocr_text: r.competitor_ocr_text ?? null,
        competitor_unit_price: num(r.competitor_unit_price),
      })
    ),
  };
}

function adaptWhitespace(be: any): SkuWhitespaceV2 {
  return {
    coverage: be?.coverage ? adaptCoverage(be.coverage) : undefined,
    pagination: adaptPagination(be?.pagination),
    rows: (be?.rows ?? []).map(
      (r: any): WhitespaceRow => ({
        sku_id: String(r.sku_id),
        sku_name: r.sku_name ?? "",
        region_id: r.region_id ?? null,
        region_name: r.region_name ?? "",
      })
    ),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ════════════════════════════════════════════════════════════════════════════
// MOCK dataset (pre-launch self-test only) — authored in canonical shape, so
// the live adapters above are bypassed. Numbers mirror the design fixture
// (37 invoice · 21 toko · 4 wilayah) so screenshots match design/11-*.html.
// ════════════════════════════════════════════════════════════════════════════

const MOCK_DATE = "2026-06-14";

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

const MOCK_BANDS: PriceBandRow[] = [
  {
    sku_id: "sku-acianputih",
    sku_name: "TACO Acian Putih 40kg",
    n_invoices: 14,
    p_min: 54000,
    p_median: 56000,
    p_max: 70000,
    spread_pct: (70000 - 54000) / 56000,
    outliers: [
      {
        invoice_id: "INV-2041",
        supplier_name: "CV Sumber Mortar",
        region_name: "Jakarta",
        unit_price: 70000,
        direction: "above",
        invoice_date: "2026-06-11",
      },
    ],
  },
  {
    sku_id: "sku-skimcoat",
    sku_name: "TACO Skim Coat 40kg",
    n_invoices: 11,
    p_min: 58000,
    p_median: 61000,
    p_max: 64000,
    spread_pct: (64000 - 58000) / 61000,
    outliers: [],
  },
  {
    sku_id: "sku-tileadhesive",
    sku_name: "TACO Tile Adhesive 25kg",
    n_invoices: 9,
    p_min: 47000,
    p_median: 48000,
    p_max: 61000,
    spread_pct: (61000 - 47000) / 48000,
    outliers: [
      {
        invoice_id: "INV-2033",
        supplier_name: "Toko Maju Bangun",
        region_name: "Surabaya",
        unit_price: 61000,
        direction: "above",
        invoice_date: "2026-06-09",
      },
    ],
  },
  {
    sku_id: "sku-mortarplester",
    sku_name: "TACO Mortar Plester 40kg",
    n_invoices: 7,
    p_min: 37000,
    p_median: 50000,
    p_max: 52000,
    spread_pct: (52000 - 37000) / 50000,
    outliers: [
      {
        invoice_id: "INV-2012",
        supplier_name: "Toko Berkah Jaya",
        region_name: "Bandung",
        unit_price: 37000,
        direction: "below",
        invoice_date: "2026-06-07",
      },
    ],
  },
  {
    sku_id: "sku-wallfiller",
    sku_name: "TACO Wall Filler 25kg",
    n_invoices: 6,
    p_min: 41000,
    p_median: 43000,
    p_max: 45000,
    spread_pct: (45000 - 41000) / 43000,
    outliers: [],
  },
  {
    sku_id: "sku-acianabu",
    sku_name: "TACO Acian Abu 40kg",
    n_invoices: 5,
    p_min: 56000,
    p_median: 58000,
    p_max: 60000,
    spread_pct: (60000 - 56000) / 58000,
    outliers: [],
  },
  {
    sku_id: "sku-plamir",
    sku_name: "TACO Plamir Dinding 25kg",
    n_invoices: 5,
    p_min: 33000,
    p_median: 35000,
    p_max: 38000,
    spread_pct: (38000 - 33000) / 35000,
    outliers: [],
  },
  {
    sku_id: "sku-grout",
    sku_name: "TACO Tile Grout 5kg",
    n_invoices: 4,
    p_min: 22000,
    p_median: 24000,
    p_max: 26000,
    spread_pct: (26000 - 22000) / 24000,
    outliers: [],
  },
  {
    sku_id: "sku-waterproof",
    sku_name: "TACO Waterproofing 20kg",
    n_invoices: 4,
    p_min: 145000,
    p_median: 152000,
    p_max: 161000,
    spread_pct: (161000 - 145000) / 152000,
    outliers: [],
  },
  {
    sku_id: "sku-semenwarna",
    sku_name: "TACO Semen Warna 1kg",
    n_invoices: 3,
    p_min: 12000,
    p_median: 13000,
    p_max: 14000,
    spread_pct: (14000 - 12000) / 13000,
    outliers: [],
  },
  {
    sku_id: "sku-bondingagent",
    sku_name: "TACO Bonding Agent 4kg",
    n_invoices: 3,
    p_min: 64000,
    p_median: 67000,
    p_max: 71000,
    spread_pct: (71000 - 64000) / 67000,
    outliers: [],
  },
  {
    sku_id: "sku-floorhardener",
    sku_name: "TACO Floor Hardener 25kg",
    n_invoices: 3,
    p_min: 88000,
    p_median: 92000,
    p_max: 97000,
    spread_pct: (97000 - 88000) / 92000,
    outliers: [],
  },
];

function buildMockBands(scope: MarketScope, q?: string, page = 1): PriceBandsV2 {
  const coverage: CoverageV2 = scope.area
    ? { n_invoices: 14, m_stores: 8, k_areas: 1, last_invoice_date: MOCK_DATE }
    : { n_invoices: 31, m_stores: 18, k_areas: 4, last_invoice_date: MOCK_DATE };
  const { rows, pagination } = paginate(MOCK_BANDS, q, page, (r, n) =>
    r.sku_name.toLowerCase().includes(n)
  );
  return { coverage, skus: rows, pagination };
}

function buildMockHistory(
  skuId: string,
  area?: string,
  storeId?: string
): SkuPriceHistoryV2 {
  const name =
    MOCK_BANDS.find((b) => b.sku_id === skuId)?.sku_name ??
    "TACO Acian Putih 40kg";
  // Full (Semua/Semua) set — 7 contributing invoices, last = outlier ▲.
  const full = [
    { invoice_id: "INV-2002", store_name: "Toko Sumber Jaya", region_id: "r-bdg", region_name: "Bandung", supplier_name: "PT Mitra Bangun", invoice_date: "2026-06-02", unit_price: 55000, image_url: null as string | null, outlier_direction: null as "above" | "below" | null },
    { invoice_id: "INV-2009", store_name: "Toko Bangun Jaya", region_id: "r-jkt", region_name: "Jakarta", supplier_name: "UD Karya Bersama", invoice_date: "2026-06-05", unit_price: 57000, image_url: "https://placehold.co/600x800/png?text=INV-2009", outlier_direction: null },
    { invoice_id: "INV-2015", store_name: "Sumber Rejeki", region_id: "r-bdg", region_name: "Bandung", supplier_name: "PT Mitra Bangun", invoice_date: "2026-06-06", unit_price: 56000, image_url: "https://placehold.co/600x800/png?text=INV-2015", outlier_direction: null },
    { invoice_id: "INV-2021", store_name: "Toko Karya Indah", region_id: "r-sby", region_name: "Surabaya", supplier_name: "CV Anugrah", invoice_date: "2026-06-08", unit_price: 54000, image_url: null, outlier_direction: null },
    { invoice_id: "INV-2027", store_name: "Toko Maju Bangun", region_id: "r-sby", region_name: "Surabaya", supplier_name: "CV Anugrah", invoice_date: "2026-06-09", unit_price: 58000, image_url: "https://placehold.co/600x800/png?text=INV-2027", outlier_direction: null },
    { invoice_id: "INV-2035", store_name: "Toko Karya Abadi", region_id: "r-jkt", region_name: "Jakarta", supplier_name: "UD Karya Bersama", invoice_date: "2026-06-10", unit_price: 56000, image_url: "https://placehold.co/600x800/png?text=INV-2035", outlier_direction: null },
    { invoice_id: "INV-2041", store_name: "CV Sumber Mortar", region_id: "r-jkt", region_name: "Jakarta", supplier_name: "PT Sumber Mortar Abadi", invoice_date: "2026-06-11", unit_price: 70000, image_url: "https://placehold.co/600x800/png?text=INV-2041", outlier_direction: "above" as "above" | "below" | null },
  ];
  let rows = full;
  // In-modal filters narrow the set (AC-27). Store filter forces N<3 thin-data.
  if (storeId) rows = full.filter((r) => r.store_name === storeId).slice(0, 2);
  else if (area) rows = full.filter((r) => r.region_id === area);
  const prices = rows.map((r) => r.unit_price);
  const p_min = prices.length ? Math.min(...prices) : 0;
  const p_max = prices.length ? Math.max(...prices) : 0;
  const p_avg = prices.length
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : 0;
  const stores = new Set(rows.map((r) => r.store_name));
  const areas = new Set(rows.map((r) => r.region_name));
  return {
    coverage: {
      n_invoices: rows.length,
      m_stores: stores.size,
      k_areas: areas.size,
      last_invoice_date: rows.length ? rows[rows.length - 1].invoice_date : null,
    },
    sku_id: skuId,
    sku_name: name,
    p_min,
    p_avg,
    p_max,
    trend: rows.map((r) => ({
      invoice_id: r.invoice_id,
      invoice_date: r.invoice_date,
      unit_price: r.unit_price,
      store_id: r.store_name,
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
      image_url: r.image_url,
      outlier_direction: r.outlier_direction,
    })),
  };
}

function buildMockTopSkus(scope: MarketScope): TopSkusPerAreaV2 {
  const mk = (
    region_id: string,
    region_name: string,
    n_invoices: number,
    skus: [string, number][]
  ): TopSkusPerAreaV2["regions"][number] => ({
    region_id,
    region_name,
    n_invoices,
    skus: skus.map(([sku_name, pct], i) => ({
      sku_id: `${region_id}-s${i}`,
      sku_name,
      occurrence_count: Math.round((pct / 100) * n_invoices),
      occurrence_pct: pct / 100,
    })),
  });
  if (scope.area) {
    return {
      coverage: { n_invoices: 14, m_stores: 8, k_areas: 1, last_invoice_date: MOCK_DATE },
      regions: [
        mk("r-jkt", "Jakarta", 14, [
          ["TACO Acian Putih 40kg", 86],
          ["TACO Skim Coat 40kg", 64],
          ["TACO Tile Adhesive 25kg", 50],
          ["TACO Mortar Plester 40kg", 43],
          ["TACO Wall Filler 25kg", 29],
          ["TACO Acian Abu 40kg", 21],
          ["TACO Plamir Dinding 25kg", 21],
          ["TACO Tile Grout 5kg", 14],
          ["TACO Waterproofing 20kg", 14],
          ["TACO Semen Warna 1kg", 7],
        ]),
      ],
    };
  }
  return {
    coverage: { n_invoices: 37, m_stores: 21, k_areas: 4, last_invoice_date: MOCK_DATE },
    regions: [
      mk("r-jkt", "Jakarta", 14, [
        ["TACO Acian Putih 40kg", 86],
        ["TACO Skim Coat 40kg", 64],
        ["TACO Tile Adhesive 25kg", 50],
        ["TACO Mortar Plester 40kg", 43],
        ["TACO Wall Filler 25kg", 29],
      ]),
      mk("r-bdg", "Bandung", 9, [
        ["TACO Skim Coat 40kg", 78],
        ["TACO Acian Putih 40kg", 67],
        ["TACO Acian Abu 40kg", 44],
        ["TACO Mortar Plester 40kg", 33],
        ["TACO Tile Adhesive 25kg", 22],
      ]),
      mk("r-sby", "Surabaya", 8, [
        ["TACO Tile Adhesive 25kg", 75],
        ["TACO Acian Putih 40kg", 63],
        ["TACO Skim Coat 40kg", 50],
        ["TACO Wall Filler 25kg", 38],
        ["TACO Mortar Plester 40kg", 25],
      ]),
      // Medan — N<3 → AC-18 per-column thin-data in the page.
      mk("r-mdn", "Medan", 2, []),
    ],
  };
}

const MOCK_GAP_ROWS: PriceGapPairRow[] = [
  { invoice_id: "2041", image_url: "https://placehold.co/600x800/png?text=2041", store_name: "Toko Bangun Jaya", region_name: "Jakarta", invoice_date: "2026-06-12", taco_sku_name: "TACO Acian Putih 40kg", taco_unit_price: 70000, competitor_brand_name: "Mortar Utama", competitor_ocr_text: "MU Acian Halus", competitor_unit_price: 61000 },
  { invoice_id: "2033", image_url: "https://placehold.co/600x800/png?text=2033", store_name: "Toko Maju Bangun", region_name: "Surabaya", invoice_date: "2026-06-09", taco_sku_name: "TACO Tile Adhesive 25kg", taco_unit_price: 61000, competitor_brand_name: "AM", competitor_ocr_text: "AM 40 Perekat", competitor_unit_price: 54000 },
  { invoice_id: "2028", image_url: "https://placehold.co/600x800/png?text=2028", store_name: "Sumber Rejeki", region_name: "Bandung", invoice_date: "2026-06-08", taco_sku_name: "TACO Skim Coat 40kg", taco_unit_price: 58000, competitor_brand_name: "Drymix", competitor_ocr_text: "Drymix SkimCoat", competitor_unit_price: 63000 },
  { invoice_id: "2019", image_url: "https://placehold.co/600x800/png?text=2019", store_name: "Toko Karya Abadi", region_name: "Jakarta", invoice_date: "2026-06-06", taco_sku_name: "TACO Mortar Plester 40kg", taco_unit_price: 46000, competitor_brand_name: "Sika", competitor_ocr_text: "SikaCim Plester", competitor_unit_price: 49000 },
  { invoice_id: "2014", image_url: null, store_name: "Toko Karya Indah", region_name: "Surabaya", invoice_date: "2026-06-05", taco_sku_name: "TACO Wall Filler 25kg", taco_unit_price: 45000, competitor_brand_name: "Mortar Utama", competitor_ocr_text: "MU Wall Filler", competitor_unit_price: 39000 },
  { invoice_id: "2008", image_url: "https://placehold.co/600x800/png?text=2008", store_name: "Toko Bangun Jaya", region_name: "Jakarta", invoice_date: "2026-06-04", taco_sku_name: "TACO Acian Abu 40kg", taco_unit_price: 58000, competitor_brand_name: "Drymix", competitor_ocr_text: "Drymix Acian", competitor_unit_price: 52000 },
  { invoice_id: "2003", image_url: "https://placehold.co/600x800/png?text=2003", store_name: "Sumber Rejeki", region_name: "Bandung", invoice_date: "2026-06-03", taco_sku_name: "TACO Skim Coat 40kg", taco_unit_price: 60000, competitor_brand_name: "AM", competitor_ocr_text: "AM Skimcoat", competitor_unit_price: 56000 },
  { invoice_id: "1998", image_url: "https://placehold.co/600x800/png?text=1998", store_name: "Toko Maju Bangun", region_name: "Surabaya", invoice_date: "2026-06-02", taco_sku_name: "TACO Tile Adhesive 25kg", taco_unit_price: 50000, competitor_brand_name: "Sika", competitor_ocr_text: "SikaCeram", competitor_unit_price: 53000 },
  { invoice_id: "1990", image_url: "https://placehold.co/600x800/png?text=1990", store_name: "Toko Karya Abadi", region_name: "Jakarta", invoice_date: "2026-06-01", taco_sku_name: "TACO Acian Putih 40kg", taco_unit_price: 55000, competitor_brand_name: "Mortar Utama", competitor_ocr_text: "MU Acian Putih", competitor_unit_price: 58000 },
  { invoice_id: "1985", image_url: "https://placehold.co/600x800/png?text=1985", store_name: "Toko Sumber Jaya", region_name: "Bandung", invoice_date: "2026-05-31", taco_sku_name: "TACO Waterproofing 20kg", taco_unit_price: 161000, competitor_brand_name: "Sika", competitor_ocr_text: "Sikatop Seal", competitor_unit_price: 142000 },
  { invoice_id: "1979", image_url: "https://placehold.co/600x800/png?text=1979", store_name: "Toko Karya Indah", region_name: "Surabaya", invoice_date: "2026-05-30", taco_sku_name: "TACO Mortar Plester 40kg", taco_unit_price: 48000, competitor_brand_name: "Drymix", competitor_ocr_text: "Drymix Plester", competitor_unit_price: 46000 },
  { invoice_id: "1971", image_url: "https://placehold.co/600x800/png?text=1971", store_name: "Toko Bangun Jaya", region_name: "Jakarta", invoice_date: "2026-05-29", taco_sku_name: "TACO Bonding Agent 4kg", taco_unit_price: 71000, competitor_brand_name: "AM", competitor_ocr_text: "AM Bonding", competitor_unit_price: 64000 },
];

function buildMockGapPairs(scope: MarketScope, q?: string, page = 1): PriceGapPairsV2 {
  const { rows, pagination } = paginate(MOCK_GAP_ROWS, q, page, (r, n) =>
    r.taco_sku_name.toLowerCase().includes(n) ||
    r.competitor_brand_name.toLowerCase().includes(n) ||
    r.store_name.toLowerCase().includes(n)
  );
  return {
    coverage: { n_invoices: 17, m_stores: 12, k_areas: 4, last_invoice_date: "2026-06-13" },
    rows,
    pagination,
    unknown_competitor_count: 6,
  };
}

const MOCK_WHITESPACE: WhitespaceRow[] = [
  { sku_id: "sku-tileadhesive", sku_name: "TACO Tile Adhesive 25kg", region_id: "r-mdn", region_name: "Medan" },
  { sku_id: "sku-skimcoat", sku_name: "TACO Skim Coat 40kg", region_id: "r-mdn", region_name: "Medan" },
  { sku_id: "sku-acianabu", sku_name: "TACO Acian Abu 40kg", region_id: "r-sby", region_name: "Surabaya" },
  { sku_id: "sku-wallfiller", sku_name: "TACO Wall Filler 25kg", region_id: "r-bdg", region_name: "Bandung" },
  { sku_id: "sku-mortarplester", sku_name: "TACO Mortar Plester 40kg", region_id: "r-mdn", region_name: "Medan" },
  { sku_id: "sku-waterproof", sku_name: "TACO Waterproofing 20kg", region_id: "r-mdn", region_name: "Medan" },
  { sku_id: "sku-waterproof", sku_name: "TACO Waterproofing 20kg", region_id: "r-sby", region_name: "Surabaya" },
  { sku_id: "sku-floorhardener", sku_name: "TACO Floor Hardener 25kg", region_id: "r-bdg", region_name: "Bandung" },
  { sku_id: "sku-floorhardener", sku_name: "TACO Floor Hardener 25kg", region_id: "r-mdn", region_name: "Medan" },
  { sku_id: "sku-grout", sku_name: "TACO Tile Grout 5kg", region_id: "r-mdn", region_name: "Medan" },
  { sku_id: "sku-bondingagent", sku_name: "TACO Bonding Agent 4kg", region_id: "r-sby", region_name: "Surabaya" },
  { sku_id: "sku-semenwarna", sku_name: "TACO Semen Warna 1kg", region_id: "r-bdg", region_name: "Bandung" },
];

function buildMockWhitespace(scope: MarketScope, q?: string, page = 1): SkuWhitespaceV2 {
  const { rows, pagination } = paginate(MOCK_WHITESPACE, q, page, (r, n) =>
    r.sku_name.toLowerCase().includes(n) || r.region_name.toLowerCase().includes(n)
  );
  return {
    coverage: { n_invoices: 37, m_stores: 21, k_areas: 4, last_invoice_date: MOCK_DATE },
    rows,
    pagination,
  };
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
      return scope.area
        ? { n_invoices: 14, m_stores: 8, k_areas: 1, last_invoice_date: MOCK_DATE }
        : { n_invoices: 37, m_stores: 21, k_areas: 4, last_invoice_date: MOCK_DATE };
    }
  );
}

export async function fetchPriceBands(
  scope: MarketScope,
  q?: string,
  page = 1
): Promise<PriceBandsV2> {
  return liveOrMock<PriceBandsV2>(
    async () =>
      adaptPriceBands(
        (
          await api.get("/v2/market-intel/price-bands", {
            params: miParams(scope, {
              page: String(page),
              page_size: String(PAGE_SIZE),
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

export async function fetchTopSkusPerArea(
  scope: MarketScope
): Promise<TopSkusPerAreaV2> {
  return liveOrMock<TopSkusPerAreaV2>(
    async () =>
      adaptTopSkus(
        (
          await api.get("/v2/market-intel/top-skus-per-area", {
            params: miParams(scope, { top_n: scope.area ? "10" : "5" }),
          })
        ).data
      ),
    () => {
      if (miDebugState() === "thin") return { coverage: thinCoverage(), regions: [] };
      return buildMockTopSkus(scope);
    }
  );
}

export async function fetchPriceGapPairs(
  scope: MarketScope,
  q?: string,
  page = 1
): Promise<PriceGapPairsV2> {
  return liveOrMock<PriceGapPairsV2>(
    async () =>
      adaptGapPairs(
        (
          await api.get("/v2/market-intel/price-gap-pairs", {
            params: miParams(scope, {
              page: String(page),
              page_size: String(PAGE_SIZE),
              ...(q ? { q } : {}),
            }),
          })
        ).data
      ),
    () => {
      const dbg = miDebugState();
      if (dbg === "thin")
        return {
          coverage: thinCoverage(),
          rows: [],
          pagination: { page: 1, page_size: PAGE_SIZE, total: 0 },
          unknown_competitor_count: 0,
        };
      // zero-pair: N≥3 invoices but no resolved-brand pair (AC-22 2nd clause).
      if (dbg === "zero")
        return {
          coverage: { n_invoices: 6, m_stores: 5, k_areas: 2, last_invoice_date: "2026-06-12" },
          rows: [],
          pagination: { page: 1, page_size: PAGE_SIZE, total: 0 },
          unknown_competitor_count: 4,
        };
      return buildMockGapPairs(scope, q, page);
    }
  );
}

export async function fetchSkuWhitespace(
  scope: MarketScope,
  q?: string,
  page = 1
): Promise<SkuWhitespaceV2> {
  return liveOrMock<SkuWhitespaceV2>(
    async () =>
      adaptWhitespace(
        (
          await api.get("/v2/market-intel/sku-whitespace", {
            params: miParams(scope, {
              page: String(page),
              page_size: String(PAGE_SIZE),
              ...(q ? { q } : {}),
            }),
          })
        ).data
      ),
    () => {
      const dbg = miDebugState();
      if (dbg === "thin" || dbg === "empty")
        return {
          coverage: thinCoverage(),
          rows: [],
          pagination: { page: 1, page_size: PAGE_SIZE, total: 0 },
        };
      return buildMockWhitespace(scope, q, page);
    }
  );
}

export { PAGE_SIZE };
