/** TACO v2 — management-surface entity + DTO shapes.
 *  Authored against BUILD-PLAN-v2 endpoint shapes (Grout owns canonical schema;
 *  coordinate field changes via the engineer ledger, don't fork here).
 *  Kept separate from v1 `lib/types.ts` per the v1 freeze. */

// ── Master data ──────────────────────────────────────────────────────────

export interface AreaV2 {
  id: string;
  name: string;
  /** Short code, e.g. "C-BU1-ASM-BANDUNG" (from the regions table). */
  code?: string;
  created_at?: string;
  /** Convenience count surfaced by some list responses. */
  store_count?: number;
}

/** A BU (Business Unit) row from the regions hierarchy — used as parent picker
 *  when creating a new area. */
export interface RegionBU {
  id: string;
  code: string;
  name: string;
  display_path: string;
}

export interface StoreV2 {
  id: string;
  area_id: string;
  /** Denormalized for table display when the BE joins it in. */
  area_name?: string;
  name: string;
  created_at?: string;
  created_by?: string;
  /** Display name of the user who introduced the store (BE-resolved). */
  created_by_name?: string | null;
}

export interface SalesAgentV2 {
  id: string;
  name: string;
  /** Phone / contact, optional. */
  phone?: string;
  email?: string;
  /** Area the agent primarily covers, optional. */
  area_id?: string;
  area_name?: string;
  active?: boolean;
  created_at?: string;
}

// ── Recommendations ──────────────────────────────────────────────────────

/** Reason-derived recommendation. `auto_actionable` decides the FE affordance:
 *  true  → show "Terapkan" (apply) button.
 *  false → show "acknowledge" only. */
export interface RecommendationV2 {
  id: string;
  /** Recommendation kind, e.g. add_synonym | create_sku | mapping_rule. */
  type: string;
  title: string;
  body: string;
  /** The captured reason (admin mismatch note / OCR signal) this derives from. */
  reason?: string;
  auto_actionable: boolean;
  status?: "pending" | "applied" | "acknowledged";
  created_at?: string;
  /** Free-form payload describing the action the system would take on apply. */
  payload?: Record<string, unknown>;
}

// ── Dashboard ────────────────────────────────────────────────────────────

/** /dashboard/recap?period=&area= — items logged split by area + qty over time. */
export interface DashboardRecapV2 {
  period: string;
  /** Items logged per area (the area-split recap). */
  by_area: AreaRecapRow[];
  /** Quantity-sold-over-time series (one point per bucket). */
  qty_over_time: QtyOverTimePoint[];
  /** Headline totals for KPI tiles. */
  totals?: {
    total_items: number;
    total_qty: number;
    total_invoices: number;
    active_areas: number;
  };
}

export interface AreaRecapRow {
  area_id: string;
  area_name: string;
  items_logged: number;
  qty_sold: number;
  /** Period-over-period change in % (nullable when no prior period). */
  delta_pct?: number | null;
}

export interface QtyOverTimePoint {
  /** Bucket label, e.g. "01/06" or "2026-W23". */
  bucket: string;
  qty: number;
  /** Optional per-area breakdown keyed by area_name for stacked/multi-series. */
  [areaName: string]: string | number | undefined;
}

/** /dashboard/trending?area= — top trending items, optionally scoped to an area. */
export interface TrendingItemV2 {
  rank: number;
  sku_id?: string;
  sku_code?: string;
  name: string;
  qty_sold: number;
  /** Trend momentum in %, positive = rising. */
  trend_pct?: number | null;
  area_id?: string;
  area_name?: string;
}

// ── Analytics ────────────────────────────────────────────────────────────

/** /analytics/summary — KPI header strip with period-over-period deltas. */
export interface AnalyticsSummaryV2 {
  period: string;
  range: { from: string | null; to: string };
  filter_area: string | null;
  kpis: {
    invoice_count: number;
    invoice_count_delta: number | null;
    taco_share_pct: number;
    taco_share_delta_pp: number | null;
    taco_value: number;
    taco_value_delta: number | null;
    competitor_signal_pct: number;
    competitor_signal_delta_pp: number | null;
    unresolved_count: number;
  };
}

/** One area row from /analytics/share-by-area. */
export interface AreaShareRow {
  area_id: string | null;
  area_name: string;
  taco_share_value_pct: number;
  taco_share_qty_pct: number;
  taco_share_freq_pct: number;
  competitor_share_pct: number;
  taco_value: number;
  total_value: number;
  competitor_value: number;
  unresolved_count: number;
  invoice_count: number;
  taco_sku_count: number;
}

