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
  catalog_category: string | null;
  total_value: number;
  total_qty: number;
  store_count: number;
}

/** /analytics/top-skus response. */
export interface TopSkusV2 {
  period: string;
  range: { from: string | null; to: string };
  unmatched_count: number;
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
