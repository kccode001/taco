/** TACO v2 — management API client.
 *  Reuses the v1 axios instance (`api`) for its auth interceptor + baseURL
 *  (`/api`), so all calls below hit `/api/v2/*`. New file per the v1 freeze —
 *  do NOT add v2 endpoints into the large v1 `lib/api.ts`. */

import { api } from "@/lib/api";
import type {
  AreaV2,
  RegionBU,
  StoreV2,
  SalesAgentV2,
  RecommendationV2,
  DashboardRecapV2,
  TrendingItemV2,
  AiInsightV2,
  AnalyticsSummaryV2,
  ShareByAreaV2,
  AnalyticsTrendV2,
  TopSkusV2,
  CompetitorBrandsV2,
  AreaStoresDrillV2,
} from "./types";

/** BE responses are sometimes `T[]` and sometimes `{ data: T[] }`. Normalize. */
export function unwrapList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const inner = (body as { data?: unknown })?.data;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

/** Same for single-object responses (`T` or `{ data: T }`). */
export function unwrapOne<T>(body: unknown): T | null {
  if (body && typeof body === "object" && "data" in (body as object)) {
    return ((body as { data?: T }).data ?? null) as T | null;
  }
  return (body as T) ?? null;
}

// ── Areas ────────────────────────────────────────────────────────────────
export const getAreas = (params?: Record<string, string>) =>
  api.get<AreaV2[] | { data: AreaV2[] }>("/v2/areas", { params });
export const createArea = (data: { name: string; code?: string; parent_id?: string }) =>
  api.post("/v2/areas", data);
export const updateArea = (id: string, data: { name?: string; code?: string }) =>
  api.patch(`/v2/areas/${id}`, data);
export const deleteArea = (id: string) => api.delete(`/v2/areas/${id}`);

/** Fetch region rows (BUs or areas) from the authoritative regions table.
 *  Pass type=bu to get the BU list for the area-create parent picker. */
export const getRegionsV2 = (params?: Record<string, string>) =>
  api.get<RegionBU[] | { data: RegionBU[] }>("/v2/regions", { params });

// ── Stores ───────────────────────────────────────────────────────────────
export const getStoresV2 = (params?: Record<string, string>) =>
  api.get<StoreV2[] | { data: StoreV2[] }>("/v2/stores", { params });
export const createStoreV2 = (data: Partial<StoreV2>) =>
  api.post("/v2/stores", data);
export const updateStoreV2 = (id: string, data: Partial<StoreV2>) =>
  api.patch(`/v2/stores/${id}`, data);
export const deleteStoreV2 = (id: string) => api.delete(`/v2/stores/${id}`);

// ── Sales agents ───────────────────────────────────────────────────────────
export const getSales = (params?: Record<string, string>) =>
  api.get<SalesAgentV2[] | { data: SalesAgentV2[] }>("/v2/sales", { params });
export const createSales = (data: Partial<SalesAgentV2>) =>
  api.post("/v2/sales", data);
export const updateSales = (id: string, data: Partial<SalesAgentV2>) =>
  api.patch(`/v2/sales/${id}`, data);
export const deleteSales = (id: string) => api.delete(`/v2/sales/${id}`);

// ── Recommendations ────────────────────────────────────────────────────────
export const getRecommendationsV2 = (params?: Record<string, string>) =>
  api.get<RecommendationV2[] | { data: RecommendationV2[] }>(
    "/v2/recommendations",
    { params }
  );
/** Apply — only valid when the rec is `auto_actionable`. */
export const applyRecommendationV2 = (id: string) =>
  api.post(`/v2/recommendations/${id}/apply`);
/** Acknowledge — the non-actionable path. */
export const acknowledgeRecommendationV2 = (id: string) =>
  api.post(`/v2/recommendations/${id}/acknowledge`);