/** /analytics/share-by-area response. */
export interface ShareByAreaV2 {
  period: string;
  range: { from: string | null; to: string };
  by_area: AreaShareRow[];
}

/** One bucket in a trend series. */
export interface TrendBucket {
  bucket: string;
  taco_share_value_pct: number;
}

/** One area's trend series. */
export interface AreaTrendSeries {
  area_id: string | null;
  area_name: string;
  series: TrendBucket[];
}

/** /analytics/trend response. */
export interface AnalyticsTrendV2 {
  period: string;
  bucket_type: 'week' | 'month';
  range: { from: string | null; to: string };
  per_area: AreaTrendSeries[];
}

/** One confirmed TACO SKU row. */
export interface TopSkuRow {
  sku_id: string;
  sku_name: string;
  /** Catalog SKU code, e.g. "TH 009 AA". */
  sku_code: string | null;
  catalog_category: string | null;
  total_value: number;
  total_qty: number;
  store_count: number;
  /** How many invoices in scope contain this SKU. */
  invoice_count: number;
  /** Average quantity per invoice when this SKU appears. */
  avg_qty_per_invoice: number;
}

/** /analytics/top-skus response. */
export interface TopSkusV2 {
  period: string;
  range: { from: string | null; to: string };
  unmatched_count: number;
  /** Total invoices in scope — denominator for penetration display. */
  total_invoices: number;
  top_skus: TopSkuRow[];
}

/** One competitor brand entry. */
export interface CompetitorBrand {
  brand_name: string;
  value: number;
}

/** One area's competitor signal. */
export interface AreaCompetitorRow {
  area_id: string | null;
  area_name: string;
  competitor_total_value: number;
  total_value: number;
  competitor_pct: number;
  top_brands: CompetitorBrand[];
  unnamed_competitor_value: number;
}

/** /analytics/competitor-brands response. */
export interface CompetitorBrandsV2 {
  period: string;
  range: { from: string | null; to: string };
  by_area: AreaCompetitorRow[];
}

/** One store in the drill-down. */
export interface DrillStoreRow {
  store_id: string;
  store_name: string;
  invoice_count: number;
  taco_share_value_pct: number;
  taco_value: number;
  total_value: number;
  top_sku_name: string | null;
}

/** /analytics/area-stores response. */
export interface AreaStoresDrillV2 {
  area_id: string | null;
  area_kpis: {
    taco_share_value_pct: number;
    invoice_count: number;
    competitor_share_pct: number;
  } | null;
  period: string;
  range: { from: string | null; to: string };
  stores: DrillStoreRow[];
}

// ── Market Intelligence (Intelijen Pasar — /v2/market-intel/*) ─────────────
// Honest-sample surface (SKU × Area pivot, 2026-06-15 revamp). Every panel
// response carries its OWN coverage object (computed from the rows that fed
// THAT panel) so the AC-2 chip is truthful per panel, not page-level. When a
// panel endpoint omits `coverage`, the FE falls back to the scope-level
// /coverage so the chip always renders (AC-2.1).

/** Coverage = sample size for a scope or a single panel's contributing rows. */
export interface CoverageV2 {
  n_invoices: number;
  m_stores: number;
  k_areas: number;
  /** ISO date of the most recent contributing invoice, or null when none. */
  last_invoice_date: string | null;
}

/** Server-side pagination envelope (R2/R3/R4, page_size=10 — PRD §8). */
export interface PaginationV2 {
  page: number;
  page_size: number;
  total: number;
}

// ── R2 · Peta Harga Nyata (hero price bands) — AC-4/5/6 ────────────────────

/** One flagged invoice on a price band (AC-5). */
export interface PriceBandOutlier {
  invoice_id: string;
  supplier_name: string;
  region_name: string;
  unit_price: number;
  /** "above" = pricier (▲ error); "below" = cheaper (▼ success). */
  direction: "above" | "below";
  /** Invoice date — surfaced in the AC-5 marker tooltip when present. */
  invoice_date?: string;
}

