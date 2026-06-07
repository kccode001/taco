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
export const deleteVisitObjective = (id: string) =>
  api.delete(`/visits/objectives/${id}`);

// Admin - Visit Contexts
export const getVisitContexts = () => api.get("/visits/contexts");
export const createVisitContext = (data: Record<string, unknown>) =>
  api.post("/visits/contexts", data);
export const deleteVisitContext = (id: string) =>
  api.delete(`/visits/contexts/${id}`);

// Territories
export const getTerritories = () => api.get("/territories");

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
