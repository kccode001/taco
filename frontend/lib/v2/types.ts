/** TACO v2 — management-surface entity + DTO shapes.
 *  Authored against BUILD-PLAN-v2 endpoint shapes (Grout owns canonical schema;
 *  coordinate field changes via the engineer ledger, don't fork here).
 *  Kept separate from v1 `lib/types.ts` per the v1 freeze. */

// ── Master data ──────────────────────────────────────────────────────────

export interface AreaV2 {
  id: string;
  name: string;
  /** Optional short code, e.g. "BDG". */
  code?: string;
  created_at?: string;
  /** Convenience count surfaced by some list responses. */
  store_count?: number;
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
