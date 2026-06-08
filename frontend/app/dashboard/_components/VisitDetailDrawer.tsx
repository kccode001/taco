"use client";

import { useEffect, useState } from "react";
import { getVisit } from "@/lib/api";
import {
  VisitDetail,
  VisitFeedRow,
  VisitPic,
  PosmKondisi,
  DataMethod,
  DemandSlug,
  CompetitorBrandCard,
} from "./types";
import { AudioPlayer } from "./AudioPlayer";
import { StockLevelGrid } from "./StockLevelGrid";
import { SentimenLegend, sentimenLabel } from "./SentimenLegend";
import { BurningQuestionAnswerCard } from "./BurningQuestionAnswerCard";
import { InvoicePhotoPreview } from "./InvoicePhotoPreview";

const PIC_LABEL: Record<VisitPic["role"], string> = {
  owner: "Owner",
  purchaser: "Purchaser",
  sales_staff: "Sales Staff",
  warehouse: "Warehouse",
};

const CONTEXT_LABEL: Record<string, string> = {
  ada_pertemuan_khusus: "Ada pertemuan khusus",
  toko_ramai: "Toko ramai",
  kunjungan_singkat: "Kunjungan singkat",
};

const METHOD_LABEL: Record<DataMethod, string> = {
  foto_katalog: "Foto Katalog",
  rekam_suara: "Rekam Suara",
  isi_manual: "Isi Manual",
};

const POSM_KONDISI: Record<PosmKondisi, { label: string; tone: "ok" | "warn" | "muted" | "error" }> = {
  baik: { label: "Baik", tone: "ok" },
  rusak_ringan: { label: "Rusak Ringan", tone: "warn" },
  perlu_ganti: { label: "Perlu Ganti", tone: "warn" },
  tidak_ada: { label: "Tidak Ada", tone: "muted" },
};

const DEMAND_LABEL: Record<DemandSlug, string> = {
  laminate: "Laminate",
  vinyl: "Vinyl",
  hpl: "HPL",
  sheet: "Sheet",
  edging: "Edging",
  hardware: "Hardware",
  fideco: "FIDECO",
  lainnya: "Lainnya",
};

const DEMAND_ORDER: DemandSlug[] = [
  "laminate",
  "vinyl",
  "hpl",
  "sheet",
  "edging",
  "hardware",
  "fideco",
  "lainnya",
];

const SUMBER_DATA_LABEL: Record<string, string> = {
  owner_pic: "Owner / PIC",
  self_estimation: "Self Estimation",
  tidak_tahu: "Tidak Tahu",
  lainnya: "Lainnya",
};

function formatRp(n?: number): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("id-ID");
}

