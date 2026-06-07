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

// Invoices
export const uploadInvoice = (visitId: string, file: File) => {
  const form = new FormData();
  form.append("image", file);
  form.append("visit_id", visitId);
  return api.post("/invoices/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const getInvoice = (id: string) => api.get(`/invoices/${id}`);

export const getVisitInvoices = (visitId: string) =>
  api.get(`/invoices?visit_id=${visitId}`);

export const updateLineItem = (
  invoiceId: string,
  lineItemId: string,
  data: Record<string, unknown>
) => api.patch(`/invoices/${invoiceId}/line-items/${lineItemId}`, data);

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
