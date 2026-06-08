import axios, { AxiosError } from "axios";
import { useAuthStore } from "./store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5013/api";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth();
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authLogin = (email: string, password: string) =>
  api.post("/auth/login", { email, password });

// Stores
export const getStores = (params?: Record<string, string>) =>
  api.get("/stores", { params });

export const getStore = (id: string) => api.get(`/stores/${id}`);

export const createStore = (data: Record<string, unknown>) =>
  api.post("/stores", data);

export const updateStore = (id: string, data: Record<string, unknown>) =>
  api.patch(`/stores/${id}`, data);

export const deleteStore = (id: string) => api.delete(`/stores/${id}`);

// Visits
export const getVisits = (params?: Record<string, string>) =>
  api.get("/visits", { params });

export const getVisit = (id: string) => api.get(`/visits/${id}`);

export const createVisit = (storeId: string) =>
  api.post("/visits", { store_id: storeId });

export const updateVisitSection = (
  visitId: string,
  sectionKey: string,
  data: Record<string, unknown>
) => api.patch(`/visits/${visitId}/sections/${sectionKey}`, { data });

export const submitVisit = (visitId: string) =>
  api.post(`/visits/${visitId}/submit`);

// Visit Schedules — Core has shipped these endpoints.
// BE returns frequency as English lowercase ("daily"|"weekly"|"monthly"|"once")
// and status as "planned"|"visited"|"missed". PlannedVisit carries the
// normalized Indonesian label so render code can drop it straight in.
export type VisitFrequencyRaw = "once" | "daily" | "weekly" | "monthly";
export type VisitFrequency = "Sekali" | "Harian" | "Mingguan" | "Bulanan";
export type ScheduleStatus = "planned" | "visited" | "missed";

export interface PlannedVisitRaw {
  schedule_id: string;
  store: {
    id: string;
    code?: string;
    name: string;
    address?: string;
    territory?: { name?: string };
  };
  frequency: VisitFrequencyRaw | VisitFrequency;
  scheduled_for: string;
  status: ScheduleStatus;
  visit_id?: string | null;
}

export interface PlannedVisit {
  schedule_id: string;
  store: {
    id: string;
    name: string;
    address?: string;
    territory_name?: string;
  };
  frequency: VisitFrequency;
  scheduled_for: string; // ISO date
  status: ScheduleStatus;
  visit_id?: string | null;
}

export interface WeekDayBucketRaw {
  date: string;
  weekday: number;
  items: PlannedVisitRaw[];
}

export interface WeekDayBucket {
  date: string; // YYYY-MM-DD
  weekday_short: string; // "Sen", "Sel"
  count: number;
  visited_count: number;
  items: PlannedVisit[];
}

export interface VisitHistoryItem {
  visit_id: string;
  store_id: string;
  store_name: string;
  territory_name?: string;
  submitted_at?: string;
  visit_date?: string;
  status: "draft" | "submitted";
}

const FREQ_LABEL: Record<string, VisitFrequency> = {
  once: "Sekali",
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
  Sekali: "Sekali",
  Harian: "Harian",
  Mingguan: "Mingguan",
  Bulanan: "Bulanan",
};

const WEEKDAY_SHORT_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function normalizePlannedVisit(raw: PlannedVisitRaw): PlannedVisit {
  return {
    schedule_id: raw.schedule_id,
    store: {
      id: raw.store.id,
      name: raw.store.name,
      address: raw.store.address,
      territory_name: raw.store.territory?.name,
    },
    frequency: FREQ_LABEL[String(raw.frequency)] ?? "Sekali",
    scheduled_for: raw.scheduled_for,
    status: raw.status,
    visit_id: raw.visit_id ?? null,
  };
}

export function normalizeWeekBucket(raw: WeekDayBucketRaw): WeekDayBucket {
  const d = new Date(raw.date);
  const jsDow = d.getDay();
  const items = (raw.items ?? []).map(normalizePlannedVisit);
  return {
    date: raw.date,
    weekday_short: WEEKDAY_SHORT_ID[jsDow] ?? "—",
    count: items.length,
    visited_count: items.filter((it) => it.status === "visited").length,
    items,
  };
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const obj = data as { data?: T[] } | null;
  return obj?.data ?? [];
}

export async function fetchPlannedToday(): Promise<PlannedVisit[]> {
  const res = await api.get("/visit-schedules/today");
  return unwrapList<PlannedVisitRaw>(res.data).map(normalizePlannedVisit);
}

export async function fetchPlannedUpcoming(): Promise<PlannedVisit[]> {
  const res = await api.get("/visit-schedules/upcoming");
  return unwrapList<PlannedVisitRaw>(res.data).map(normalizePlannedVisit);
}

