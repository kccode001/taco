/** Mock fallbacks for the v2 management surface — used ONLY while Mortar's
 *  `/api/v2/*` endpoints are pre-launch. Each page prefers live data and falls
 *  back to these so the UI is reviewable now. Remove reliance once live.
 *  Shapes mirror `lib/v2/types.ts` exactly. */

import type {
  AreaV2,
  StoreV2,
  SalesAgentV2,
  RecommendationV2,
  DashboardRecapV2,
  TrendingItemV2,
  AiInsightV2,
} from "@/lib/v2/types";

export const MOCK_AREAS: AreaV2[] = [
  { id: "a1", name: "Bandung", code: "BDG", store_count: 12, created_at: "2026-05-01" },
  { id: "a2", name: "Jakarta Selatan", code: "JKS", store_count: 18, created_at: "2026-05-01" },
  { id: "a3", name: "Surabaya", code: "SBY", store_count: 9, created_at: "2026-05-03" },
  { id: "a4", name: "Semarang", code: "SMG", store_count: 5, created_at: "2026-05-08" },
  { id: "a5", name: "Medan", code: "MDN", store_count: 4, created_at: "2026-05-12" },
];

export const MOCK_STORES: StoreV2[] = [
  { id: "s1", area_id: "a1", area_name: "Bandung", name: "Toko Bangunan Jaya Abadi", created_by: "Rudi", created_at: "2026-05-02" },
  { id: "s2", area_id: "a1", area_name: "Bandung", name: "UD Sumber Makmur", created_by: "Rudi", created_at: "2026-05-04" },
  { id: "s3", area_id: "a2", area_name: "Jakarta Selatan", name: "Mitra Bangunan Kebayoran", created_by: "Sinta", created_at: "2026-05-05" },
  { id: "s4", area_id: "a2", area_name: "Jakarta Selatan", name: "Toko Material Fatmawati", created_by: "Sinta", created_at: "2026-05-06" },
  { id: "s5", area_id: "a3", area_name: "Surabaya", name: "Sentra Bangunan Rungkut", created_by: "Bayu", created_at: "2026-05-07" },
  { id: "s6", area_id: "a4", area_name: "Semarang", name: "Toko Besi Pandanaran", created_by: "Bayu", created_at: "2026-05-09" },
];

export const MOCK_SALES: SalesAgentV2[] = [
  { id: "sa1", name: "Rudi Hartono", phone: "0812-1111-2222", email: "rudi@taco.co.id", area_id: "a1", area_name: "Bandung", active: true, created_at: "2026-04-20" },
  { id: "sa2", name: "Sinta Dewi", phone: "0813-3333-4444", email: "sinta@taco.co.id", area_id: "a2", area_name: "Jakarta Selatan", active: true, created_at: "2026-04-20" },
  { id: "sa3", name: "Bayu Pratama", phone: "0857-5555-6666", email: "bayu@taco.co.id", area_id: "a3", area_name: "Surabaya", active: true, created_at: "2026-04-22" },
  { id: "sa4", name: "Lina Kurnia", phone: "0878-7777-8888", area_id: "a4", area_name: "Semarang", active: false, created_at: "2026-04-25" },
];

export const MOCK_RECOMMENDATIONS: RecommendationV2[] = [
  {
    id: "r1",
    type: "add_synonym",
    title: "Tambah sinonim “TC Maple” ke TACO HPL Maple Solid 12mm",
    body: "OCR sering membaca “TC Maple” untuk SKU ini di area Bandung. Menambah sinonim akan menaikkan akurasi mapping otomatis.",
    reason: "Admin mengoreksi 7 baris dari “TC Maple” → TH-001-12-MAP dalam 14 hari terakhir.",
    auto_actionable: true,
    status: "pending",
    payload: { sku_code: "TH-001-12-MAP", synonym: "TC Maple" },
  },
  {
    id: "r2",
    type: "create_sku",
    title: "Pertimbangkan SKU baru: “TACO Edging ABS 3mm Oak”",
    body: "Muncul 9× di Jakarta Selatan tetapi tidak ada di katalog. Perlu keputusan manual sebelum dibuat.",
    reason: "9 baris UNKNOWN dengan teks serupa, semua di Jakarta Selatan.",
    auto_actionable: false,
    status: "pending",
    payload: { raw_text: "Edging ABS 3mm Oak", occurrence_count: 9 },
  },
  {
    id: "r3",
    type: "investigate_competitor",
    title: "Investigasi kompetitor: “Krono Walnut 4mm”",
    body: "Terdeteksi sebagai produk non-TACO yang sering muncul. Tandai untuk investigasi pasar; tidak ada aksi otomatis.",
    reason: "Admin menandai 5 baris sebagai kompetitor di Surabaya.",
    auto_actionable: false,
    status: "pending",
    payload: { raw_text: "Krono Walnut 4mm" },
  },
];

