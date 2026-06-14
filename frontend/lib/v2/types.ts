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
// Honest-sample surface. Every panel response carries its OWN coverage object
// (computed from the rows that fed THAT panel) so the AC-2 chip is truthful per
// panel, not page-level. When a panel endpoint omits `coverage`, the FE falls
// back to the scope-level /coverage so the chip always renders (AC-2.1).

/** Coverage = sample size for a scope or a single panel's contributing rows. */
export interface CoverageV2 {
  n_invoices: number;
  m_stores: number;
  k_areas: number;
  /** ISO date of the most recent contributing invoice, or null when none. */
  last_invoice_date: string | null;
}

/** One flagged invoice on a price band (AC-5). */
export interface PriceBandOutlier {
  invoice_id: string;
  supplier_name: string;
  region_name: string;
  unit_price: number;
  /** "above" = pricier (▲ error); "below" = cheaper (▼ success). */
  direction: "above" | "below";
  /** Invoice date — surfaced in the AC-5.1 marker tooltip when present. */
  invoice_date?: string;
}

/** One per-SKU real-price band row (AC-4). */
export interface PriceBandRow {
  sku_id: string;
  sku_name: string;
  n_invoices: number;
  p_min: number;
  p_median: number;
  p_max: number;
  /** (max − min) / median, as a fraction (0.34 = 34%). */
  spread_pct: number;
  outliers: PriceBandOutlier[];
}

/** /market-intel/price-bands response. */
export interface PriceBandsV2 {
  coverage?: CoverageV2;
  skus: PriceBandRow[];
}

/** One contributing invoice in the per-SKU evidence drawer (AC-7). */
export interface SkuEvidenceRow {
  invoice_id: string;
  store_name: string;
  region_name: string;
  /** RAW supplier_name (drawer shows the un-normalized form). */
  supplier_name: string;
  invoice_date: string;
  unit_price: number;
  image_url: string | null;
  /** Set when this invoice is an outlier on the band. */
  outlier_direction?: "above" | "below" | null;
}

/** /market-intel/sku-evidence response. */
export interface SkuEvidenceV2 {
  coverage?: CoverageV2;
  sku_id: string;
  sku_name: string;
  p_min: number;
  p_median: number;
  p_max: number;
  invoices: SkuEvidenceRow[];
}

/** One SKU's occurrence frequency within a region (AC-8). */
export interface DemandSku {
  sku_id: string;
  sku_name: string;
  occurrence_count: number;
  /** Fraction of the region's invoices that contain this SKU (0.75 = 75%). */
  occurrence_pct: number;
}

/** One region column of the demand-mix panel (AC-9). */
export interface DemandRegion {
  region_id: string | null;
  region_name: string;
  n_invoices: number;
  skus: DemandSku[];
}

/** /market-intel/demand-mix response. */
export interface DemandMixV2 {
  coverage?: CoverageV2;
  regions: DemandRegion[];
}

/** One co-occurring competitor brand (AC-10, AC-11 — resolved brands only). */
export interface CompetitorCoBrand {
  brand_id: string;
  brand_name: string;
  n_invoices: number;
}

/** /market-intel/competitor-basket response. */
export interface CompetitorBasketV2 {
  coverage?: CoverageV2;
  n_invoices: number;
  n_with_taco_and_competitor: number;
  /** Fraction of sample invoices with TACO + a competitor (0.39 = 39%). */
  co_occurrence_pct: number;
  top_brands: CompetitorCoBrand[];
  /** Invoices with an UNKNOWN competitor — counted, never named (AC-11). */
  n_unknown_competitor: number;
}

/** One normalized distributor row (AC-16, AC-17). */
export interface DistributorPerfRow {
  supplier_name_normalized: string;
  supplier_name_raw_sample: string;
  n_invoices: number;
  avg_invoice_value: number;
  last_invoice_date: string;
}

/** /market-intel/distributor-performance response. */
export interface DistributorPerfV2 {
  coverage?: CoverageV2;
  distributors: DistributorPerfRow[];
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