export async function fetchPlannedWeek(): Promise<WeekDayBucket[]> {
  const res = await api.get("/visit-schedules/this-week");
  return unwrapList<WeekDayBucketRaw>(res.data).map(normalizeWeekBucket);
}

export async function fetchVisitHistory(
  params?: Record<string, string>
): Promise<VisitHistoryItem[]> {
  const res = await api.get("/visits/history", { params });
  return unwrapList<VisitHistoryItem>(res.data);
}

// Auth helpers (rep self)
export const getCurrentUser = () => api.get("/users/me");

// Competitor (P1) — multi-brand per visit
export interface VisitCompetitor {
  id: string;
  brand: string;
  skus?: unknown[];
  promos?: unknown[];
  posms?: unknown[];
  complete?: boolean;
  updated_at?: string;
}

export const getVisitCompetitors = (visitId: string) =>
  api.get<{ data?: VisitCompetitor[] } | VisitCompetitor[]>(
    `/visits/${visitId}/competitors`
  );

export const createVisitCompetitor = (
  visitId: string,
  data: { brand: string }
) => api.post(`/visits/${visitId}/competitors`, data);

export const updateVisitCompetitor = (
  visitId: string,
  competitorId: string,
  data: Record<string, unknown>
) => api.patch(`/visits/${visitId}/competitors/${competitorId}`, data);

export const deleteVisitCompetitor = (visitId: string, competitorId: string) =>
  api.delete(`/visits/${visitId}/competitors/${competitorId}`);

// Invoices (P2)
export interface InvoiceLineItem {
  id: string;
  product_name: string;
  brand?: string;
  qty?: number | string;
  uom?: string;
  harga_beli?: number;
  confidence?: number;
  taco_sku_id?: string;
  unclear?: boolean;
  raw_text?: string;
  notes?: string;
  skipped?: boolean;
}

export interface InvoiceRecord {
  id: string;
  visit_id: string;
  status: "pending" | "processing" | "done" | "failed";
  brand?: string;
  brands?: string[];
  supplier_name?: string;
  photo_url?: string;
  photos?: string[];
  line_items?: InvoiceLineItem[];
  needs_review?: number;
  product_count?: number;
  created_at?: string;
  mode?: "competitor" | "foto_katalog";
}

export const uploadInvoice = (
  visitId: string,
  file: File,
  mode: "competitor" | "foto_katalog" = "competitor"
) => {
  const form = new FormData();
  form.append("image", file);
  form.append("visit_id", visitId);
  form.append("mode", mode);
  return api.post<{ id: string } | InvoiceRecord>(
    `/visits/${visitId}/invoices`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000,
    }
  );
};

export const getInvoice = (id: string) =>
  api.get<InvoiceRecord>(`/invoices/${id}`);

export const getInvoiceStatus = (id: string) =>
  api.get<{ status: InvoiceRecord["status"]; progress?: number }>(
    `/invoices/${id}/status`
  );

export const getVisitInvoices = (visitId: string) =>
  api.get<{ data?: InvoiceRecord[] } | InvoiceRecord[]>(
    `/visits/${visitId}/invoices`
  );

export const updateLineItem = (
  invoiceId: string,
  lineItemId: string,
  data: Record<string, unknown>
) => api.patch(`/invoices/${invoiceId}/line-items/${lineItemId}`, data);

export const retakeInvoice = (invoiceId: string) =>
  api.post(`/invoices/${invoiceId}/retake`);

// Dashboard
export const getDashboardKpis = () => api.get("/dashboard/kpis");

export const getLiveFeed = (params?: Record<string, string>) =>
  api.get("/dashboard/feed", { params });

// Analytics
export const getCompetitorHub = (params?: Record<string, string>) =>
  api.get("/dashboard/competitor-hub", { params });

export const getPriceMovement = (params?: Record<string, string>) =>
  api.get("/dashboard/price-movement", { params });

export const getMarketDemand = () => api.get("/dashboard/market-demand");

export const getAiDigest = () => api.get("/digest/latest");

export const triggerAiDigest = () => api.post("/digest/generate");

// Analytics — v9 panels (P1 endpoints)
export type HeatmapMetric = "visits" | "taco_price" | "competitor_activity";

export interface HeatmapRegion {
  id: string;
  name: string;
  value: number;
  unit?: string;
}

export const getHeatmap = (metric: HeatmapMetric) =>
  api.get<{ data?: HeatmapRegion[] } | HeatmapRegion[]>(
    "/analytics/heatmap",
    { params: { metric } }
  );