export const MOCK_RECAP: DashboardRecapV2 = {
  period: "30d",
  totals: { total_items: 1284, total_qty: 8421, total_invoices: 342, active_areas: 5 },
  by_area: [
    { area_id: "a2", area_name: "Jakarta Selatan", items_logged: 512, qty_sold: 3120, delta_pct: 12.4 },
    { area_id: "a1", area_name: "Bandung", items_logged: 388, qty_sold: 2540, delta_pct: 5.1 },
    { area_id: "a3", area_name: "Surabaya", items_logged: 221, qty_sold: 1610, delta_pct: -3.2 },
    { area_id: "a4", area_name: "Semarang", items_logged: 98, qty_sold: 740, delta_pct: -8.7 },
    { area_id: "a5", area_name: "Medan", items_logged: 65, qty_sold: 411, delta_pct: 2.0 },
  ],
  qty_over_time: [
    { bucket: "Mgg 1", qty: 1820, "Jakarta Selatan": 720, Bandung: 560, Surabaya: 360, Semarang: 120, Medan: 60 },
    { bucket: "Mgg 2", qty: 2010, "Jakarta Selatan": 780, Bandung: 600, Surabaya: 400, Semarang: 140, Medan: 90 },
    { bucket: "Mgg 3", qty: 2240, "Jakarta Selatan": 860, Bandung: 660, Surabaya: 410, Semarang: 200, Medan: 110 },
    { bucket: "Mgg 4", qty: 2351, "Jakarta Selatan": 760, Bandung: 720, Surabaya: 440, Semarang: 280, Medan: 151 },
  ],
};

export const MOCK_TRENDING: TrendingItemV2[] = [
  { rank: 1, sku_code: "TH-001-12-MAP", name: "TACO HPL Maple Solid 12mm", qty_sold: 412, trend_pct: 18.2, area_name: "Jakarta Selatan" },
  { rank: 2, sku_code: "TI-008-3-WAL", name: "TIero HPL Walnut Premium 3mm", qty_sold: 388, trend_pct: 9.4, area_name: "Bandung" },
  { rank: 3, sku_code: "TS-101-1220", name: "TACO Sheet Beech 1220mm", qty_sold: 301, trend_pct: -2.1, area_name: "Surabaya" },
  { rank: 4, sku_code: "TE-2MM-W", name: "TACO Edging ABS 2mm Walnut", qty_sold: 277, trend_pct: 5.6, area_name: "Jakarta Selatan" },
  { rank: 5, sku_code: "ES-002-3-NTR", name: "ECO HPL Natural Oak 3mm", qty_sold: 198, trend_pct: 22.0, area_name: "Bandung" },
];

export const MOCK_AI_INSIGHT: AiInsightV2 = {
  period: "30d",
  headline: "Jakarta Selatan memimpin permintaan; Semarang melambat dan kurang diunggah",
  insight:
    "Selama 30 hari terakhir, Jakarta Selatan menyumbang ~37% item tercatat dan tumbuh 12,4% — didorong HPL Maple & Edging. Bandung stabil naik (ECO HPL Natural Oak melonjak 22%, sinyal permintaan entry-level). Surabaya dan Semarang menurun: Semarang turun 8,7% DAN volume unggahan tim Taro di sana paling rendah — kemungkinan kurang liputan, bukan murni penurunan pasar. Rekomendasi: dorong tim Taro Semarang menaikkan frekuensi unggah sebelum menyimpulkan demand turun.",
  highlights: [
    "Jakarta Selatan: ~37% item, +12,4%",
    "ECO HPL Natural Oak +22% di Bandung",
    "Semarang -8,7% & unggahan terendah → cek liputan",
  ],
  generated_at: "2026-06-10T21:00:00+07:00",
  model: "claude-opus-4-8",
};
