export type UserRole = "rep" | "manager" | "admin" | "taro_agent";

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  territory_id?: string;
  territory_name?: string;
  /** For taro_agent — short ASM area display path, e.g. "C - BU1 - ASM Bandung" */
  region_id?: string;
  region_display?: string;
  region_code?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

export interface Store {
  id: string;
  code?: string;
  name: string;
  address?: string;
  type_id?: string;
  type_name?: string;
  territory_id?: string;
  territory_name?: string;
  assigned_rep_id?: string;
  assigned_rep_name?: string;
  active: boolean;
  health?: "aktif" | "perlu_update" | "tidak_aktif" | "belum_dikunjungi";
  last_visit_date?: string;
  last_visit_days_ago?: number;
}

export interface Visit {
  id: string;
  store_id: string;
  store_name?: string;
  rep_id: string;
  rep_name?: string;
  status: "draft" | "submitted";
  submitted_at?: string;
  created_at?: string;
  changed_sections?: string[];
  prior_visit_id?: string;
  sections?: VisitSection[];
}

export interface VisitSection {
  visit_id: string;
  section_key: string;
  data: Record<string, unknown>;
  prefilled_from_visit_id?: string;
}

export interface Invoice {
  id: string;
  visit_id: string;
  image_url?: string;
  status: "pending" | "processing" | "done" | "failed";
  processed_at?: string;
  line_items?: InvoiceLineItem[];
  competitor_brand?: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  raw_text: string;
  qty?: number;
  unit_price?: number;
  mapped_taco_sku_id?: string;
  mapped_sku_name?: string;
  confidence_score?: number;
  is_unknown: boolean;
  is_unclear: boolean;
  rep_note?: string;
}

export interface TacoSku {
  id: string;
  code: string;
  name: string;
  category: string;
  standard_price?: number;
}

export interface CompetitorSku {
  id: string;
  raw_name: string;
  canonical_name?: string;
  competitor_brand?: string;
  mapped_taco_sku_id?: string;
  confirmed_at?: string;
  flagged_for_review: boolean;
}

export interface BurningQuestion {
  id: string;
  text: string;
  scope_type: "company" | "region" | "store";
  scope_id?: string;
  active: boolean;
  created_by?: string;
}

export interface KpiData {
  visits_today: number;
  visits_today_delta?: number;
  coverage_percent: number;
  active_reps: number;
  total_reps: number;
  stores_visited_today: number;
  invoices_processed: number;
  invoices_failed: number;
}

export interface VisitDraft {
  visit_id?: string;
  store_id: string;
  sections: Record<string, Record<string, unknown>>;
  is_prefilled: boolean;
  prior_visit_days_ago?: number;
}