export interface TacoPriceIndexRow {
  sku_id: string;
  sku_name: string;
  category: string;
  avg_harga_beli: number;
  avg_harga_jual: number;
  margin_pct: number;
  dispersion: number;
  store_count: number;
  alert?: "low_margin" | "top_margin" | null;
}

export const getTacoPriceIndex = (params?: { category?: string }) =>
  api.get<{ data?: TacoPriceIndexRow[] } | TacoPriceIndexRow[]>(
    "/analytics/taco-price-index",
    { params }
  );

export interface StockHealthRow {
  category: string;
  label: string;
  sangat_minimum_pct: number;
  cukup_pct: number;
  sangat_besar_pct: number;
  risk: "high" | "medium" | "low";
  trend_pct: number;
}

export const getStockHealth = () =>
  api.get<{ data?: StockHealthRow[] } | StockHealthRow[]>(
    "/analytics/stock-health"
  );

export interface PosmComplianceRow {
  asset: string;
  baik_pct: number;
  rusak_ringan_pct: number;
  perlu_ganti_pct: number;
  tidak_ada_pct: number;
  score_pct: number;
}

export const getPosmCompliance = () =>
  api.get<{ data?: PosmComplianceRow[] } | PosmComplianceRow[]>(
    "/analytics/posm-compliance"
  );

export interface BurningQTheme {
  q_id: string;
  q_text: string;
  q_kind: "ranked" | "yes_no" | "buckets";
  items: { label: string; count: number; pct?: number }[];
}

export const getBurningQThemes = () =>
  api.get<{ data?: BurningQTheme[] } | BurningQTheme[]>(
    "/analytics/burning-q-themes"
  );

export interface DataQualityBreakdown {
  owner_pic_pct: number;
  owner_pic_count: number;
  self_est_pct: number;
  self_est_count: number;
  tidak_tahu_pct: number;
  tidak_tahu_count: number;
  lainnya_pct: number;
  lainnya_count: number;
}

export const getDataQuality = () =>
  api.get<DataQualityBreakdown>("/analytics/data-quality");

export interface ProjectOpportunity {
  area: string;
  tipe: "Perumahan" | "Apartemen" | "Komersial" | "Renovasi" | "Lainnya";
  skala: "Kecil" | "Sedang" | "Besar";
  description: string;
  reporters: string[];
  signal_count: number;
}

export const getProjectOpportunities = () =>
  api.get<{ data?: ProjectOpportunity[] } | ProjectOpportunity[]>(
    "/analytics/project-opportunities"
  );

// Daily Digest (P2)
export interface DailyDigest {
  date: string;
  content_md: string;
  generated_at: string;
  brands?: string[];
  recommended_action?: string;
}

export const getDailyDigest = (date?: string) =>
  api.get<DailyDigest>("/digest/daily", {
    params: date ? { date } : undefined,
  });

export const regenerateDailyDigest = () =>
  api.post<DailyDigest>("/digest/daily/regenerate");

// Admin - Users / Staff
export const getUsers = (params?: Record<string, string>) =>
  api.get("/users", { params });

export const createUser = (data: Record<string, unknown>) =>
  api.post("/users", data);

export const updateUser = (id: string, data: Record<string, unknown>) =>
  api.patch(`/users/${id}`, data);

export const deleteUser = (id: string) => api.delete(`/users/${id}`);

// Admin - TACO SKUs
export const getTacoSkus = (params?: Record<string, string>) =>
  api.get("/taco-skus", { params });

export const createTacoSku = (data: Record<string, unknown>) =>
  api.post("/taco-skus", data);

export const updateTacoSku = (id: string, data: Record<string, unknown>) =>
  api.patch(`/taco-skus/${id}`, data);

export const deleteTacoSku = (id: string) => api.delete(`/taco-skus/${id}`);

// Admin - Competitor SKUs
export const getCompetitorSkus = (params?: Record<string, string>) =>
  api.get("/competitor-skus", { params });

export const createCompetitorSku = (data: Record<string, unknown>) =>
  api.post("/competitor-skus", data);

export const updateCompetitorSku = (
  id: string,
  data: Record<string, unknown>
) => api.patch(`/competitor-skus/${id}`, data);

export const deleteCompetitorSku = (id: string) =>
  api.delete(`/competitor-skus/${id}`);

// Admin - Competitor Brands
export const getCompetitorBrands = () => api.get("/competitor-brands");

export const createCompetitorBrand = (data: Record<string, unknown>) =>
  api.post("/competitor-brands", data);

export const updateCompetitorBrand = (
  id: string,
  data: Record<string, unknown>
) => api.patch(`/competitor-brands/${id}`, data);

