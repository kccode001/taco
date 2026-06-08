import type { TaroInvoiceSummary } from "@/lib/api";

export interface AgentUpload extends TaroInvoiceSummary {
  store_name: string;
  file_name?: string;
}

/** Fallback list when BE hasn't shipped agent-scoped /api/taro-invoices?agent_id=
 *  or while the seed is empty. Mirrors store visits a Jakarta agent would do. */
export const MOCK_AGENT_UPLOADS: AgentUpload[] = [
  {
    id: "tu_001",
    short_id: "TU-2026-001",
    uploaded_at: nowMinus(45 * 60 * 1000),
    region_id: "area-w-jkt-s",
    region_display: "J - BU1 - ASM Jakarta 1",
    line_count: 12,
    avg_confidence: 0.91,
    status: "done",
    store_name: "Toko Bangunan Jaya Abadi",
    file_name: "invoice_jaya_abadi_08jun.jpg",
  },
  {
    id: "tu_002",
    short_id: "TU-2026-002",
    uploaded_at: nowMinus(3 * 3600 * 1000),
    region_id: "area-w-jkt-s",
    region_display: "J - BU1 - ASM Jakarta 1",
    line_count: 8,
    avg_confidence: 0.78,
    status: "needs_review",
    store_name: "UD Sumber Makmur",
    file_name: "invoice_sumber_makmur.jpg",
  },
  {
    id: "tu_003",
    short_id: "TU-2026-003",
    uploaded_at: nowMinus(5 * 3600 * 1000),
    region_id: "area-w-jkt-s",
    region_display: "J - BU1 - ASM Jakarta 1",
    line_count: 0,
    avg_confidence: 0,
    status: "processing",
    store_name: "Toko Cahaya Kayu",
    file_name: "invoice_cahaya_kayu.jpg",
  },
  {
    id: "tu_004",
    short_id: "TU-2026-004",
    uploaded_at: nowMinus(26 * 3600 * 1000),
    region_id: "area-w-jkt-s",
    region_display: "J - BU1 - ASM Jakarta 1",
    line_count: 15,
    avg_confidence: 0.87,
    status: "done",
    store_name: "PT Karya Bangun Persada",
    file_name: "invoice_karya_bangun.jpg",
  },
  {
    id: "tu_005",
    short_id: "TU-2026-005",
    uploaded_at: nowMinus(2 * 24 * 3600 * 1000),
    region_id: "area-w-jkt-s",
    region_display: "J - BU1 - ASM Jakarta 1",
    line_count: 6,
    avg_confidence: 0.64,
    status: "needs_review",
    store_name: "Depo Material Sejahtera",
    file_name: "invoice_depo_sejahtera.jpg",
  },
  {
    id: "tu_006",
    short_id: "TU-2026-006",
    uploaded_at: nowMinus(3 * 24 * 3600 * 1000),
    region_id: "area-w-jkt-s",
    region_display: "J - BU1 - ASM Jakarta 1",
    line_count: 4,
    avg_confidence: 0,
    status: "failed",
    store_name: "Toko Bangunan Mentari",
    file_name: "invoice_mentari_blur.jpg",
  },
  {
    id: "tu_007",
    short_id: "TU-2026-007",
    uploaded_at: nowMinus(4 * 24 * 3600 * 1000),
    region_id: "area-w-jkt-s",
    region_display: "J - BU1 - ASM Jakarta 1",
    line_count: 18,
    avg_confidence: 0.93,
    status: "done",
    store_name: "CV Mitra Material",
    file_name: "invoice_mitra_material.jpg",
  },
];

function nowMinus(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

export function statusLabel(status: AgentUpload["status"]): string {
  switch (status) {
    case "done":
      return "Selesai";
    case "needs_review":
      return "Perlu Review";
    case "processing":
      return "Proses";
    case "failed":
      return "Gagal";
    default:
      return "Antrian";
  }
}

export function statusTone(
  status: AgentUpload["status"]
): "ok" | "warn" | "err" | "info" {
  switch (status) {
    case "done":
      return "ok";
    case "needs_review":
      return "warn";
    case "failed":
      return "err";
    default:
      return "info";
  }
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "baru saja";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "baru saja";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} mnt lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
  });
}

export function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