// ── Dashboard ──────────────────────────────────────────────────────────────
export const getDashboardRecap = (params: { period?: string; area?: string }) =>
  api.get<DashboardRecapV2 | { data: DashboardRecapV2 }>(
    "/v2/dashboard/recap",
    { params }
  );
export const getDashboardTrending = (params: {
  period?: string;
  area?: string;
  limit?: string;
}) =>
  api.get<TrendingItemV2[] | { data: TrendingItemV2[] }>(
    "/v2/dashboard/trending",
    { params }
  );
export const getDashboardAiInsight = (params: { period?: string }) =>
  api.get<AiInsightV2 | { data: AiInsightV2 }>("/v2/dashboard/ai-insight", {
    params,
  });

/** Fetch the latest SAVED insight for the scope — never triggers LLM recompute. */
export const getDashboardLatestInsight = (params: { period?: string; area?: string }) =>
  api.get<unknown>("/v2/dashboard/latest-insight", { params });

// ── Analytics ─────────────────────────────────────────────────────────────

type AnalyticsParams = { period?: string; area?: string; limit?: string };

export const getAnalyticsSummary = (params: AnalyticsParams) =>
  api.get<AnalyticsSummaryV2>("/v2/analytics/summary", { params });

export const getAnalyticsShareByArea = (params: AnalyticsParams) =>
  api.get<ShareByAreaV2>("/v2/analytics/share-by-area", { params });

export const getAnalyticsTrend = (params: AnalyticsParams) =>
  api.get<AnalyticsTrendV2>("/v2/analytics/trend", { params });

export const getAnalyticsTopSkus = (params: AnalyticsParams) =>
  api.get<TopSkusV2>("/v2/analytics/top-skus", { params });

export const getAnalyticsCompetitorBrands = (params: AnalyticsParams) =>
  api.get<CompetitorBrandsV2>("/v2/analytics/competitor-brands", { params });

export const getAnalyticsAreaStores = (params: { area_id?: string; period?: string }) =>
  api.get<AreaStoresDrillV2>("/v2/analytics/area-stores", { params });

// ── BE → FE adapters ─────────────────────────────────────────────────────
// Mortar's live `/api/v2` shapes differ from the BUILD-PLAN scaffold these
// pages were authored against (different field names + nesting). These adapters
// are the single translation point — components keep reading the FE types in
// `types.ts`; mocks (already FE-typed) flow through unchanged. Coordinate any
// field-name changes here via the engineer ledger, not in the components.

/** Raw recap row as Mortar returns it (per-area aggregation). */
interface RawAreaRecap {
  area_id: string | null;
  area_name: string;
  invoice_count: number;
  line_item_count: number;
  total_qty: number;
}
interface RawSeriesPoint {
  date: string;
  total_qty: number;
}
interface RawRecap {
  period: string;
  totals?: {
    area_count: number;
    invoice_count: number;
    line_item_count: number;
    total_qty: number;
  };
  by_area?: RawAreaRecap[];
  qty_over_time?: RawSeriesPoint[];
}

/** recap: rename line_item_count→items_logged, total_qty→qty_sold, date→bucket. */
export function adaptRecap(body: unknown): DashboardRecapV2 | null {
  const r = unwrapOne<RawRecap>(body);
  if (!r) return null;
  return {
    period: r.period,
    by_area: (r.by_area ?? []).map((a) => ({
      area_id: a.area_id ?? "",
      area_name: a.area_name,
      items_logged: a.line_item_count,
      qty_sold: a.total_qty,
      // BE doesn't emit period-over-period delta yet → render "—".
      delta_pct: null,
    })),
    qty_over_time: (r.qty_over_time ?? []).map((p) => ({
      bucket: p.date,
      qty: p.total_qty,
    })),
    totals: r.totals
      ? {
          total_items: r.totals.line_item_count,
          total_qty: r.totals.total_qty,
          total_invoices: r.totals.invoice_count,
          active_areas: r.totals.area_count,
        }
      : undefined,
  };
}