export const deleteCompetitorBrand = (id: string) =>
  api.delete(`/competitor-brands/${id}`);

// Admin - Burning Questions
export const getBurningQuestions = () => api.get("/burning-questions");

export const createBurningQuestion = (data: Record<string, unknown>) =>
  api.post("/burning-questions", data);

export const updateBurningQuestion = (
  id: string,
  data: Record<string, unknown>
) => api.patch(`/burning-questions/${id}`, data);

export const deleteBurningQuestion = (id: string) =>
  api.delete(`/burning-questions/${id}`);

// Admin - POSM
export const getPosm = () => api.get("/posm");

export const createPosm = (data: Record<string, unknown>) =>
  api.post("/posm", data);

export const updatePosm = (id: string, data: Record<string, unknown>) =>
  api.patch(`/posm/${id}`, data);

export const deletePosm = (id: string) => api.delete(`/posm/${id}`);

// Admin - Visit Objectives
export const getVisitObjectives = () => api.get("/visits/objectives");
export const createVisitObjective = (data: Record<string, unknown>) =>
  api.post("/visits/objectives", data);
export const updateVisitObjective = (id: string, data: Record<string, unknown>) =>
  api.patch(`/visits/objectives/${id}`, data);
export const deleteVisitObjective = (id: string) =>
  api.delete(`/visits/objectives/${id}`);

// Admin - Visit Contexts
export const getVisitContexts = () => api.get("/visits/contexts");
export const createVisitContext = (data: Record<string, unknown>) =>
  api.post("/visits/contexts", data);
export const updateVisitContext = (id: string, data: Record<string, unknown>) =>
  api.patch(`/visits/contexts/${id}`, data);
export const deleteVisitContext = (id: string) =>
  api.delete(`/visits/contexts/${id}`);

// Admin - Wilayah (Territories)
export const getTerritories = () => api.get("/territories");
export const createTerritory = (data: Record<string, unknown>) =>
  api.post("/territories", data);
export const updateTerritory = (id: string, data: Record<string, unknown>) =>
  api.patch(`/territories/${id}`, data);
export const deleteTerritory = (id: string) => api.delete(`/territories/${id}`);

// Admin — TACO SKU CSV bulk import (dry-run + commit)
export interface CsvImportPreviewRow {
  row: number;
  code?: string;
  name?: string;
  catalog_category?: string;
  product_line?: string;
  unit?: string;
  min_price?: number;
  max_price?: number;
  status: "new" | "update" | "error";
  errors?: string[];
}

export interface CsvImportPreview {
  filename: string;
  total_rows: number;
  new_count: number;
  update_count: number;
  error_count: number;
  rows: CsvImportPreviewRow[];
}

export const importTacoSkusCsv = (file: File, dryRun: boolean) => {
  const form = new FormData();
  form.append("file", file);
  return api.post<CsvImportPreview | { imported: number; failed: number }>(
    `/taco-skus/bulk-import?dryRun=${dryRun ? "true" : "false"}`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000,
    }
  );
};

// Mark a flagged competitor SKU as "new" (promote to library)
export const promoteCompetitorSku = (id: string) =>
  api.post(`/competitor-skus/${id}/promote`);

// Voice (Forge - P2)
export const uploadVoiceRecording = (
  visitId: string,
  blob: Blob,
  section?: string
) => {
  const form = new FormData();
  const ext = (blob.type.split(";")[0].split("/")[1] || "webm").replace(
    /[^a-zA-Z0-9]/g,
    ""
  );
  form.append("audio", blob, `recording.${ext || "webm"}`);
  return api.post(`/visits/${visitId}/voice-recording`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    params: section ? { section } : undefined,
    timeout: 120_000,
  });
};

// Foto Katalog OCR (Forge - P2)
export const uploadFotoKatalog = (visitId: string, file: File) => {
  const form = new FormData();
  form.append("image", file);
  return api.post(`/visits/${visitId}/foto-katalog`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120_000,
  });
};

export interface FotoKatalogResult {
  status: "pending" | "processing" | "done" | "failed";
  matches?: {
    taco_sku_id: string;
    harga_beli?: number;
    harga_jual?: number;
    confidence?: number;
  }[];
}

export const getFotoKatalogResult = (visitId: string, jobId: string) =>
  api.get<FotoKatalogResult>(
    `/visits/${visitId}/foto-katalog/${jobId}`
  );

// Generic mobile photo upload (POSM)
export const uploadPhoto = (visitId: string, file: File, label?: string) => {
  const form = new FormData();
  form.append("image", file);
  if (label) form.append("label", label);
  return api.post<{ url: string }>(
    `/visits/${visitId}/photos`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000,
    }
  );
};

