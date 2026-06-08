export type SinyalLevel = "sangat_positif" | "positif" | "netral" | "kurang_puas" | "negatif";

export type StockLevel = "minimum" | "cukup" | "besar" | null;

export type PosmKondisi = "baik" | "rusak_ringan" | "perlu_ganti" | "tidak_ada";

export type DataMethod = "foto_katalog" | "rekam_suara" | "isi_manual";

export type DemandSlug =
  | "laminate"
  | "vinyl"
  | "hpl"
  | "sheet"
  | "edging"
  | "hardware"
  | "fideco"
  | "lainnya";

export type ProductLine =
  | "taco_hpl"
  | "tiero"
  | "eco_hpl"
  | "taco_sheet"
  | "taco_edging"
  | "taco_hardware"
  | "vinyl"
  | "fideco";

export interface DashboardKpi {
  visits_today: number;
  visits_today_delta?: number;
  coverage_percent: number;
  stores_visited_today: number;
  active_reps: number;
  total_reps: number;
  invoices_processed: number;
  invoices_failed: number;
}

export type DeltaTag = "harga" | "stok" | "sinyal" | "kompetitor";

export interface VisitFeedRow {
  id: string;
  store_name: string;
  store_territory?: string;
  rep_name: string;
  rep_initials?: string;
  submitted_at?: string;
  invoice_count?: number;
  delta_tags?: DeltaTag[];
  is_new?: boolean;
}

export interface VisitPic {
  role: "owner" | "purchaser" | "sales_staff" | "warehouse";
  name?: string;
}

export interface VisitDataTacoRow {
  sku_name: string;
  harga_beli?: number;
  harga_jual?: number;
  promo?: string | null;
  terjual?: string;
  stok?: string;
}

export interface PosmRow {
  asset_name: string;
  photo_url?: string | null;
  kondisi: PosmKondisi;
}

export interface CompetitorBrandCard {
  brand: string;
  promo_active?: boolean;
  skus?: {
    name: string;
    harga_beli?: number;
    harga_jual?: number;
    flag?: "populer" | "top" | "baru";
  }[];
  promo_text?: string | null;
  posm?: {
    name?: string;
    photo_url?: string | null;
    kondisi?: PosmKondisi;
  }[];
  product_photos?: string[];
}

export interface BurningAnswer {
  question: string;
  answer: string;
}

export interface ProjectSignal {
  has_project: boolean;
  tipe?: "perumahan" | "apartemen" | "komersial" | "renovasi" | "lainnya";
  skala?: "kecil" | "sedang" | "besar";
  description?: string;
}

export interface AudioRecording {
  url: string;
  duration_sec: number;
}

export interface VisitDetail {
  id: string;
  store_name: string;
  store_territory?: string;
  rep_name: string;
  visited_at?: string;
  invoice_count?: number;
  invoice_brands?: number;
  invoice_needs_review?: number;
  invoice_photos?: string[];
  delta_tags?: DeltaTag[];
  pics?: VisitPic[];
  contexts_selected?: ("ada_pertemuan_khusus" | "toko_ramai" | "kunjungan_singkat")[];
  catatan_penting?: string;
  catatan_penting_audio?: AudioRecording | null;
  data_taco_method?: DataMethod;
  data_taco_rows?: VisitDataTacoRow[];
  sumber_data?: "owner_pic" | "self_estimation" | "tidak_tahu" | "lainnya";
  stock_levels?: Partial<Record<ProductLine, StockLevel>>;
  posm?: PosmRow[];
  competitors?: CompetitorBrandCard[];
  burning_answers?: BurningAnswer[];
  sentimen?: SinyalLevel;
  sentimen_note?: string;
  sentimen_audio?: AudioRecording | null;
  demand_selected?: DemandSlug[];
  project_signal?: ProjectSignal;
  peluang_catatan?: string;
  peluang_audio?: AudioRecording | null;
}
