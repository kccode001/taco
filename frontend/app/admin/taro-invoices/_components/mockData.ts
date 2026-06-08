import type {
  RegionArea,
  TaroAnalytics,
  TaroInvoiceDetail,
  TaroInvoiceSummary,
  TaroRecommendation,
} from "@/lib/api";

/** 18 leaf-level ASM areas across 5 parent regions (C / E / N / S / W).
 *  Mirrors KC's hierarchical structure `C - BU1 - ASM Cirebon`. Used when
 *  Core's GET /api/regions/areas 404s so the upload page still works. */
export const MOCK_REGION_AREAS: RegionArea[] = [
  // Central — BU1
  { id: "area-c-bdg", code: "C-BU1-BDG", name: "ASM Bandung", display_path: "C - BU1 - ASM Bandung", type: "area" },
  { id: "area-c-cbn", code: "C-BU1-CBN", name: "ASM Cirebon", display_path: "C - BU1 - ASM Cirebon", type: "area" },
  { id: "area-c-pwk", code: "C-BU1-PWK", name: "ASM PWK", display_path: "C - BU1 - ASM PWK", type: "area" },
  { id: "area-c-smg", code: "C-BU1-SMG", name: "ASM Semarang", display_path: "C - BU1 - ASM Semarang", type: "area" },
  { id: "area-c-yog", code: "C-BU1-YOG", name: "ASM Yogyakarta", display_path: "C - BU1 - ASM Yogyakarta", type: "area" },
  // East — BU1
  { id: "area-e-bnt", code: "E-BU1-BNT", name: "ASM BNT", display_path: "E - BU1 - ASM BNT", type: "area" },
  { id: "area-e-mlg", code: "E-BU1-MLG", name: "ASM Malang", display_path: "E - BU1 - ASM Malang", type: "area" },
  { id: "area-e-sby", code: "E-BU1-SBY", name: "ASM Surabaya", display_path: "E - BU1 - ASM Surabaya", type: "area" },
  { id: "area-e-bli", code: "E-BU1-BLI", name: "ASM Bali", display_path: "E - BU1 - ASM Bali", type: "area" },
  // North — BU1
  { id: "area-n-mdn", code: "N-BU1-MDN", name: "ASM Medan", display_path: "N - BU1 - ASM Medan", type: "area" },
  { id: "area-n-pkb", code: "N-BU1-PKB", name: "ASM Pekanbaru", display_path: "N - BU1 - ASM Pekanbaru", type: "area" },
  { id: "area-n-bth", code: "N-BU1-BTH", name: "ASM Batam", display_path: "N - BU1 - ASM Batam", type: "area" },
  // South — BU1
  { id: "area-s-plg", code: "S-BU1-PLG", name: "ASM Palembang", display_path: "S - BU1 - ASM Palembang", type: "area" },
  { id: "area-s-lpg", code: "S-BU1-LPG", name: "ASM Lampung", display_path: "S - BU1 - ASM Lampung", type: "area" },
  { id: "area-s-jbi", code: "S-BU1-JBI", name: "ASM Jambi", display_path: "S - BU1 - ASM Jambi", type: "area" },
  // West Metro — BU2
  { id: "area-w-jkt-b", code: "W-BU2-JKB", name: "ASM Jakarta Barat", display_path: "W - BU2 - ASM Jakarta Barat", type: "area" },
  { id: "area-w-jkt-s", code: "W-BU2-JKS", name: "ASM Jakarta Selatan", display_path: "W - BU2 - ASM Jakarta Selatan", type: "area" },
  { id: "area-w-tgr", code: "W-BU2-TGR", name: "ASM Tangerang", display_path: "W - BU2 - ASM Tangerang", type: "area" },
];

/** Fallback mock data while Core ships /api/taro-invoices/*. Every list/detail
 *  page renders these when the BE returns 404 — same shape as the real API
 *  so swapping in live data is a no-op. */

