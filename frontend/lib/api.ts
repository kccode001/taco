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
  supplier: string;
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
  type: "synonym" | "new_sku" | "mapping_rule";
  title: string;
  body: string;
  status: "pending" | "applied" | "rejected";
  created_at: string;
}

export interface TaroAnalytics {
  total_invoices: number;
  processed: number;
  needs_review: number;
  avg_confidence: number;
  monthly_volume: { month: string; count: number }[];
  top_uploaded_skus: { sku_code: string; sku_name: string; count: number }[];
  low_confidence_skus: { sku_code: string; sku_name: string; avg_confidence: number; samples: number }[];
}

export const getTaroInvoices = (params?: Record<string, string>) =>
  api.get<{ data?: TaroInvoiceSummary[] } | TaroInvoiceSummary[]>(
    "/taro-invoices",
    { params }
  );

export const getTaroInvoice = (id: string) =>
  api.get<TaroInvoiceDetail>(`/taro-invoices/${id}`);

export const bulkUploadTaroInvoices = (files: File[], regionId?: string) => {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  if (regionId) form.append("region_id", regionId);
  return api.post<{ uploaded: number; invoice_ids?: string[] }>(
    "/taro-invoices/bulk-upload",
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 180_000,
    }
  );
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

export const getTaroAnalytics = () =>
  api.get<TaroAnalytics>("/taro-invoices/analytics");