// Paginated TACO SKUs for D1 search
export interface TacoSkuPage {
  data: {
    id: string;
    code: string;
    name: string;
    category: string;
    standard_price?: number;
  }[];
  meta?: { page: number; per_page: number; total: number; has_more: boolean };
}
export const getTacoSkusPaginated = (params: {
  search?: string;
  category?: string;
  page?: number;
  per_page?: number;
}) => api.get<TacoSkuPage>("/taco-skus", { params });

export interface VoiceSummaryGroup {
  key: "info" | "data_taco" | "kompetitor" | "sinyal";
  status: "filled" | "needs_review" | "empty";
  preview: string;
}

export interface VoiceSummaryResponse {
  status: "pending" | "processing" | "done" | "failed";
  step?: "transcript" | "context" | "mapping";
  groups?: VoiceSummaryGroup[];
  transcript?: string;
}

export const getVoiceSummary = (visitId: string) =>
  api.get<VoiceSummaryResponse>(`/visits/${visitId}/voice-summary`);

// Burning Questions scoped to a store
export const getBurningQuestionsForStore = (storeId: string) =>
  api.get(`/burning-questions`, { params: { store_id: storeId } });

// ──────────────────────────────────────────────────────────────────────────
// Taro Invoices (admin)
//
// Admin-only feature: bulk OCR-extracted invoice ingestion + line-item review.
// BE endpoints land under /api/taro-invoices/*. Until Core ships them every
// caller falls back to mock data — the pages render fully with mocks.
// ──────────────────────────────────────────────────────────────────────────

export type TaroInvoiceStatus = "pending" | "processing" | "done" | "needs_review" | "failed";

export interface TaroInvoiceLine {
  id: string;
  line_no: number;
  raw_text: string;
  matched_sku_id?: string | null;
  matched_sku_code?: string | null;
  matched_sku_name?: string | null;
  confidence: number;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
}

export interface TaroInvoiceSummary {
  id: string;
  short_id: string;
  uploaded_at: string;
  /** Optional OCR-detected supplier name. Decorative only — admin uploads
   *  internal invoices, so region is the primary classifier and we never
   *  render this as a primary column. */
  ocr_detected_supplier?: string | null;
  region_id?: string | null;
  region_display?: string | null;
  line_count: number;
  avg_confidence: number;
  status: TaroInvoiceStatus;
}

export interface TaroInvoiceDetail extends TaroInvoiceSummary {
  invoice_date?: string;
  total_amount?: number;
  image_url?: string;
  line_items: TaroInvoiceLine[];
}

export interface TaroRecommendation {
  id: string;
  type: "synonym" | "new_sku" | "mapping_rule" | "update_sku_knowledge" | "investigate_competitor" | "add_synonym" | "create_sku";
  title: string;
  body: string;
  status: "pending" | "applied" | "rejected";
  created_at: string;
  /** New: BE flags whether the card originates from admin corrections or
   *  recurring OCR failures. Defaults to "admin_correction" when missing. */
  source?: "admin_correction" | "ocr_failure";
  /** Optional payload — shape varies per type. UI renders the relevant
   *  fields when present. */
  payload?: {
    existing_sku?: { code?: string; name?: string };
    suggested_synonym?: string;
    raw_text?: string;
    occurrence_count?: number;
    regions?: string[];
  };
  /** BE canonical jsonb column for apply-time data (sku_id, synonym, rule_text, etc). */
  suggested_payload?: {
    sku_id?: string;
    synonym?: string;
    rule_text?: string;
    raw_text?: string;
    suggested_synonyms?: string[];
    existing_sku?: { code?: string; name?: string };
    [key: string]: unknown;
  };
}

export interface TaroAnalytics {
  total_invoices: number;
  processed: number;
  /** BE-canonical alias for `processed`. Kept for raw payload typing. */
  processed_count?: number;
  needs_review: number;
  /** BE-canonical alias for `needs_review`. Kept for raw payload typing. */
  needs_review_count?: number;
  avg_confidence: number;
  monthly_volume: { month: string; count: number }[];
  top_uploaded_skus: { sku_code: string; sku_name: string; count: number }[];
  low_confidence_skus: { sku_code: string; sku_name: string; avg_confidence: number; samples: number }[];
  /** New regional aggregates from Core (commit 132fab0f). Optional so older
   *  BE shapes still typecheck and so mocks can omit them too. */
  regions_summary?: TaroRegionsSummaryRow[];
  region_monthly?: TaroRegionMonthlyRow[];
  top_skus_by_region?: TaroTopSkusByRegionRow[];
  region_price_extremes?: TaroRegionPriceExtremeRow[];
  /** SKU intelligence arrays (Core landing in parallel). Optional — Taro
   *  dashboard auto-resolves when the BE ships, falls back to mocks otherwise. */
  top_taco_skus?: TaroSkuRankedRow[];
  least_popular_taco_skus?: TaroSkuRankedRow[];
  trending_taco_skus?: TaroSkuTrendingRow[];
  taco_sku_monthly?: TaroSkuMonthlyRow[];
  detected_non_taco_products?: TaroNonTacoProductRow[];
}