export const MOCK_TARO_INVOICES: TaroInvoiceSummary[] = [
  {
    id: "ti_01HX1A",
    short_id: "TI-2026-001",
    uploaded_at: "2026-06-08T08:14:00Z",
    supplier: "PT Sinar Multi Jaya",
    line_count: 14,
    avg_confidence: 0.91,
    status: "done",
  },
  {
    id: "ti_01HX1B",
    short_id: "TI-2026-002",
    uploaded_at: "2026-06-08T07:42:00Z",
    supplier: "CV Karya Mandiri",
    line_count: 8,
    avg_confidence: 0.76,
    status: "needs_review",
  },
  {
    id: "ti_01HX1C",
    short_id: "TI-2026-003",
    uploaded_at: "2026-06-07T16:20:00Z",
    supplier: "Toko Maju Bersama",
    line_count: 21,
    avg_confidence: 0.88,
    status: "done",
  },
  {
    id: "ti_01HX1D",
    short_id: "TI-2026-004",
    uploaded_at: "2026-06-07T11:05:00Z",
    supplier: "PT Sinar Multi Jaya",
    line_count: 6,
    avg_confidence: 0.62,
    status: "needs_review",
  },
  {
    id: "ti_01HX1E",
    short_id: "TI-2026-005",
    uploaded_at: "2026-06-07T09:30:00Z",
    supplier: "PD Sumber Rejeki",
    line_count: 11,
    avg_confidence: 0.0,
    status: "processing",
  },
  {
    id: "ti_01HX1F",
    short_id: "TI-2026-006",
    uploaded_at: "2026-06-06T15:48:00Z",
    supplier: "PT Anugrah Sentosa",
    line_count: 9,
    avg_confidence: 0.94,
    status: "done",
  },
  {
    id: "ti_01HX1G",
    short_id: "TI-2026-007",
    uploaded_at: "2026-06-06T10:11:00Z",
    supplier: "CV Karya Mandiri",
    line_count: 17,
    avg_confidence: 0.82,
    status: "done",
  },
  {
    id: "ti_01HX1H",
    short_id: "TI-2026-008",
    uploaded_at: "2026-06-05T14:00:00Z",
    supplier: "Toko Maju Bersama",
    line_count: 4,
    avg_confidence: 0.55,
    status: "needs_review",
  },
];

export const MOCK_INVOICE_DETAIL: Record<string, TaroInvoiceDetail> = {
  ti_01HX1A: {
    ...MOCK_TARO_INVOICES[0],
    invoice_date: "2026-06-07",
    total_amount: 18_750_000,
    image_url: undefined,
    line_items: [
      {
        id: "li_1",
        line_no: 1,
        raw_text: "TACO HPL Maple Solid 12mm",
        matched_sku_id: "1",
        matched_sku_code: "TH-001-12-MAP",
        matched_sku_name: "TACO HPL Maple Solid 12mm",
        confidence: 0.97,
        quantity: 25,
        unit: "lembar",
        unit_price: 230_000,
        total: 5_750_000,
      },
      {
        id: "li_2",
        line_no: 2,
        raw_text: "TIero HPL Walnut Prem 3mm",
        matched_sku_id: "2",
        matched_sku_code: "TI-008-3-WAL",
        matched_sku_name: "TIero HPL Walnut Premium 3mm",
        confidence: 0.91,
        quantity: 12,
        unit: "lembar",
        unit_price: 400_000,
        total: 4_800_000,
      },
      {
        id: "li_3",
        line_no: 3,
        raw_text: "ECO HPL Nat Oak 3mm",
        matched_sku_id: "3",
        matched_sku_code: "ES-002-3-NTR",
        matched_sku_name: "ECO HPL Natural Oak 3mm",
        confidence: 0.88,
        quantity: 18,
        unit: "lembar",
        unit_price: 175_000,
        total: 3_150_000,
      },
      {
        id: "li_4",
        line_no: 4,
        raw_text: "TC Edging ABS 2mm WLN",
        matched_sku_id: "5",
        matched_sku_code: "TE-2MM-W",
        matched_sku_name: "TACO Edging ABS 2mm Walnut",
        confidence: 0.72,
        quantity: 200,
        unit: "meter",
        unit_price: 15_500,
        total: 3_100_000,
      },
      {
        id: "li_5",
        line_no: 5,
        raw_text: "Engsel softclose XYZ",
        matched_sku_id: null,
        matched_sku_code: null,
        matched_sku_name: null,
        confidence: 0.43,
        quantity: 60,
        unit: "pcs",
        unit_price: 32_500,
        total: 1_950_000,
      },
    ],
  },
  ti_01HX1B: {
    ...MOCK_TARO_INVOICES[1],
    invoice_date: "2026-06-06",
    total_amount: 6_420_000,
    line_items: [
      {
        id: "li_b1",
        line_no: 1,
        raw_text: "FIDECO MDF 9mm",
        matched_sku_id: "8",
        matched_sku_code: "FD-MDF-9MM",
        matched_sku_name: "FIDECO MDF 9mm 1220x2440",
        confidence: 0.81,
        quantity: 30,
        unit: "lembar",
        unit_price: 155_000,
        total: 4_650_000,
      },
      {
        id: "li_b2",
        line_no: 2,
        raw_text: "Vinyl Lux Plank Oak",
        matched_sku_id: "7",
        matched_sku_code: "TV-LUX-405",
        matched_sku_name: "Vinyl Luxury Plank 4mm Oak",
        confidence: 0.66,
        quantity: 12,
        unit: "m²",
        unit_price: 105_000,
        total: 1_260_000,
      },
      {
        id: "li_b3",
        line_no: 3,
        raw_text: "Hardware engsel piano",
        matched_sku_id: null,
        confidence: 0.39,
        quantity: 18,
        unit: "pcs",
        unit_price: 28_500,
        total: 513_000,
      },
    ],
  },
};