/** One per-SKU real-price band row (AC-4 + v3 qty extension AC-35/36). */
export interface PriceBandRow {
  sku_id: string;
  sku_name: string;
  /** Catalog SKU code (e.g. "HPL-TH061") — v3 Laporan SKU 2nd line. */
  sku_code?: string | null;
  /** catalog_category for display context (Laminates / Flooring / …). */
  catalog_category?: string | null;
  n_invoices: number;
  p_min: number;
  p_median: number;
  /** Mean unit_price (v3 Laporan SKU shows min·avg·maks). Falls back to median. */
  p_avg?: number;
  p_max: number;
  /** Σ unit_price across contributing lines (Total tag, AC-36). */
  price_sum_sample?: number;
  /** (max − min) / median, as a fraction (0.34 = 34%). */
  spread_pct: number;
  outliers: PriceBandOutlier[];
  // ── v3 qty stats (AC-35/36) ──
  /** Quantity unit label from taco_skus.unit (e.g. "lbr", "roll", "m²"). */
  unit?: string;
  qty_min?: number;
  qty_avg?: number;
  qty_max?: number;
  /** Σ quantity across lines with qty>0 (Total tag, AC-36). */
  qty_sum_sample?: number;
  /** Fraction of contributing lines with quantity missing/zero (0.64 = 64%). */
  qty_missing_pct?: number;
  /** Lines with quantity>0 (X in "qty terbaca dari X dari Y baris"). */
  n_qty_present?: number;
  /** Total contributing lines (Y in "qty terbaca dari X dari Y baris"). */
  n_lines?: number;
}

/** /market-intel/price-bands?q=&page=&page_size=10 response (AC-4). */
export interface PriceBandsV2 {
  coverage?: CoverageV2;
  skus: PriceBandRow[];
  pagination?: PaginationV2;
}

// ── R5 · SKU detail modal (sku-price-history) — AC-7/25/26/27 ──────────────

/** One point on the SKU price-trend chart (AC-26 — date × unit_price [× qty]). */
export interface SkuPriceTrendPoint {
  invoice_id: string;
  invoice_date: string;
  unit_price: number;
  /** Quantity on this line (v3 dual-line chart, AC-26). Null when OCR missed it. */
  quantity?: number | null;
  store_id: string | null;
  store_name: string;
  region_id: string | null;
  region_name: string;
  /** Set when this point is an outlier (▲ above / ▼ below). */
  outlier_direction?: "above" | "below" | null;
}

/** One contributing invoice in the modal's invoice list (AC-7). */
export interface SkuPriceInvoiceRow {
  invoice_id: string;
  store_name: string;
  region_name: string;
  /** RAW supplier_name (shown un-normalized). */
  supplier_name: string;
  invoice_date: string;
  unit_price: number;
  /** Quantity on the contributing line (v3 invoice list "· qty 14 lbr", AC-7). */
  quantity?: number | null;
  image_url: string | null;
  outlier_direction?: "above" | "below" | null;
}

/** /market-intel/sku-price-history?sku_id=&period=&area=&store_id= response.
 *  Single endpoint backs the entire R5/S-7 modal (AC-7, AC-25, AC-26, AC-27)
 *  plus the v3 qty card + dual-line chart (AC-26/35/36). */
export interface SkuPriceHistoryV2 {
  coverage?: CoverageV2;
  sku_id: string;
  sku_name: string;
  /** v3 sub-title context. */
  sku_code?: string | null;
  catalog_category?: string | null;
  p_min: number;
  p_avg: number;
  p_max: number;
  /** Σ unit_price (Total tag, AC-36). */
  price_sum_sample?: number;
  trend: SkuPriceTrendPoint[];
  invoices: SkuPriceInvoiceRow[];
  // ── v3 qty card (AC-26/35/36) ──
  unit?: string;
  qty_min?: number;
  qty_avg?: number;
  qty_max?: number;
  qty_sum_sample?: number;
  qty_missing_pct?: number;
  n_qty_present?: number;
  n_lines?: number;
}

// ── R1 · SKU Teratas per Wilayah (top-skus-per-area) — AC-8/9/18/19 ────────

/** One SKU's line-occurrence frequency within a region (AC-8). */
export interface TopSkuOccurrence {
  sku_id: string;
  sku_name: string;
  occurrence_count: number;
  /** Fraction of the region's invoices that contain this SKU (0.75 = 75%). */
  occurrence_pct: number;
}

/** One region column of the top-SKUs panel (AC-9). */
export interface TopSkusAreaColumn {
  region_id: string | null;
  region_name: string;
  n_invoices: number;
  skus: TopSkuOccurrence[];
}

/** /market-intel/top-skus-per-area?period=&area=&top_n= response. */
export interface TopSkusPerAreaV2 {
  coverage?: CoverageV2;
  regions: TopSkusAreaColumn[];
}

