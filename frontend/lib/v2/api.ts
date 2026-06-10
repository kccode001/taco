/** TACO v2 — management API client.
 *  Reuses the v1 axios instance (`api`) for its auth interceptor + baseURL
 *  (`/api`), so all calls below hit `/api/v2/*`. New file per the v1 freeze —
 *  do NOT add v2 endpoints into the large v1 `lib/api.ts`. */

import { api } from "@/lib/api";
import type {
  AreaV2,
  StoreV2,
  SalesAgentV2,
  RecommendationV2,
  DashboardRecapV2,
  TrendingItemV2,
  AiInsightV2,
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
export const createArea = (data: Partial<AreaV2>) =>
  api.post("/v2/areas", data);
export const updateArea = (id: string, data: Partial<AreaV2>) =>
  api.patch(`/v2/areas/${id}`, data);
export const deleteArea = (id: string) => api.delete(`/v2/areas/${id}`);

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
export const getDashboardTrending = (params: { area?: string }) =>
  api.get<TrendingItemV2[] | { data: TrendingItemV2[] }>(
    "/v2/dashboard/trending",
    { params }
  );
export const getDashboardAiInsight = (params: { period?: string }) =>
  api.get<AiInsightV2 | { data: AiInsightV2 }>("/v2/dashboard/ai-insight", {
    params,
  });