export const MOCK_RECOMMENDATIONS: TaroRecommendation[] = [
  {
    id: "rec_1",
    type: "synonym",
    title: "Tambah sinonim \"TC Edging\" untuk TACO Edging",
    body: "5 invoice terakhir menulis \"TC Edging\" dan admin mengoreksi ke TACO Edging ABS. Menambahkan sinonim ini akan menaikkan akurasi OCR ~12% untuk lini Edging.",
    status: "pending",
    created_at: "2026-06-08T06:00:00Z",
  },
  {
    id: "rec_2",
    type: "new_sku",
    title: "Buat SKU baru: Engsel SoftClose XYZ",
    body: "Muncul 8x dalam 2 minggu terakhir tanpa kecocokan. Supplier menyebutnya \"Engsel softclose XYZ\" dengan harga konsisten Rp 32.500/pcs. Pertimbangkan menambahkan ke katalog.",
    status: "pending",
    created_at: "2026-06-08T06:00:00Z",
  },
  {
    id: "rec_3",
    type: "mapping_rule",
    title: "Aturan mapping: \"WLN\" → Walnut",
    body: "Singkatan \"WLN\" muncul 14x dalam line items dan selalu dikoreksi ke variant Walnut. Aturan otomatis akan mengurangi review manual.",
    status: "pending",
    created_at: "2026-06-08T06:00:00Z",
  },
  {
    id: "rec_4",
    type: "synonym",
    title: "Tambah sinonim \"MDF Fideco\" untuk FIDECO MDF",
    body: "Supplier sering membalik urutan kata. Saat ini OCR mendapat confidence ~0.65, sinonim akan menaikkannya ke ~0.90.",
    status: "pending",
    created_at: "2026-06-07T18:00:00Z",
  },
  {
    id: "rec_5",
    type: "new_sku",
    title: "Buat SKU baru: Lem Putih Universal 1kg",
    body: "Tercatat di 6 invoice dari 3 supplier berbeda. Belum ada padanan di katalog TACO.",
    status: "pending",
    created_at: "2026-06-07T18:00:00Z",
  },
  {
    id: "rec_6",
    type: "mapping_rule",
    title: "Aturan mapping: \"PRM\" → Premium",
    body: "Singkatan PRM konsisten dikoreksi menjadi Premium di SKU TIero. Otomatisasi rendah-risiko.",
    status: "pending",
    created_at: "2026-06-07T09:30:00Z",
  },
  {
    id: "rec_7",
    type: "synonym",
    title: "Tambah sinonim \"Hpl\" untuk HPL",
    body: "Variasi penulisan kecil-besar otomatis dinormalisasi. Diterapkan minggu lalu.",
    status: "applied",
    created_at: "2026-06-03T10:00:00Z",
  },
  {
    id: "rec_8",
    type: "new_sku",
    title: "Buat SKU baru: Paku Beton 5cm",
    body: "Hanya 2 invoice memuat item ini — terlalu jarang untuk dijadikan SKU. Ditolak.",
    status: "rejected",
    created_at: "2026-06-04T14:20:00Z",
  },
];