// ── R3 · Adu Harga TACO vs Kompetitor (price-gap-pairs) — AC-10/11/20/21/22 ─

/** One same-receipt TACO-vs-competitor price-gap row (AC-20). The Rupiah and %
 *  gap are derived on the FE from the two unit prices (gap = TACO − competitor;
 *  positive = TACO pricier) to stay convention-safe. */
export interface PriceGapPairRow {
  invoice_id: string;
  /** Link target for the Invoice cell (raw_image_url). */
  image_url: string | null;
  store_name: string;
  region_name: string;
  invoice_date: string;
  taco_sku_name: string;
  taco_unit_price: number;
  competitor_brand_name: string;
  /** Raw OCR text of the competitor line. */
  competitor_ocr_text: string | null;
  competitor_unit_price: number;
}

/** /market-intel/price-gap-pairs?q=&page=&page_size= response (AC-11 footer). */
export interface PriceGapPairsV2 {
  coverage?: CoverageV2;
  rows: PriceGapPairRow[];
  pagination?: PaginationV2;
  /** is_unknown competitor lines — excluded from rows, counted in footer. */
  unknown_competitor_count: number;
  /**
   * Same-receipt TACO+competitor pairs in scope, resolved + unknown (AC-22):
   * total<3 → thin-data; total≥3 && pagination.total==0 → zero-pair copy.
   */
  total_same_receipt_pairs: number;
}

// ── R4 · White-Space SKU per Wilayah (sku-whitespace) — AC-23/24 ───────────

/** One (taco_sku × region) combo not yet observed in the sample (AC-23). */
export interface WhitespaceRow {
  sku_id: string;
  sku_name: string;
  region_id: string | null;
  region_name: string;
}

/** /market-intel/sku-whitespace?q=&page=&page_size= response. */
export interface SkuWhitespaceV2 {
  coverage?: CoverageV2;
  rows: WhitespaceRow[];
  pagination?: PaginationV2;
}

// ════════════════════════════════════════════════════════════════════════════
// v3 4-SECTION RESTRUCTURE (analytics-v3, 2026-06-15) — KC's 4 sections.
// Reuses CoverageV2 / PaginationV2 / SkuPriceInvoiceRow above. Retired R3/R4
// types (PriceGapPair*, Whitespace*) stay exported above for back-compat but
// are no longer consumed by the page.
// ════════════════════════════════════════════════════════════════════════════

// ── §1 · Top-10 non-TACO combined (top-non-taco) — AC-31 ───────────────────
/** One non-TACO row: competitor (🚩 brand) OR non-competitor (· lain-lain). */
export interface TopNonTacoRow {
  bucket: "kompetitor" | "lain_lain";
  /** Resolved competitor brand name (null for lain-lain rows). */
  brand_name: string | null;
  /** SKU label / OCR product text. */
  label: string;
  sku_code?: string | null;
  /** Occurrence count across invoices ("19×"). */
  n_invoices: number;
  /** Median observed qty (sort=qty) and unit price (sort=price). */
  median_qty: number;
  median_price: number;
}
/** /market-intel/top-non-taco?period=&area=&top_n=&sort=qty|price response. */
export interface TopNonTacoV2 {
  coverage?: CoverageV2;
  rows: TopNonTacoRow[];
}

// ── §1 card 4 (REVISED 2026-06-15) · invoices most dominated by non-TACO value ─
/** One uploaded invoice ranked by non-TACO share of invoice value (AC-31). */
export interface TopNonTacoInvoiceRow {
  invoice_id: string;
  store_name: string;
  region_name: string;
  invoice_date: string;
  /** Σ(unit_price × qty) over TACO lines. */
  taco_value: number;
  /** Σ(unit_price × qty) over Kompetitor + Lain-lain lines (unknown excluded). */
  non_taco_value: number;
  total_value: number;
  /** Fractions 0..1 (taco_share + non_taco_share = 1 over the valued lines). */
  taco_share: number;
  non_taco_share: number;
  /** Disclosed (not hidden): lines dropped from the value sums for missing qty. */
  qty_missing_lines?: number;
  unknown_competitor_count?: number;
}
/** /market-intel/top-non-taco-invoices?period=&area=&top_n= response (AC-31). */
export interface TopNonTacoInvoicesV2 {
  coverage?: CoverageV2;
  rows: TopNonTacoInvoiceRow[];
}