interface RawSales {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  area_id?: string | null;
  area_name?: string;
  is_active?: boolean;
  created_at?: string;
}

/** sales: BE persists `is_active`; the FE reads `active`. Map on read so the
 *  Aktif/Nonaktif badge is truthful. (Writes already send `active`, which the
 *  BE update DTO maps back to is_active.) */
export function adaptSales(body: unknown): SalesAgentV2[] {
  return unwrapList<RawSales>(body).map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone ?? undefined,
    email: s.email ?? undefined,
    area_id: s.area_id ?? undefined,
    area_name: s.area_name,
    active: s.is_active ?? true,
    created_at: s.created_at,
  }));
}

interface RawTrendingItem {
  name: string;
  sku_id: string | null;
  sku_code?: string | null;
  total_qty: number;
}
interface RawTrending {
  per_area?: {
    area_id: string | null;
    area_name: string;
    items?: RawTrendingItem[];
  }[];
}

/** trending: flatten nested per_area groups into a ranked flat list. */
export function adaptTrending(body: unknown): TrendingItemV2[] {
  const r = unwrapOne<RawTrending>(body);
  const out: TrendingItemV2[] = [];
  for (const g of r?.per_area ?? []) {
    (g.items ?? []).forEach((it, i) => {
      out.push({
        rank: i + 1,
        name: it.name,
        sku_id: it.sku_id ?? undefined,
        sku_code: it.sku_code ?? undefined,
        qty_sold: it.total_qty,
        // BE doesn't emit per-item momentum yet → render "—".
        trend_pct: null,
        area_id: g.area_id ?? undefined,
        area_name: g.area_name,
      });
    });
  }
  return out;
}

interface RawAiInsight {
  period: string;
  headline?: string;
  insight?: string;
  highlights?: string[];
  model?: string | null;
  generated_at?: string;
}

/** ai-insight: BE emits no headline/highlights — map straight, leave optional. */
export function adaptAiInsight(body: unknown): AiInsightV2 | null {
  const r = unwrapOne<RawAiInsight>(body);
  if (!r) return null;
  return {
    period: r.period,
    headline: r.headline,
    insight: r.insight ?? "",
    highlights: r.highlights,
    model: r.model ?? undefined,
    generated_at: r.generated_at,
  };
}

interface RawLatestInsight {
  period: string;
  found: boolean;
  insight: string | null;
  model: string | null;
  generated_at: string | null;
}

/** latest-insight: maps the saved-row response; returns null when nothing saved yet. */
export function adaptLatestInsight(body: unknown): AiInsightV2 | null {
  const r = unwrapOne<RawLatestInsight>(body);
  if (!r || !r.found || !r.insight) return null;
  return {
    period: r.period,
    insight: r.insight,
    model: r.model ?? undefined,
    generated_at: r.generated_at ?? undefined,
  };
}

interface RawRecommendation {
  id: string;
  kind: string;
  title: string;
  detail?: string | null;
  source_reason?: string;
  auto_actionable: boolean;
  action_type?: string | null;
  action_payload?: Record<string, unknown> | null;
  status?: RecommendationV2["status"];
  created_at?: string;
}

/** recommendations: unwrap {items}, rename kind→type, detail→body,
 *  source_reason→reason, action_payload→payload. */
export function adaptRecommendations(body: unknown): RecommendationV2[] {
  const list = Array.isArray(body)
    ? (body as RawRecommendation[])
    : ((body as { items?: RawRecommendation[]; data?: RawRecommendation[] })
        ?.items ??
        (body as { data?: RawRecommendation[] })?.data ??
        []);
  return list.map((r) => ({
    id: r.id,
    type: r.kind,
    title: r.title,
    body: r.detail ?? "",
    reason: r.source_reason,
    auto_actionable: r.auto_actionable,
    status: r.status,
    created_at: r.created_at,
    payload: r.action_payload ?? undefined,
  }));
}