export const MOCK_ANALYTICS: TaroAnalytics = {
  total_invoices: 184,
  processed: 168,
  needs_review: 16,
  avg_confidence: 0.84,
  monthly_volume: [
    { month: "Jan", count: 12 },
    { month: "Feb", count: 18 },
    { month: "Mar", count: 24 },
    { month: "Apr", count: 31 },
    { month: "Mei", count: 42 },
    { month: "Jun", count: 57 },
  ],
  top_uploaded_skus: [
    { sku_code: "TH-001-12-MAP", sku_name: "TACO HPL Maple Solid 12mm", count: 87 },
    { sku_code: "TI-008-3-WAL", sku_name: "TIero HPL Walnut Premium 3mm", count: 64 },
    { sku_code: "ES-002-3-NTR", sku_name: "ECO HPL Natural Oak 3mm", count: 58 },
    { sku_code: "TE-2MM-W", sku_name: "TACO Edging ABS 2mm Walnut", count: 49 },
    { sku_code: "FD-MDF-9MM", sku_name: "FIDECO MDF 9mm 1220x2440", count: 41 },
    { sku_code: "TS-101-1220", sku_name: "TACO Sheet Beech 1220mm", count: 33 },
    { sku_code: "TV-LUX-405", sku_name: "Vinyl Luxury Plank 4mm Oak", count: 27 },
    { sku_code: "HW-HNG-01", sku_name: "TACO Hardware Hinge SoftClose", count: 22 },
    { sku_code: "TH-002-9-OAK", sku_name: "TACO HPL Oak Solid 9mm", count: 18 },
    { sku_code: "TI-009-3-OAK", sku_name: "TIero HPL Oak Premium 3mm", count: 15 },
  ],
  low_confidence_skus: [
    { sku_code: "HW-HNG-XYZ", sku_name: "Engsel SoftClose XYZ (unmatched)", avg_confidence: 0.41, samples: 8 },
    { sku_code: "TE-1MM-?", sku_name: "TACO Edging 1mm (variant unclear)", avg_confidence: 0.49, samples: 6 },
    { sku_code: "FD-MDF-?", sku_name: "FIDECO MDF (thickness unclear)", avg_confidence: 0.54, samples: 5 },
    { sku_code: "TV-LUX-405", sku_name: "Vinyl Luxury Plank 4mm Oak", avg_confidence: 0.62, samples: 11 },
    { sku_code: "TE-2MM-W", sku_name: "TACO Edging ABS 2mm Walnut", avg_confidence: 0.68, samples: 14 },
    { sku_code: "HW-HNG-01", sku_name: "TACO Hardware Hinge SoftClose", avg_confidence: 0.71, samples: 9 },
    { sku_code: "TI-008-3-WAL", sku_name: "TIero HPL Walnut Premium 3mm", avg_confidence: 0.73, samples: 22 },
    { sku_code: "ES-002-3-NTR", sku_name: "ECO HPL Natural Oak 3mm", avg_confidence: 0.74, samples: 19 },
    { sku_code: "TS-101-1220", sku_name: "TACO Sheet Beech 1220mm", avg_confidence: 0.76, samples: 12 },
    { sku_code: "FD-MDF-9MM", sku_name: "FIDECO MDF 9mm 1220x2440", avg_confidence: 0.78, samples: 17 },
  ],
};

/** Confidence badge tone helper used by list + detail. */
export function confidenceTone(c: number): { tone: "ok" | "warn" | "err"; label: string; dot: string } {
  if (c >= 0.85) return { tone: "ok", label: "Yakin", dot: "#1D9E75" };
  if (c >= 0.7) return { tone: "warn", label: "Perlu Cek", dot: "#E07B00" };
  return { tone: "err", label: "Perlu Review", dot: "#D0342C" };
}

export function formatIdr(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