// ── §2 · Komposisi kategori TACO (category-distribution) — AC-32 ───────────
export interface CategoryDistRow {
  category: string;
  n_lines: number;
  /** Fraction OF TACO line items (0.46 = 46%). */
  pct: number;
}
export interface CategoryDistributionV2 {
  coverage?: CoverageV2;
  total_taco_lines: number;
  categories: CategoryDistRow[];
}

// ── §2 · Tren unggahan kategori (category-monthly-trend) — AC-33 ───────────
export interface CategoryTrendCell {
  /** Month bucket label, e.g. "Feb", "Mar". */
  month: string;
  category: string;
  /** Distinct uploaded invoices that month containing ≥1 TACO line of category. */
  invoice_count: number;
}
export interface CategoryMonthlyTrendV2 {
  coverage?: CoverageV2;
  months: string[];
  categories: string[];
  rows: CategoryTrendCell[];
}

// ── §2 · Category drill SKU list (category-skus) — AC-34 ───────────────────
export interface CategorySkuRow {
  sku_id: string;
  sku_name: string;
  sku_code?: string | null;
  /** Finer taco_skus.category enum (HPL / ECO_HPL / SHEET / …). */
  sub_category?: string | null;
  n_invoices: number;
}
export interface CategorySkusV2 {
  coverage?: CoverageV2;
  category: string;
  skus: CategorySkuRow[];
  /** Distinct sub-categories present, for the secondary-grouping dropdown. */
  sub_categories?: string[];
}

// ── §3 · Per-store pricing + history (sku-store-pricing) — AC-37 ───────────
export interface StorePricePoint {
  invoice_date: string;
  unit_price: number;
}
export interface StorePricingRow {
  store_id: string;
  store_name: string;
  region_name: string;
  n_invoices: number;
  p_min: number;
  p_avg: number;
  p_max: number;
  /** This store's unit_price for the SKU over time (AC-37 history line). */
  history: StorePricePoint[];
}
export interface SkuStorePricingV2 {
  coverage?: CoverageV2;
  stores: StorePricingRow[];
}

// ── §4 · Komposisi merek di invoice terunggah (brand-bucket-distribution) ──
export type BrandBucket = "taco" | "kompetitor" | "lain_lain";
export interface BrandBucketSlice {
  bucket: BrandBucket;
  n_lines: number;
  /** Fraction of (TACO + Kompetitor + Lain-lain) lines — sums to 1.0 (AC-38.1). */
  pct: number;
}
export interface BrandBucketDistributionV2 {
  coverage?: CoverageV2;
  buckets: BrandBucketSlice[];
  /** is_unknown competitor lines — EXCLUDED from buckets, footer only (AC-41). */
  unknown_competitor_count: number;
}

// ── §4 · Brand-bucket drill (brand-bucket-detail) — AC-39/40 ───────────────
/** Level 1 — a brand within the clicked bucket. */
export interface BrandRow {
  brand_id: string | null;
  /** Resolved brand name (Kompetitor), "TACO" (TACO bucket), OCR text (Lain-lain). */
  brand_name: string;
  n_lines: number;
  n_invoices: number;
}
/** Level 2 — a SKU under a brand, with price stats (AC-40, no Total here). */
export interface BrandSkuRow {
  /** Canonical name for TACO; OCR-resolved text for Kompetitor / Lain-lain. */
  sku_label: string;
  sku_code?: string | null;
  /** TACO SKU id when resolvable (lets the row reuse sku-price-history). */
  sku_id?: string | null;
  n_invoices: number;
  p_min: number;
  p_avg: number;
  p_max: number;
}
/** Hierarchical drill response — one level populated per call (lazy). */
export interface BrandBucketDetailV2 {
  coverage?: CoverageV2;
  bucket: BrandBucket;
  /** level=brands */
  brands?: BrandRow[];
  /** level=skus */
  skus?: BrandSkuRow[];
  /** level=invoices (reuses the invoice-row shape: store/region/supplier/date/price/qty/image). */
  invoices?: SkuPriceInvoiceRow[];
  pagination?: PaginationV2;
  /** Footer chip count, echoed on every level for the Lain-lain note (AC-41). */
  unknown_competitor_count?: number;
}

/** /dashboard/ai-insight?period= — single LLM-generated market-demand insight. */
export interface AiInsightV2 {
  period: string;
  /** One-line headline. Optional — the live BE emits only the insight body. */
  headline?: string;
  /** Markdown/plain body — the substance of the insight. */
  insight: string;
  /** Optional structured highlights the FE can chip-render. */
  highlights?: string[];
  /** Model + generation metadata for transparency. */
  generated_at?: string;
  model?: string;
}