function formatVisitDate(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const time = d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} ${time}`;
  } catch {
    return "—";
  }
}

const MOCK_DETAIL_BASE: Omit<VisitDetail, "id"> = {
  store_name: "Toko Material Jaya Abadi",
  store_territory: "Tangerang Selatan",
  rep_name: "Budi Santoso",
  visited_at: "2026-06-07T09:47:00+07:00",
  invoice_count: 2,
  invoice_brands: 3,
  invoice_needs_review: 1,
  invoice_photos: [],
  delta_tags: ["harga", "stok", "kompetitor"],
  pics: [
    { role: "owner", name: "Pak Hendra" },
    { role: "purchaser", name: "Bu Lina" },
  ],
  contexts_selected: ["toko_ramai", "kunjungan_singkat"],
  catatan_penting:
    "Toko minta promo akhir bulan, tanya stok vinyl. Pak Hendra menyebut kompetitor Krono aktif beri diskon.",
  catatan_penting_audio: { url: "", duration_sec: 38 },
  data_taco_method: "foto_katalog",
  data_taco_rows: [
    {
      sku_name: "Laminate Classic 8mm",
      harga_beli: 145000,
      harga_jual: 172000,
      promo: "Diskon",
      terjual: "15 box",
      stok: "8 box",
    },
    {
      sku_name: "Laminate Walnut 10mm",
      harga_beli: 162000,
      harga_jual: 195000,
      promo: null,
      terjual: "6 box",
      stok: "12 box",
    },
    {
      sku_name: "Vinyl Tile 4mm",
      harga_beli: 96000,
      harga_jual: 118000,
      promo: null,
      terjual: "10 box",
      stok: "4 box",
    },
  ],
  sumber_data: "owner_pic",
  stock_levels: {
    taco_hpl: "minimum",
    tiero: "cukup",
    eco_hpl: "cukup",
    taco_sheet: "cukup",
    taco_edging: "cukup",
    taco_hardware: "besar",
    vinyl: "minimum",
    fideco: "cukup",
  },
  posm: [
    { asset_name: "Standing Banner TACO", photo_url: null, kondisi: "baik" },
    { asset_name: "Leaflet Promo Laminate", photo_url: null, kondisi: "perlu_ganti" },
  ],
  competitors: [
    {
      brand: "Krono",
      promo_active: true,
      skus: [
        { name: "Laminate 8mm Original", harga_beli: 155000, harga_jual: 165000, flag: "populer" },
        { name: "Laminate 10mm AquaStop", harga_beli: 175000, harga_jual: 195000, flag: "top" },
      ],
      promo_text: "Diskon 10% langsung · Jan–Jun 2026 · Seluruh Jabodetabek",
      posm: [{ name: "Backdrop Standing Krono", kondisi: "baik" }],
    },
    {
      brand: "Egger",
      promo_active: false,
      skus: [
        { name: "HPL Matte 3mm Beige", harga_beli: 185000, harga_jual: 198000, flag: "baru" },
      ],
      // Sparse competitor — promo and posm not captured → drawer shows "—"
      promo_text: null,
      posm: [],
    },
  ],
  burning_answers: [
    {
      question: "Produk TACO apa yang paling sering ditanya customer bulan ini?",
      answer:
        "Laminate tahan air paling banyak. Pelanggan tanya ukuran 8mm anti-lembab — ada yang mau renovasi kamar mandi area dry zone.",
    },
    {
      question: "Apakah toko ini menjual produk kompetitor di kategori vinyl minggu ini?",
      answer:
        "Ya, ada stok Krono vinyl 4mm. Pak Hendra bilang tukang lebih pilih Krono karena harga beli 15% lebih murah.",
    },
    {
      question: "Berapa estimasi total pembelian TACO toko ini bulan lalu?",
      answer:
        "Pak Hendra estimasi Rp 28–32 juta — terutama Laminate dan HPL. Pembelian bulan ini diperkirakan naik 10–15% karena ada proyek Komplek Griya Lestari.",
    },
  ],
  sentimen: "positif",
  sentimen_note:
    "Pak Hendra senang dengan program promo akhir bulan. Minta agar jadwal kunjungan lebih rutin — minimal 2 minggu sekali.",
  sentimen_audio: { url: "", duration_sec: 72 },
  demand_selected: ["laminate", "vinyl"],
  project_signal: {
    has_project: true,
    tipe: "perumahan",
    skala: "sedang",
    description:
      "Komplek Griya Lestari BSD ~200 unit, masuk fase finishing Agustus. PIC: Pak Joko di CV Bangun Sejahtera.",
  },
  peluang_catatan:
    "Pak Hendra menawarkan area khusus untuk display TACO Sheet di depan kasir — boleh dipasang spanduk dan poster.",
  peluang_audio: { url: "", duration_sec: 24 },
};

function buildMockDetail(seed: VisitFeedRow): VisitDetail {
  return {
    ...MOCK_DETAIL_BASE,
    id: seed.id,
    store_name: seed.store_name,
    store_territory: seed.store_territory ?? MOCK_DETAIL_BASE.store_territory,
    rep_name: seed.rep_name ?? MOCK_DETAIL_BASE.rep_name,
    visited_at: seed.submitted_at ?? MOCK_DETAIL_BASE.visited_at,
    invoice_count: seed.invoice_count ?? MOCK_DETAIL_BASE.invoice_count,
    delta_tags: seed.delta_tags?.length ? seed.delta_tags : MOCK_DETAIL_BASE.delta_tags,
  };
}

function PosmChip({ kondisi }: { kondisi: PosmKondisi }) {
  const { label, tone } = POSM_KONDISI[kondisi];
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-taco-success"
      : tone === "warn"
      ? "bg-amber-50 text-taco-warning"
      : tone === "error"
      ? "bg-red-50 text-taco-error"
      : "bg-taco-page text-taco-muted border border-taco-border";
  return (
    <span
      data-testid={`posm-kondisi-${kondisi}`}
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function PhotoIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CompetitorCard({ card }: { card: CompetitorBrandCard }) {
  return (
    <div
      data-testid={`competitor-card-${card.brand.toLowerCase()}`}
      className="bg-taco-page border border-taco-border rounded-[10px] p-3.5 mb-2.5"
    >
      <div className="flex justify-between items-start mb-2.5">
        <div className="text-[15px] font-bold text-taco-text">{card.brand}</div>
        {card.promo_active && (
          <span
            className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-taco-warning"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            Promo Aktif
          </span>
        )}
      </div>

      {card.skus && card.skus.length > 0 && (
        <table className="w-full text-[13px] mb-2.5">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-taco-muted bg-white">
              <th className="text-left px-2.5 py-1.5 font-semibold">Produk</th>
              <th className="text-left px-2.5 py-1.5 font-semibold">Harga Beli</th>
              <th className="text-left px-2.5 py-1.5 font-semibold">Harga Jual</th>
              <th className="text-left px-2.5 py-1.5 font-semibold">Flag</th>
            </tr>
          </thead>
          <tbody>
            {card.skus.map((sku) => (
              <tr key={sku.name} className="border-t border-taco-divider">
                <td className="px-2.5 py-1.5 font-medium">{sku.name}</td>
                <td className="px-2.5 py-1.5">{formatRp(sku.harga_beli)}</td>
                <td className="px-2.5 py-1.5">{formatRp(sku.harga_jual)}</td>
                <td className="px-2.5 py-1.5">
                  {sku.flag === "populer" && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                      Populer
                    </span>
                  )}
                  {sku.flag === "top" && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700">
                      Top SKU
                    </span>
                  )}
                  {sku.flag === "baru" && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-taco-info">
                      Baru
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="text-[11px] text-taco-muted mb-1">PROMO AKTIF</div>
      {card.promo_text ? (
        <div className="text-[13px] text-taco-text mb-2.5">{card.promo_text}</div>
      ) : (
        <div data-testid="competitor-promo-empty" className="text-[13px] text-taco-muted mb-2.5">
          — Tidak tercatat saat kunjungan
        </div>
      )}

      <div className="text-[11px] text-taco-muted mb-1">POSM KOMPETITOR</div>
      {card.posm && card.posm.length > 0 ? (
        <div className="flex flex-col gap-2">
          {card.posm.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-md bg-white border border-taco-border flex items-center justify-center text-taco-muted">
                <PhotoIcon />
              </div>
              <div>
                <div className="text-[13px] font-medium">{item.name ?? "—"}</div>
                {item.kondisi && (
                  <div className="mt-0.5">
                    <PosmChip kondisi={item.kondisi} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div data-testid="competitor-posm-empty" className="text-[13px] text-taco-muted">
          — Tidak tercatat saat kunjungan
        </div>
      )}
    </div>
  );
}

interface VisitDetailDrawerProps {
  seed: VisitFeedRow;
  onClose: () => void;
}

export function VisitDetailDrawer({ seed, onClose }: VisitDetailDrawerProps) {
  const [detail, setDetail] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVisit(seed.id)
      .then((res) => {
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload: any = res.data?.data ?? res.data;
        if (payload && typeof payload === "object" && payload.store_name) {
          setDetail({ ...buildMockDetail(seed), ...payload, id: seed.id });
        } else {
          setDetail(buildMockDetail(seed));
        }
      })
      .catch(() => {
        if (!cancelled) setDetail(buildMockDetail(seed));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const data = detail ?? buildMockDetail(seed);
  const demandSet = new Set<DemandSlug>(data.demand_selected ?? []);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="visit-drawer"
    >
      <div className="bg-white w-full max-w-[660px] h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header — visit context */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-taco-divider sticky top-0 bg-white z-10">
          <div>
            <div className="text-[18px] font-bold text-taco-text">{data.store_name}</div>
            <div
              data-testid="visit-context-line"
              className="text-[13px] text-taco-sub mt-1"
            >
              Kunjungan • {formatVisitDate(data.visited_at)}
            </div>
            <div className="text-[12px] text-taco-sub mt-0.5">
              {data.rep_name}
              {data.store_territory ? ` · ${data.store_territory}` : ""}
            </div>
            {(data.invoice_count ?? 0) > 0 && (
              <div
                data-testid="invoice-summary-stat"
                className="text-[12px] text-taco-sub mt-1.5 inline-flex items-center gap-1.5"
              >
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-taco-info">
                  <PhotoIcon size={10} /> {data.invoice_count} invoice
                </span>
                <span>
                  {data.data_taco_rows?.length ?? 20} produk · {data.invoice_brands ?? 3} brand
                  {(data.invoice_needs_review ?? 0) > 0
                    ? ` · ${data.invoice_needs_review} perlu review`
                    : ""}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="drawer-close"
            className="p-2 text-taco-muted hover:text-taco-text"
            aria-label="Tutup"
          >
            <CloseIcon />
          </button>
        </div>

        {loading && !detail ? (
          <div className="text-center text-[13px] text-taco-sub py-10">Memuat detail kunjungan…</div>
        ) : (
          <div className="flex-1 p-5 space-y-6">
            {/* Invoice photos */}
            {(data.invoice_count ?? 0) > 0 && (
              <section className="pb-4 border-b border-taco-divider">
                <div className="text-[11px] uppercase tracking-wide text-taco-muted font-bold mb-2">
                  Invoice Foto
                </div>
                <InvoicePhotoPreview photos={data.invoice_photos} />
              </section>
            )}

            {/* Section 1 — Info Kunjungan */}
            <section
              data-testid="section-info"
              className="pb-4 border-b border-taco-divider"
            >
              <div className="text-[11px] uppercase tracking-wide text-taco-muted font-bold mb-3">
                1 — Info Kunjungan
              </div>

              {/* Multi-PIC chips */}
              <div className="mb-3">
                <div className="text-[12px] text-taco-muted mb-1.5">PIC Ditemui (multi)</div>
                <div data-testid="pic-chips" className="flex flex-wrap gap-1.5">
                  {(data.pics ?? []).map((pic) => (
                    <span
                      key={pic.role}
                      data-testid={`pic-chip-${pic.role}`}
                      className="inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-medium bg-taco-text text-white"
                    >
                      {PIC_LABEL[pic.role]}
                    </span>
                  ))}
                </div>
                {data.pics && data.pics.some((p) => p.name) && (
                  <div className="text-[14px] font-medium text-taco-text mt-1.5">
                    {data.pics.map((p) => p.name).filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>

              {/* Konteks */}
              <div className="mb-3">
                <div className="text-[12px] text-taco-muted mb-1.5">Konteks Kunjungan</div>
                <div className="flex flex-wrap gap-1.5">
                  {["ada_pertemuan_khusus", "toko_ramai", "kunjungan_singkat"].map((slug) => {
                    const isSelected = (data.contexts_selected ?? []).includes(slug as never);
                    return (
                      <span
                        key={slug}
                        className={
                          isSelected
                            ? "inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-medium bg-taco-text text-white"
                            : "inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-medium bg-white text-taco-text border border-taco-border"
                        }
                      >
                        {CONTEXT_LABEL[slug]}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Catatan Penting + audio */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[12px] text-taco-muted">Catatan Penting</div>
                  {data.catatan_penting_audio && (
                    <AudioPlayer recording={data.catatan_penting_audio} />
                  )}
                </div>
                <div className="text-[14px] text-taco-text leading-relaxed bg-taco-page rounded-lg p-3">
                  {data.catatan_penting ?? "—"}
                </div>
              </div>
            </section>

            {/* Section 2 — Data TACO */}
            <section
              data-testid="section-data-taco"
              className="pb-4 border-b border-taco-divider"
            >
              <div className="text-[11px] uppercase tracking-wide text-taco-muted font-bold mb-3">
                2 — Data TACO
              </div>

              {/* D1 method indicator chip */}
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-semibold text-taco-text">SKU & Harga</div>
                {data.data_taco_method && (
                  <span
                    data-testid="d1-method-chip"
                    className="inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[11px] font-semibold bg-blue-50 text-taco-info border border-blue-200"
                  >
                    <PhotoIcon size={10} />
                    Sumber: {METHOD_LABEL[data.data_taco_method]}
                  </span>
                )}
              </div>

              {/* D1 table */}
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-taco-muted bg-taco-page">
                      <th className="text-left px-2.5 py-1.5 font-semibold">SKU</th>
                      <th className="text-left px-2.5 py-1.5 font-semibold">Harga Beli</th>
                      <th className="text-left px-2.5 py-1.5 font-semibold">Harga Jual</th>
                      <th className="text-left px-2.5 py-1.5 font-semibold">Promo</th>
                      <th className="text-left px-2.5 py-1.5 font-semibold">Terjual</th>
                      <th className="text-left px-2.5 py-1.5 font-semibold">Stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.data_taco_rows ?? []).map((row) => (
                      <tr key={row.sku_name} className="border-t border-taco-divider">
                        <td className="px-2.5 py-1.5 font-medium">{row.sku_name}</td>
                        <td className="px-2.5 py-1.5">{formatRp(row.harga_beli)}</td>
                        <td className="px-2.5 py-1.5">{formatRp(row.harga_jual)}</td>
                        <td className="px-2.5 py-1.5">
                          {row.promo ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-taco-warning">
                              {row.promo}
                            </span>
                          ) : (
                            <span className="text-[11px] text-taco-muted">—</span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5">{row.terjual ?? "—"}</td>
                        <td className="px-2.5 py-1.5">{row.stok ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* D2 Sumber Data */}
              <div className="flex items-center gap-3 mb-4">
                <div className="text-[13px] font-semibold text-taco-text">Sumber Data:</div>
                <span className="inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-medium bg-taco-text text-white">
                  {SUMBER_DATA_LABEL[data.sumber_data ?? "owner_pic"] ?? "Owner / PIC"}
                </span>
              </div>

              {/* D3 Stock Level Grid — 8 rows */}
              <div className="mb-4">
                <StockLevelGrid values={data.stock_levels} />
              </div>

              {/* D4 POSM Audit — kondisi enum */}
              <div data-testid="posm-section">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-semibold text-taco-text">POSM Audit</div>
                  <span
                    data-testid="posm-enum-note"
                    className="text-[11px] text-taco-muted"
                  >
                    Kondisi: Baik / Rusak Ringan / Perlu Ganti / Tidak Ada
                  </span>
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-taco-muted bg-taco-page">
                      <th className="text-left px-2.5 py-1.5 font-semibold">Aset</th>
                      <th className="text-left px-2.5 py-1.5 font-semibold">Foto</th>
                      <th className="text-left px-2.5 py-1.5 font-semibold">Kondisi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.posm ?? []).map((row) => (
                      <tr key={row.asset_name} className="border-t border-taco-divider">
                        <td className="px-2.5 py-1.5 font-medium">{row.asset_name}</td>
                        <td className="px-2.5 py-1.5">
                          <div className="w-9 h-9 rounded-md bg-taco-page border border-taco-border flex items-center justify-center text-taco-muted">
                            <PhotoIcon />
                          </div>
                        </td>
                        <td className="px-2.5 py-1.5">
                          <PosmChip kondisi={row.kondisi} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 3 — Kompetitor */}
            <section
              data-testid="section-kompetitor"
              className="pb-4 border-b border-taco-divider"
            >
              <div className="text-[11px] uppercase tracking-wide text-taco-muted font-bold mb-3">
                3 — Kompetitor
              </div>
              {(data.competitors ?? []).map((c) => (
                <CompetitorCard key={c.brand} card={c} />
              ))}
            </section>

            {/* Section 4 — Sinyal Pasar */}
            <section data-testid="section-sinyal" className="pb-2">
              <div className="text-[11px] uppercase tracking-wide text-taco-muted font-bold mb-3">
                4 — Sinyal Pasar
              </div>

              {/* Burning Q answers — all 3 */}
              <div className="mb-4">
                <div className="text-[13px] font-semibold text-taco-text mb-2">
                  Jawaban Pertanyaan Wajib ({(data.burning_answers ?? []).length})
                </div>
                {(data.burning_answers ?? []).map((ba, i) => (
                  <BurningQuestionAnswerCard key={i} answer={ba} />
                ))}
              </div>

              {/* Sentimen Pemilik — 5-level legend */}
              <div className="mb-4" data-testid="sentimen-section">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-semibold text-taco-text">Sentimen Pemilik</div>
                  {data.sentimen_audio && <AudioPlayer recording={data.sentimen_audio} />}
                </div>
                <SentimenLegend selected={data.sentimen} />
                <div className="text-[12px] text-taco-muted mt-1.5">
                  Dipilih: {sentimenLabel(data.sentimen)}
                </div>
                {data.sentimen_note && (
                  <div className="text-[13px] text-taco-sub mt-2 leading-relaxed">
                    {data.sentimen_note}
                  </div>
                )}
              </div>

              {/* Demand chips — all 8 */}
              <div className="mb-4">
                <div className="text-[13px] font-semibold text-taco-text mb-2">
                  Produk Banyak Ditanya (8)
                </div>
                <div data-testid="demand-chips" className="flex flex-wrap gap-1.5">
                  {DEMAND_ORDER.map((slug) => {
                    const isSelected = demandSet.has(slug);
                    return (
                      <span
                        key={slug}
                        data-testid={`demand-chip-${slug}`}
                        data-selected={isSelected ? "true" : "false"}
                        className={
                          isSelected
                            ? "inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-medium bg-taco-text text-white"
                            : "inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-medium bg-white text-taco-text border border-taco-border"
                        }
                      >
                        {DEMAND_LABEL[slug]}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Project Intel */}
              {data.project_signal?.has_project && (
                <div className="mb-4">
                  <div className="text-[13px] font-semibold text-taco-text mb-2">
                    Sinyal Proyek
                  </div>
                  <div
                    className="rounded-[10px] p-3"
                    style={{
                      background: "#EEF3FF",
                      border: "1px solid #C7D8F5",
                      borderLeft: "3px solid #3B7DD8",
                    }}
                  >
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {data.project_signal.tipe && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-semibold bg-white text-taco-info border border-blue-200 capitalize">
                          {data.project_signal.tipe}
                        </span>
                      )}
                      {data.project_signal.skala && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-semibold bg-white text-taco-info border border-blue-200 capitalize">
                          {data.project_signal.skala}
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-taco-text leading-relaxed">
                      {data.project_signal.description}
                    </div>
                  </div>
                </div>
              )}

              {/* Peluang / Catatan Lain */}
              <div data-testid="peluang-section">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-semibold text-taco-text">
                    Peluang / Catatan Lain
                  </div>
                  {data.peluang_audio && <AudioPlayer recording={data.peluang_audio} />}
                </div>
                <div className="text-[13px] text-taco-sub bg-taco-page rounded-lg p-3 leading-relaxed">
                  {data.peluang_catatan ?? "—"}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