/** SKU intelligence — BE shipped these in commit-of-the-day with this exact
 *  shape (nested `sku` object). FE pages normalize at the consumption point. */
export interface TaroSkuRankedRow {
  sku?: { code: string; name: string; category?: string | null };
  /** Legacy flat fields — kept optional so older mocks still typecheck. */
  sku_code?: string;
  sku_name?: string;
  total_volume?: number;
  total_value?: number;
  invoice_count?: number;
  /** Alias used by legacy mocks. */
  volume?: number;
}

export interface TaroSkuTrendingRow {
  sku?: { code: string; name: string; category?: string | null };
  sku_code?: string;
  sku_name?: string;
  current_month_volume?: number;
  previous_month_volume?: number;
  /** BE emits integer percent (e.g. 48 = +48%, 9999 = sentinel for "from zero"). */
  growth_pct: number;
  /** Legacy alias. */
  volume?: number;
}

export interface TaroSkuMonthlyRow {
  sku?: { code: string; name: string; category?: string | null };
  sku_code?: string;
  sku_name?: string;
  months: { month: string; volume: number }[];
}

export interface TaroNonTacoProductRow {
  raw_text: string;
  /** BE emits `occurrence_count`; legacy mocks may use `frequency`. */
  occurrence_count?: number;
  frequency?: number;
  avg_unit_price: number;
  /** BE shape — flag + nested match. */
  likely_taco_sku_match?: {
    sku: { code: string; name: string };
    similarity_score?: number;
    similarity?: number;
  } | null;
  is_likely_competitor?: boolean;
  /** BE shape `regions_seen_in: [{ region: {...}, count }]`; legacy `regions: [{ display_path, count }]`. */
  regions_seen_in?: { region: { display_path: string }; count: number }[];
  /** Legacy alias. */
  closest_taco_sku?: {
    code: string;
    name: string;
    similarity: number;
  } | null;
  regions?: { display_path: string; count: number }[];
}

/** BE-aligned region object — `id` is null for the "Tanpa Region" bucket. */
export interface TaroRegionRef {
  id: string | null;
  code: string;
  name: string;
  display_path: string;
}

export interface TaroRegionsSummaryRow {
  region: TaroRegionRef;
  invoice_count: number;
  total_line_items: number;
  avg_confidence: number;
  needs_review_rate: number;
}

export interface TaroRegionMonthlyRow {
  region: TaroRegionRef;
  months: { month: string; invoices: number }[];
}

export interface TaroTopSkusByRegionRow {
  region: TaroRegionRef;
  top_skus: {
    sku: { code: string; name: string; category: string | null };
    count: number;
  }[];
}

/** One row per (sku × region) extreme — Core emits the min + max row pair
 *  so the FE can pivot into "SKU | min region | max region | spread". */
export interface TaroRegionPriceExtremeRow {
  sku: { code: string; name: string; category: string | null };
  region: TaroRegionRef;
  avg_price: number;
  is_min: boolean;
  is_max: boolean;
}

/** BE summary list omits `short_id`, `avg_confidence`, and `region_display` —
 *  it returns the row ID, low_confidence_count, and `region_id`. Bridge to the
 *  FE shape so Home + History render real codes and percentages. */
type BERawSummary = TaroInvoiceSummary & {
  short_id?: string;
  low_confidence_count?: number;
  needs_review_count?: number;
  avg_confidence?: number;
  store_name?: string | null;
  file_name?: string | null;
  taro_region?: { display_path?: string } | null;
};

function normalizeTaroInvoiceSummary(raw: BERawSummary): TaroInvoiceSummary {
  const total = raw.line_count ?? 0;
  const lowConf = raw.low_confidence_count ?? 0;
  const fallbackConf =
    typeof raw.avg_confidence === "number"
      ? raw.avg_confidence
      : total > 0
        ? // Treat "not flagged low" as ≥0.85 and flagged as 0.6 — gives a
          // visually meaningful percent while BE catches up with avg_confidence.
          (0.85 * (total - lowConf) + 0.6 * lowConf) / total
        : 0;
  // Prefer human-readable `file_name` (without extension) over a UUID slice so
  // the invoice list shows "demo-invoice-34" instead of "2fd8c5d0".
  const fileName = (raw.file_name ?? "").replace(/\.[^.]+$/, "");
  return {
    ...raw,
    short_id: raw.short_id ?? fileName ?? raw.id?.slice(0, 8) ?? "",
    avg_confidence: fallbackConf,
    region_display:
      raw.region_display ?? raw.taro_region?.display_path ?? null,
  };
}

export const getTaroInvoices = async (params?: Record<string, string>) => {
  const res = await api.get<{ data?: BERawSummary[] } | BERawSummary[]>(
    "/taro-invoices",
    { params }
  );
  const raw = res.data;
  const list: BERawSummary[] = Array.isArray(raw)
    ? raw
    : ((raw as { data?: BERawSummary[] })?.data ?? []);
  const normalized = list.map(normalizeTaroInvoiceSummary);
  // Preserve original envelope shape so existing callers keep working.
  const data = Array.isArray(raw)
    ? (normalized as TaroInvoiceSummary[])
    : ({ ...(raw as { data?: TaroInvoiceSummary[] }), data: normalized } as {
        data?: TaroInvoiceSummary[];
      });
  return { ...res, data };
};

/** BE returns nested `matched_sku: {code,name}`, `confidence_score`, and the
 *  region join under `taro_region.display_path`. The FE was authored against
 *  a flat shape (matched_sku_code/name, confidence, region_display) — bridge
 *  the two here so the review page renders matched SKU codes + real % values
 *  instead of "Belum cocok" + NaN%. */
type BERawLine = {
  id: string;
  line_no: number;
  raw_text: string;
  matched_sku_id?: string | null;
  matched_sku?:
    | { code?: string; name?: string; id?: string }
    | null;
  matched_sku_code?: string | null;
  matched_sku_name?: string | null;
  confidence?: number;
  confidence_score?: number;
  quantity?: number | string;
  unit?: string;
  unit_price?: number | string;
  total?: number | string;
  total_price?: number | string;
};

type BERawDetail = Omit<TaroInvoiceDetail, "line_items"> & {
  taro_region?: { display_path?: string; code?: string } | null;
  line_items?: BERawLine[];
  processed_at?: string | null;
  store_name?: string | null;
  raw_image_url?: string | null;
  file_name?: string | null;
};

function normalizeTaroInvoiceDetail(raw: BERawDetail): TaroInvoiceDetail {
  const region_display =
    raw.region_display ?? raw.taro_region?.display_path ?? null;
  // BE ships the image under `raw_image_url` as a server-relative path. The
  // FE expects an absolute `image_url` because the FE host (4014) is not the
  // BE host (5013).
  const rawImg = raw.image_url ?? raw.raw_image_url ?? undefined;
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:5013/api";
  const apiOrigin = apiBase.replace(/\/api\/?$/, "");
  const image_url =
    rawImg && rawImg.startsWith("/") ? `${apiOrigin}${rawImg}` : rawImg;
  // `total_amount` arrives as a numeric string ("0.00"). Cast so formatIdr
  // and any sum math get a real number.
  const total_amount =
    raw.total_amount == null
      ? undefined
      : typeof raw.total_amount === "number"
        ? raw.total_amount
        : Number.parseFloat(String(raw.total_amount)) || 0;
  // BE detail payload doesn't include `short_id`. Prefer file_name (without
  // extension), then the UUID slice as a final fallback.
  const fileName = (raw.file_name ?? "").replace(/\.[^.]+$/, "");
  const short_id = raw.short_id ?? fileName ?? raw.id?.slice(0, 8) ?? "";
  const line_items: TaroInvoiceLine[] = (raw.line_items ?? []).map((li) => {
    const code =
      li.matched_sku_code ?? li.matched_sku?.code ?? null;
    const name =
      li.matched_sku_name ?? li.matched_sku?.name ?? null;
    // BE ships these as Postgres numeric strings ("0.600", "5.000", "64000.00")
    // — coerce every numeric field through parseFloat to handle both shapes.
    const toNum = (v: unknown): number => {
      if (typeof v === "number") return v;
      if (v == null) return 0;
      const n = Number.parseFloat(String(v));
      return Number.isFinite(n) ? n : 0;
    };
    const conf = toNum(li.confidence ?? li.confidence_score);
    const qty = toNum(li.quantity);
    const price = toNum(li.unit_price);
    const total = toNum(li.total ?? li.total_price);
    return {
      id: li.id,
      line_no: li.line_no,
      raw_text: li.raw_text,
      matched_sku_id: li.matched_sku_id ?? li.matched_sku?.id ?? null,
      matched_sku_code: code,
      matched_sku_name: name,
      confidence: conf,
      quantity: qty,
      unit: li.unit ?? "",
      unit_price: price,
      total,
    };
  });
  const line_count = raw.line_count ?? line_items.length;
  const avg_confidence =
    typeof raw.avg_confidence === "number"
      ? raw.avg_confidence
      : line_items.length
        ? line_items.reduce((sum, li) => sum + (li.confidence ?? 0), 0) /
          line_items.length
        : 0;
  return {
    ...raw,
    region_display,
    line_items,
    image_url,
    total_amount,
    short_id,
    line_count,
    avg_confidence,
  } as TaroInvoiceDetail;
}

export const getTaroInvoice = async (id: string) => {
  const res = await api.get<BERawDetail>(`/taro-invoices/${id}`);
  return { ...res, data: normalizeTaroInvoiceDetail(res.data) };
};

// Signed image URL — BE returns `{ url: "/api/taro-invoices/:id/image?token=..." }`
// with a 15-min JWT scoped to `taro_invoice_image`. The query param `?token=`
// is read by JwtStrategy so the browser can render this in `<img src>` without
// needing an Authorization header.
//
// The BE-returned URL is server-relative ("/api/..."). Since `API_BASE` ends in
// "/api", we resolve against the *origin* (strip the trailing "/api") to avoid
// "/api/api/..." double-prefix.
export async function getInvoiceImageUrl(invoiceId: string): Promise<string> {
  const res = await api.get<{ url: string }>(
    `/taro-invoices/${invoiceId}/image-url`
  );
  const raw = res.data.url;
  if (raw.startsWith("http")) return raw;
  const apiOrigin = API_BASE.replace(/\/api\/?$/, "");
  return `${apiOrigin}${raw}`;
}

export const bulkUploadTaroInvoices = (
  files: File[],
  regionId?: string,
  storeName?: string
) => {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  if (regionId) form.append("region_id", regionId);
  if (storeName) form.append("store_name", storeName);
  // BE returns Array<{id, file_name, status, region_id, store_name}> — newer
  // shape — and the older shape was {uploaded, invoice_ids}. Caller normalizes.
  return api.post<
    | { uploaded: number; invoice_ids?: string[] }
    | Array<{
        id: string;
        file_name: string;
        status: string;
        region_id: string | null;
        store_name: string | null;
      }>
  >("/taro-invoices/bulk-upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 180_000,
  });
};

// Regions / hierarchical ASM areas. Core ships GET /api/regions/areas
// returning leaf-level ASM areas with their full display path.
export interface RegionArea {
  id: string;
  code: string;
  name: string;
  display_path: string;
  type: "area";
}

export const getRegionAreas = () =>
  api.get<{ data?: RegionArea[] } | RegionArea[]>("/regions/areas");

// In-progress invoice uploads for the current user. Core ships
// GET /api/taro-invoices/uploads/in-progress returning rows the BE is still
// OCRing/mapping.  Used by the upload page to survive page refresh.
export type TaroProgressStage =
  | "queued"
  | "processing"
  | "ocr"
  | "mapping"
  | "done"
  | "failed";

export interface TaroInProgressUpload {
  id: string;
  file_name: string;
  region_id?: string | null;
  region_display?: string | null;
  status: TaroProgressStage;
  progress_percent: number;
  stage_label?: string;
  uploaded_at: string;
  error_message?: string | null;
}

export const getTaroUploadsInProgress = () =>
  api.get<{ data?: TaroInProgressUpload[] } | TaroInProgressUpload[]>(
    "/taro-invoices/uploads/in-progress"
  );

export const updateTaroLineItem = (
  lineId: string,
  data: { matched_sku_id: string; reason?: string }
) => api.patch(`/taro-invoices/line-items/${lineId}`, data);

export const getTaroRecommendations = (params?: { status?: string }) =>
  api.get<{ data?: TaroRecommendation[] } | TaroRecommendation[]>(
    "/taro-invoices/recommendations",
    { params }
  );

export const regenerateTaroRecommendations = () =>
  api.post<{ generated: number }>("/taro-invoices/recommendations/regenerate");

export const applyTaroRecommendation = (id: string) =>
  api.post(`/taro-invoices/recommendations/${id}/apply`);

export const rejectTaroRecommendation = (id: string) =>
  api.post(`/taro-invoices/recommendations/${id}/reject`);

export const getTaroAnalytics = (params?: { region_id?: string }) =>
  api.get<TaroAnalytics>("/taro-invoices/analytics", { params });

