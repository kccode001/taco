"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  fetchCoverage,
  fetchTopSkusPerArea,
  fetchTopNonTacoInvoices,
  fetchCategoryDistribution,
  fetchCategoryMonthlyTrend,
  fetchCategorySkus,
  fetchPriceBands,
  fetchSkuPriceHistory,
  fetchSkuStorePricing,
  fetchBrandBucketDistribution,
  fetchBrandBucketDetail,
  PAGE_SIZE,
  type MarketScope,
} from "@/lib/v2/marketIntel";
import {
  getDashboardAiInsight,
  getDashboardLatestInsight,
  getRegionsV2,
  adaptAiInsight,
  adaptLatestInsight,
  unwrapList,
} from "@/lib/v2/api";
import type {
  CoverageV2,
  PaginationV2,
  PriceBandsV2,
  PriceBandRow,
  SkuPriceHistoryV2,
  SkuStorePricingV2,
  StorePricingRow,
  TopSkusPerAreaV2,
  TopNonTacoInvoicesV2,
  CategoryDistributionV2,
  CategoryMonthlyTrendV2,
  CategorySkusV2,
  BrandBucketDistributionV2,
  BrandBucketDetailV2,
  BrandBucket,
  RegionBU,
  AiInsightV2,
} from "@/lib/v2/types";
import { V2PageHeader } from "../_components/V2Tabs";
import { AiInsightModal } from "../_components/AiInsightModal";
import { SparkleIcon } from "../../../admin/_components/icons";

// ── Formatters ───────────────────────────────────────────────────────────────
const idID = new Intl.NumberFormat("id-ID");
const rupiah = (v: number) => `Rp ${idID.format(Math.round(v))}`;

/** Compact Rupiah magnitude WITHOUT the "Rp" prefix: 168000 → "168rb", 5.2e6 → "5,2jt". */
function compact(v: number): string {
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 1_000_000)
    return `${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}rb`;
  return idID.format(Math.round(v));
}
const compactRp = (v: number) => `Rp ${compact(v)}`;

/** DD-MM-YYYY from a "YYYY-MM-DD"(…) string or ISO datetime; "—" when null. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}-${String(
    d.getMonth() + 1
  ).padStart(2, "0")}-${d.getFullYear()}`;
}

/** DD-MM short label for the trend x-axis. */
function fmtDateShort(iso: string | null | undefined): string {
  const full = fmtDate(iso);
  return full === "—" ? "—" : full.slice(0, 5);
}

const PERIODS = [
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
  { value: "90d", label: "90 hari" },
  // "Bulan Ini" (this_month) cut per KC decision 2026-06-15 — its saved AI brief
  // served stale pre-seed copy with banned framing. View kept unreachable.
  { value: "last_month", label: "Bln Lalu" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "Semua" },
];

// Locked AC-28 sub-lines (HONEST COPY LOCK, spec §3 — rendered verbatim).
const SUB_FREQ = "Berdasarkan kemunculan di invoice terunggah — bukan volume penjualan.";
// AC-31 (revised 2026-06-15) locked sub-line — a negated market-share
// disclaimer, allowlisted alongside the §4 pie sub-line for the AC-15 guard.
const SUB_NONTACO_INV = "Porsi nilai dalam tiap invoice terunggah — bukan pangsa pasar.";
const SUB_CAT_PIE =
  "Porsi baris TACO per kategori — dari invoice terunggah, bukan pangsa kategori pasar.";
const SUB_CAT_LINE = "Jumlah invoice terunggah per bulan.";
const SUB_LAPORAN =
  "Harga & qty tercatat per SKU TACO — dari invoice terunggah, bukan total pasar.";
const SUB_MEREK = "% dari baris invoice yang diunggah — bukan pangsa pasar.";
const TOTAL_TAG = "Total (tercatat di sampel terunggah)";

// Donut palette (brand-system): one accent per panel, rest neutral.
const CAT_COLORS: Record<string, string> = {
  Laminates: "#F04E23",
  Flooring: "#1A1A1A",
  Hardware: "#717171",
  FIDECO: "#ADADAD",
  "Tidak terkategori": "#E5E5E5",
};
const CAT_LINE_COLORS = ["#F04E23", "#1A1A1A", "#717171", "#ADADAD", "#3B7DD8"];
const BUCKET_META: Record<BrandBucket, { label: string; color: string }> = {
  taco: { label: "TACO", color: "#F04E23" },
  kompetitor: { label: "Kompetitor", color: "#1A1A1A" },
  lain_lain: { label: "Lain-lain", color: "#ADADAD" },
};

// ── Async wrapper for per-panel independent loading/error/data ───────────────
interface Async<T> {
  loading: boolean;
  error: boolean;
  data: T | null;
}
const LOADING = { loading: true, error: false, data: null } as const;

// ════════════════════════════════════════════════════════════════════════════
// Shared bits
// ════════════════════════════════════════════════════════════════════════════

/** AC-2 coverage chip — always rendered, shows "—" on error/missing. */
function CoverageChip({ c, error, loading }: { c?: CoverageV2 | null; error?: boolean; loading?: boolean }) {
  const text = loading
    ? "memuat…"
    : error || !c
    ? "— invoice · — toko · — wilayah"
    : `${c.n_invoices} invoice · ${c.m_stores} toko · ${c.k_areas} wilayah · terakhir ${fmtDate(
        c.last_invoice_date
      )}`;
  return (
    <span className="flex-shrink-0 inline-flex items-center text-[10px] text-taco-muted bg-taco-page border border-taco-border rounded-full px-2.5 py-1 tabular-nums">
      {text}
    </span>
  );
}

function Panel({
  title,
  sub,
  coverage,
  coverageError,
  coverageLoading,
  children,
}: {
  title: string;
  sub?: string;
  coverage?: CoverageV2 | null;
  coverageError?: boolean;
  coverageLoading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-taco-card border border-taco-border rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-taco-text">{title}</h2>
          {sub && <p className="text-[11px] text-taco-sub mt-0.5 max-w-[460px]">{sub}</p>}
        </div>
        <CoverageChip c={coverage} error={coverageError} loading={coverageLoading} />
      </div>
      {children}
    </section>
  );
}

/** AC-3 thin-data — body replaced, no numbers, single exact sentence. */
function ThinData({ n }: { n: number }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10">
      <div className="text-[26px] mb-2 opacity-60">🔬</div>
      <p className="text-[13px] text-taco-text font-medium">
        Sampel terlalu kecil untuk filter ini (N={n}).{" "}
        <span className="text-taco-sub font-normal">
          Tambah periode atau pilih wilayah lain.
        </span>
      </p>
    </div>
  );
}

function PanelError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10">
      <div className="text-[24px] mb-2 text-taco-error">⚠️</div>
      <p className="text-[13px] text-taco-text font-medium">Gagal memuat panel ini.</p>
      <button
        onClick={onRetry}
        className="mt-3 h-8 px-4 rounded-lg bg-white border border-taco-border text-[12px] text-taco-text hover:bg-taco-page transition-colors"
      >
        Coba lagi
      </button>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-taco-divider rounded animate-pulse ${className}`} />;
}

/** Highlight the matched substring (case-insensitive) of `text` against `q`. */
function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.trim();
  if (!needle) return <>{text}</>;
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-taco-accent-tint text-taco-text rounded px-0.5">
        {text.slice(i, i + needle.length)}
      </mark>
      {text.slice(i + needle.length)}
    </>
  );
}

function Pager({
  pagination,
  page,
  onPage,
}: {
  pagination?: PaginationV2;
  page: number;
  onPage: (p: number) => void;
}) {
  const total = pagination?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const btn = "h-8 w-8 rounded-lg border border-taco-border bg-white flex items-center justify-center";
  return (
    <div className="flex items-center gap-2 text-[12px] text-taco-sub">
      <span className="tabular-nums">
        Hal. {page} / {pages}
      </span>
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className={`${btn} ${page <= 1 ? "text-taco-muted cursor-not-allowed" : "text-taco-text hover:bg-taco-page"}`}
        aria-label="Sebelumnya"
      >
        ◀
      </button>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        className={`${btn} ${page >= pages ? "text-taco-muted cursor-not-allowed" : "text-taco-text hover:bg-taco-page"}`}
        aria-label="Berikutnya"
      >
        ▶
      </button>
    </div>
  );
}

function SearchInput({ q, onQ, placeholder, width = "w-[230px]" }: { q: string; onQ: (v: string) => void; placeholder: string; width?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted text-[13px]">🔎</span>
      <input
        type="text"
        value={q}
        onChange={(e) => onQ(e.target.value)}
        placeholder={placeholder}
        className={`h-9 ${width} pl-8 pr-3 rounded-lg text-[13px] bg-white border text-taco-text placeholder:text-taco-muted outline-none focus:border-taco-accent ${q ? "border-taco-accent" : "border-taco-border"}`}
      />
    </div>
  );
}

/** Donut chart from concentric arc segments (matches design HTML). */
function Donut({
  slices,
  size = 132,
  width = 18,
  onSlice,
}: {
  slices: { label: string; value: number; color: string }[];
  size?: number;
  width?: number;
  onSlice?: (label: string) => void;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const C = 2 * Math.PI * 44;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="flex-shrink-0 -rotate-90" style={{ width: size, height: size }}>
      <circle cx={60} cy={60} r={44} fill="none" stroke="#F0F0F0" strokeWidth={width} />
      {slices.map((s) => {
        const len = (s.value / total) * C;
        const el = (
          <circle
            key={s.label}
            cx={60}
            cy={60}
            r={44}
            fill="none"
            stroke={s.color}
            strokeWidth={width}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            className={onSlice ? "cursor-pointer" : ""}
            onClick={onSlice ? () => onSlice(s.label) : undefined}
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

function ModalShell({ children, onClose, maxW = "max-w-2xl" }: { children: React.ReactNode; onClose: () => void; maxW?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxW} max-h-[88vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-taco-border overflow-hidden`}>
        {children}
      </div>
    </div>
  );
}

function Breadcrumb({ trail }: { trail: { label: string; onClick?: () => void }[] }) {
  return (
    <div className="text-[11px] text-taco-sub flex items-center gap-1.5 flex-wrap">
      {trail.map((t, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-taco-muted">/</span>}
          {t.onClick ? (
            <button onClick={t.onClick} className="text-taco-accent font-medium hover:underline">
              {i > 0 ? "◀ " : ""}
              {t.label}
            </button>
          ) : (
            <span className="text-taco-text">{t.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/** Invoice card (AC-7 / AC-34 / AC-39 shared row). */
function InvoiceCard({
  inv,
  unit,
}: {
  inv: { invoice_id: string; store_name: string; region_name: string; supplier_name: string; invoice_date: string; unit_price: number; quantity?: number | null; image_url: string | null; outlier_direction?: "above" | "below" | null };
  unit?: string;
}) {
  const up = inv.outlier_direction === "above";
  const down = inv.outlier_direction === "below";
  return (
    <div
      className={`rounded-xl p-3 ${up ? "border-2 border-taco-error/40 bg-[#FCEEEC]" : down ? "border-2 border-taco-success/40 bg-[#ECF7F2]" : "border border-taco-divider"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-taco-text">
          {inv.store_name} · {inv.region_name}
        </span>
        <span className={`text-[13px] font-semibold tabular-nums ${up ? "text-taco-error" : down ? "text-taco-success" : "text-taco-text"}`}>
          {rupiah(inv.unit_price)}
          {up ? " ▲" : down ? " ▼" : ""}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1 text-[11px] text-taco-sub">
        <span>
          Distributor: {inv.supplier_name}
          {inv.quantity != null && inv.quantity > 0 ? ` · qty ${idID.format(inv.quantity)}${unit ? ` ${unit}` : ""}` : ""}
        </span>
        <span className="tabular-nums">{fmtDate(inv.invoice_date)}</span>
      </div>
      {inv.image_url ? (
        <a href={inv.image_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-taco-accent font-medium mt-1.5 inline-flex items-center gap-1">
          📎 Lihat invoice ↗
        </a>
      ) : (
        <span className="text-[11px] text-taco-muted mt-1.5 inline-block">Tanpa lampiran gambar</span>
      )}
    </div>
  );
}

/** Recharts dot renderer — outliers as colored ▲/▼ markers (AC-26). */
function TrendDot(props: { cx?: number; cy?: number; index?: number; payload?: { dir?: "above" | "below" | null } }) {
  const { cx, cy, index, payload } = props;
  if (cx == null || cy == null) return <g key={index} />;
  const dir = payload?.dir;
  if (dir === "above" || dir === "below") {
    const color = dir === "above" ? "#D0342C" : "#1D9E75";
    return (
      <g key={index}>
        <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={2} />
        <text x={cx} y={dir === "above" ? cy - 8 : cy + 14} textAnchor="middle" fontSize={10} fill={color}>
          {dir === "above" ? "▲" : "▼"}
        </text>
      </g>
    );
  }
  return <circle key={index} cx={cx} cy={cy} r={3.5} fill="#1A1A1A" />;
}

// ════════════════════════════════════════════════════════════════════════════
// §3 · SKU detail modal — price+qty cards, dual-line chart, per-store (AC-7/25/26/27/35/36/37)
// ════════════════════════════════════════════════════════════════════════════

function QtyMissingChip({ present, lines, missingPct }: { present?: number; lines?: number; missingPct?: number }) {
  if (present == null || lines == null) return null;
  const pct = missingPct ?? (lines ? 1 - present / lines : 0);
  if (pct > 0.5) {
    return (
      <div className="mt-1 inline-flex items-center text-[10px] text-taco-warning bg-[#FCEFD9] border border-[#F3D9B5] rounded px-1.5 py-0.5 font-semibold">
        ⚠ qty hilang di {Math.round(pct * 100)}% baris — angka indikatif
      </div>
    );
  }
  return <div className="text-[10px] text-taco-success mt-0.5">qty terbaca dari {present} dari {lines} baris</div>;
}

function SkuDetailModal({
  open,
  skuId,
  skuName,
  pagePeriod,
  pageArea,
  onClose,
}: {
  open: boolean;
  skuId: string;
  skuName: string;
  pagePeriod: string;
  pageArea: string;
  onClose: () => void;
}) {
  const [modalPeriod, setModalPeriod] = useState(pagePeriod);
  const [hist, setHist] = useState<Async<SkuPriceHistoryV2>>(LOADING);
  const [stores, setStores] = useState<Async<SkuStorePricingV2>>(LOADING);
  const [priceMode, setPriceMode] = useState<"avg" | "total">("avg");
  const [selStore, setSelStore] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Reset to page period each time the modal (re)opens for a SKU (AC-25).
  useEffect(() => {
    if (open) {
      setModalPeriod(pagePeriod);
      setSelStore(null);
      setPriceMode("avg");
    }
  }, [open, skuId, pagePeriod]);

  useEffect(() => {
    if (!open || !skuId) return;
    let alive = true;
    setHist(LOADING);
    setStores(LOADING);
    fetchSkuPriceHistory(skuId, { period: modalPeriod, area: pageArea || undefined })
      .then((d) => alive && setHist({ loading: false, error: false, data: d }))
      .catch(() => alive && setHist({ loading: false, error: true, data: null }));
    fetchSkuStorePricing(skuId, { period: modalPeriod, area: pageArea || undefined })
      .then((d) => alive && setStores({ loading: false, error: false, data: d }))
      .catch(() => alive && setStores({ loading: false, error: true, data: null }));
    return () => {
      alive = false;
    };
  }, [open, skuId, modalPeriod, pageArea, reload]);

  if (!open) return null;

  const d = hist.data;
  const cov = d?.coverage ?? null;
  const thin = !!cov && cov.n_invoices < 3;
  const unit = d?.unit ?? "";
  const chartData = (d?.trend ?? []).map((t) => ({
    label: fmtDateShort(t.invoice_date),
    price: priceMode === "total" ? t.unit_price * (t.quantity ?? 1) : t.unit_price,
    qty: t.quantity ?? 0,
    dir: t.outlier_direction ?? null,
  }));
  const avgRef = priceMode === "avg" ? d?.p_avg ?? 0 : 0;

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-taco-divider flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-semibold text-taco-text">{d?.sku_name || skuName}</h3>
            {(d?.sku_code || d?.catalog_category) && (
              <div className="text-[11px] text-taco-muted tabular-nums mt-0.5">
                {[d?.sku_code, d?.catalog_category].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-taco-muted hover:text-taco-text text-[20px] leading-none" aria-label="Tutup">
            ✕
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <CoverageChip c={cov} error={hist.error} loading={hist.loading} />
          {/* In-modal PERIOD filter (AC-25 default page period; AC-27 re-fires). */}
          <select
            value={modalPeriod}
            onChange={(e) => setModalPeriod(e.target.value)}
            className="h-8 px-3 rounded-lg text-[12px] bg-white border border-taco-border text-taco-text ml-auto outline-none"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {hist.loading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
            <Skeleton className="h-[160px] rounded-xl" />
          </div>
        ) : hist.error ? (
          <div className="flex flex-col items-center justify-center text-center py-14">
            <div className="text-[24px] mb-2 text-taco-error">⚠️</div>
            <p className="text-[13px] text-taco-text font-medium">Gagal memuat detail SKU.</p>
            <button onClick={() => setReload((n) => n + 1)} className="mt-3 h-8 px-4 rounded-lg bg-white border border-taco-border text-[12px] text-taco-text hover:bg-taco-page">
              Coba lagi
            </button>
          </div>
        ) : thin || !d ? (
          <ThinData n={cov?.n_invoices ?? 0} />
        ) : (
          <>
            {/* price + qty cards (AC-26, AC-36) */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl border border-taco-divider p-3">
                <div className="text-[10px] text-taco-muted uppercase tracking-wide font-semibold mb-1.5">
                  Harga · {cov?.n_invoices ?? 0} invoice
                </div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div><div className="text-[10px] text-taco-muted">Min</div><div className="text-[13px] font-semibold text-taco-text tabular-nums">{compact(d.p_min)}</div></div>
                  <div><div className="text-[10px] text-taco-muted">Avg</div><div className="text-[13px] font-semibold text-taco-text tabular-nums">{compact(d.p_avg)}</div></div>
                  <div><div className="text-[10px] text-taco-muted">Maks</div><div className="text-[13px] font-semibold text-taco-error tabular-nums">{compact(d.p_max)}</div></div>
                </div>
                <div className="text-[11px] text-taco-sub mt-2 pt-2 border-t border-taco-divider">
                  {TOTAL_TAG}: <span className="tabular-nums font-medium text-taco-text">{compactRp(d.price_sum_sample ?? 0)}</span>
                </div>
              </div>
              <div className="rounded-xl border border-taco-divider p-3">
                <div className="text-[10px] text-taco-muted uppercase tracking-wide font-semibold mb-1.5">Qty · {unit || "—"}</div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div><div className="text-[10px] text-taco-muted">Min</div><div className="text-[13px] font-semibold text-taco-text tabular-nums">{idID.format(d.qty_min ?? 0)}</div></div>
                  <div><div className="text-[10px] text-taco-muted">Avg</div><div className="text-[13px] font-semibold text-taco-text tabular-nums">{idID.format(d.qty_avg ?? 0)}</div></div>
                  <div><div className="text-[10px] text-taco-muted">Maks</div><div className="text-[13px] font-semibold text-taco-text tabular-nums">{idID.format(d.qty_max ?? 0)}</div></div>
                </div>
                <div className="text-[11px] text-taco-sub mt-2 pt-2 border-t border-taco-divider">
                  {TOTAL_TAG}: <span className="tabular-nums font-medium text-taco-text">{idID.format(d.qty_sum_sample ?? 0)} {unit}</span>
                </div>
                <QtyMissingChip present={d.n_qty_present} lines={d.n_lines} missingPct={d.qty_missing_pct} />
              </div>
            </div>

            {/* dual-line chart (AC-26) */}
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-taco-muted uppercase tracking-wide font-semibold">Tren harga &amp; qty per invoice</div>
              <div className="flex items-center gap-1 text-[11px]">
                {(["avg", "total"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPriceMode(m)}
                    className={`px-2 h-6 rounded-md font-semibold ${priceMode === m ? "bg-taco-accent text-white" : "bg-white border border-taco-border text-taco-sub"}`}
                  >
                    {m === "avg" ? "Avg" : "Total"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ width: "100%", height: 190 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 12, right: 8, bottom: 4, left: 4 }}>
                  <CartesianGrid stroke="#F0F0F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#ADADAD" }} tickLine={false} axisLine={{ stroke: "#E5E5E5" }} />
                  <YAxis yAxisId="price" width={42} tick={{ fontSize: 9, fill: "#ADADAD" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => compact(v)} domain={["dataMin - 4000", "dataMax + 4000"]} />
                  <YAxis yAxisId="qty" orientation="right" width={28} tick={{ fontSize: 9, fill: "#3B7DD8" }} tickLine={false} axisLine={false} domain={[0, "dataMax + 4"]} />
                  <Tooltip labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: unknown, n: unknown) => (n === "qty" ? [`${idID.format(Number(v))} ${unit}`, "Qty"] : [rupiah(Number(v)), priceMode === "total" ? "Nilai" : "Harga"])} />
                  {avgRef > 0 && <ReferenceLine yAxisId="price" y={avgRef} stroke="#F04E23" strokeDasharray="3 3" strokeOpacity={0.5} />}
                  <Line yAxisId="price" type="linear" dataKey="price" stroke="#1A1A1A" strokeWidth={2} dot={<TrendDot />} isAnimationActive={false} />
                  <Line yAxisId="qty" type="linear" dataKey="qty" stroke="#3B7DD8" strokeWidth={1.8} strokeDasharray="5 3" dot={{ r: 3, fill: "#3B7DD8" }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-taco-muted mt-1 mb-4 flex-wrap">
              <span className="inline-flex items-center gap-1"><span className="w-3 border-t-2 border-taco-text" /> harga (kiri)</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 border-t-2 border-dashed border-taco-info" /> qty (kanan)</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-taco-error" /> outlier ▲</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 border-t border-dashed border-taco-accent" /> rata-rata harga</span>
            </div>

            {/* per-store pricing block (AC-37) */}
            <div className="text-[10px] text-taco-muted uppercase tracking-wide font-semibold mb-2">Harga per toko</div>
            {stores.loading ? (
              <Skeleton className="h-24 rounded-xl mb-2" />
            ) : stores.error || !stores.data || stores.data.stores.length === 0 ? (
              <div className="text-[12px] text-taco-muted py-3">Belum ada data per toko pada filter ini.</div>
            ) : (
              <StoreTable rows={stores.data.stores} selStore={selStore} onSelect={(id) => setSelStore((s) => (s === id ? null : id))} />
            )}

            {/* invoice list (AC-7) */}
            <div className="text-[10px] text-taco-muted uppercase tracking-wide font-semibold mt-4 mb-2">Invoice penyumbang · urut tanggal terbaru</div>
            <div className="space-y-2">
              {d.invoices.map((inv) => (
                <InvoiceCard key={inv.invoice_id} inv={inv} unit={unit} />
              ))}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function StoreTable({ rows, selStore, onSelect }: { rows: StorePricingRow[]; selStore: string | null; onSelect: (id: string) => void }) {
  const sel = rows.find((r) => r.store_id === selStore);
  return (
    <>
      <div className="overflow-x-auto mb-2">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] text-taco-muted uppercase tracking-wide text-left border-b border-taco-divider">
              <th className="py-1.5 font-semibold">Toko / Wilayah</th>
              <th className="py-1.5 font-semibold text-right">N inv</th>
              <th className="py-1.5 font-semibold text-right">Min</th>
              <th className="py-1.5 font-semibold text-right">Avg</th>
              <th className="py-1.5 font-semibold text-right">Maks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.store_id}
                onClick={() => onSelect(r.store_id)}
                className={`border-b border-taco-divider cursor-pointer ${r.store_id === selStore ? "bg-taco-accent-tint/60" : "hover:bg-taco-page"}`}
              >
                <td className="py-2"><div className="font-medium text-taco-text">{r.store_name}</div><div className="text-[10px] text-taco-sub">{r.region_name}</div></td>
                <td className="py-2 text-right tabular-nums text-taco-sub">{r.n_invoices}</td>
                <td className="py-2 text-right tabular-nums">{compact(r.p_min)}</td>
                <td className="py-2 text-right tabular-nums">{compact(r.p_avg)}</td>
                <td className="py-2 text-right tabular-nums">{compact(r.p_max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && sel.history.length > 0 && (
        <div className="rounded-xl border border-taco-accent/40 bg-taco-accent-tint/30 p-3">
          <div className="text-[10px] text-taco-accent uppercase tracking-wide font-semibold mb-1">
            Riwayat harga · {sel.store_name} ({sel.region_name})
          </div>
          <div style={{ width: "100%", height: 110 }}>
            <ResponsiveContainer>
              <LineChart data={sel.history.map((h) => ({ label: fmtDateShort(h.invoice_date), price: h.unit_price }))} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="#F0F0F0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: "#ADADAD" }} tickLine={false} axisLine={{ stroke: "#E5E5E5" }} />
                <YAxis width={38} tick={{ fontSize: 8, fill: "#ADADAD" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => compact(v)} domain={["dataMin - 4000", "dataMax + 4000"]} />
                <Tooltip formatter={(v: unknown) => [rupiah(Number(v)), "Harga"]} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Line type="linear" dataKey="price" stroke="#F04E23" strokeWidth={2} dot={{ r: 3, fill: "#F04E23" }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// §2 · Category drill modal (AC-34 / AC-19) — category → SKU → invoice list
// ════════════════════════════════════════════════════════════════════════════

function CategoryDrillModal({
  open,
  category,
  scope,
  onClose,
}: {
  open: boolean;
  category: string;
  scope: MarketScope;
  onClose: () => void;
}) {
  const [skus, setSkus] = useState<Async<CategorySkusV2>>(LOADING);
  const [sub, setSub] = useState("");
  const [sel, setSel] = useState<{ id: string; name: string } | null>(null);
  const [inv, setInv] = useState<Async<SkuPriceHistoryV2>>(LOADING);

  useEffect(() => {
    if (open) {
      setSel(null);
      setSub("");
    }
  }, [open, category]);

  useEffect(() => {
    if (!open || !category) return;
    let alive = true;
    setSkus(LOADING);
    fetchCategorySkus(category, scope)
      .then((d) => alive && setSkus({ loading: false, error: false, data: d }))
      .catch(() => alive && setSkus({ loading: false, error: true, data: null }));
    return () => {
      alive = false;
    };
  }, [open, category, scope]);

  useEffect(() => {
    if (!sel) return;
    let alive = true;
    setInv(LOADING);
    fetchSkuPriceHistory(sel.id, { period: scope.period, area: scope.area })
      .then((d) => alive && setInv({ loading: false, error: false, data: d }))
      .catch(() => alive && setInv({ loading: false, error: true, data: null }));
    return () => {
      alive = false;
    };
  }, [sel, scope]);

  if (!open) return null;
  const data = skus.data;
  const list = (data?.skus ?? []).filter((s) => !sub || s.sub_category === sub);
  const subCats = data?.sub_categories ?? [];

  return (
    <ModalShell onClose={onClose} maxW="max-w-xl">
      <div className="px-5 py-4 border-b border-taco-divider flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Breadcrumb trail={sel ? [{ label: category, onClick: () => setSel(null) }, { label: sel.name }] : [{ label: category }]} />
            <h3 className="text-[16px] font-semibold text-taco-text mt-0.5">{sel ? "Invoice memuat SKU ini" : `SKU TACO di kategori ${category}`}</h3>
          </div>
          <button onClick={onClose} className="text-taco-muted hover:text-taco-text text-[20px] leading-none" aria-label="Tutup">✕</button>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <CoverageChip c={(sel ? inv.data?.coverage : data?.coverage) ?? null} loading={sel ? inv.loading : skus.loading} error={sel ? inv.error : skus.error} />
          {!sel && subCats.length > 0 && (
            <select value={sub} onChange={(e) => setSub(e.target.value)} className="h-7 px-2 rounded-lg text-[11px] bg-white border border-taco-border text-taco-text ml-auto outline-none">
              <option value="">Semua sub-kategori</option>
              {subCats.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {sel ? (
          inv.loading ? (
            <div className="space-y-2 p-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div>
          ) : inv.error ? (
            <PanelError onRetry={() => setSel({ ...sel })} />
          ) : !inv.data || inv.data.invoices.length === 0 ? (
            <div className="text-center text-[13px] text-taco-muted py-10">Tidak ada invoice pada filter ini.</div>
          ) : (
            <div className="space-y-2 p-1">
              {inv.data.invoices.map((e) => (
                <InvoiceCard key={e.invoice_id} inv={e} unit={inv.data?.unit} />
              ))}
            </div>
          )
        ) : skus.loading ? (
          <div className="space-y-2 p-2"><Skeleton className="h-10 rounded-lg" /><Skeleton className="h-10 rounded-lg" /><Skeleton className="h-10 rounded-lg" /></div>
        ) : skus.error ? (
          <PanelError onRetry={() => setSkus(LOADING)} />
        ) : list.length === 0 ? (
          <div className="text-center text-[13px] text-taco-muted py-10">Tidak ada SKU pada filter ini.</div>
        ) : (
          <div className="divide-y divide-taco-divider">
            {list.map((s) => (
              <div key={s.sku_id} onClick={() => setSel({ id: s.sku_id, name: s.sku_name })} className="flex items-center justify-between gap-2 px-2 py-2.5 cursor-pointer hover:bg-taco-page rounded-lg">
                <div>
                  <div className="text-[13px] font-medium text-taco-text">{s.sku_name}</div>
                  <div className="text-[10px] text-taco-muted">{[s.sub_category, s.sku_code].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex items-center gap-2"><span className="text-[11px] text-taco-sub tabular-nums">{s.n_invoices} invoice</span><span className="text-taco-muted">→</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// §4 · Brand-bucket drill modal (AC-39/40/41/19) — bucket → brand → SKU → invoice
// ════════════════════════════════════════════════════════════════════════════

function BrandBucketDrillModal({
  open,
  bucket,
  scope,
  onClose,
}: {
  open: boolean;
  bucket: BrandBucket | null;
  scope: MarketScope;
  onClose: () => void;
}) {
  // level: brands → skus → invoices. TACO/lain_lain skip the brand level.
  const [brand, setBrand] = useState<{ id: string; name: string } | null>(null);
  const [sku, setSku] = useState<{ label: string; id: string | null } | null>(null);
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Async<BrandBucketDetailV2>>(LOADING);

  useEffect(() => {
    if (open) {
      setBrand(null);
      setSku(null);
      setQ("");
      setQDeb("");
      setPage(1);
    }
  }, [open, bucket]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDeb(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open || !bucket) return;
    let alive = true;
    setData(LOADING);
    fetchBrandBucketDetail(bucket, scope, {
      brand: brand?.id,
      sku: sku?.label,
      q: qDeb || undefined,
      page,
    })
      .then((d) => alive && setData({ loading: false, error: false, data: d }))
      .catch(() => alive && setData({ loading: false, error: true, data: null }));
    return () => {
      alive = false;
    };
  }, [open, bucket, scope, brand, sku, qDeb, page]);

  if (!open || !bucket) return null;
  const meta = BUCKET_META[bucket];
  const d = data.data;
  const unknown = d?.unknown_competitor_count ?? 0;
  const level: "brands" | "skus" | "invoices" = sku ? "invoices" : brand || bucket !== "kompetitor" ? "skus" : "brands";
  // TACO/lain_lain buckets open straight at the SKU level (no brand list).
  const showSearch = level !== "invoices";

  const trail: { label: string; onClick?: () => void }[] = [{ label: meta.label, onClick: brand || sku ? () => { setBrand(null); setSku(null); } : undefined }];
  if (brand) trail.push({ label: brand.name, onClick: sku ? () => setSku(null) : undefined });
  if (sku) trail.push({ label: sku.label });

  return (
    <ModalShell onClose={onClose} maxW="max-w-xl">
      <div className="px-5 py-4 border-b border-taco-divider flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: meta.color }} />
              <Breadcrumb trail={trail} />
            </div>
            <h3 className="text-[16px] font-semibold text-taco-text mt-0.5">
              {level === "brands" ? "Merek kompetitor" : level === "skus" ? (brand ? `SKU ${brand.name} tercatat` : `SKU di ember ${meta.label}`) : "Invoice memuat SKU ini"}
            </h3>
          </div>
          <button onClick={onClose} className="text-taco-muted hover:text-taco-text text-[20px] leading-none" aria-label="Tutup">✕</button>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <CoverageChip c={d?.coverage ?? null} loading={data.loading} error={data.error} />
          {showSearch && <div className="ml-auto"><SearchInput q={q} onQ={setQ} placeholder="Cari merek / SKU…" width="w-[150px]" /></div>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {data.loading ? (
          <div className="space-y-2 p-2"><Skeleton className="h-10 rounded-lg" /><Skeleton className="h-10 rounded-lg" /><Skeleton className="h-10 rounded-lg" /></div>
        ) : data.error ? (
          <PanelError onRetry={() => setPage((p) => p)} />
        ) : level === "brands" ? (
          (d?.brands ?? []).length === 0 ? (
            <div className="text-center text-[13px] text-taco-muted py-10">Tidak ada merek pada filter ini.</div>
          ) : (
            <div className="divide-y divide-taco-divider">
              {d!.brands!.map((b) => (
                <div key={b.brand_id ?? b.brand_name} onClick={() => setBrand({ id: b.brand_id ?? b.brand_name, name: b.brand_name })} className="flex items-center justify-between gap-2 px-2 py-2.5 cursor-pointer hover:bg-taco-page rounded-lg">
                  <div className="text-[13px] font-medium text-taco-text">🚩 {b.brand_name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-taco-sub tabular-nums"><span>{b.n_lines} baris · {b.n_invoices} invoice</span><span className="text-taco-muted">→</span></div>
                </div>
              ))}
            </div>
          )
        ) : level === "skus" ? (
          (d?.skus ?? []).length === 0 ? (
            <div className="text-center text-[13px] text-taco-muted py-10">Tidak ada SKU pada filter ini.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] text-taco-muted uppercase tracking-wide text-left border-b border-taco-divider">
                  <th className="py-1.5 px-1 font-semibold">SKU</th>
                  <th className="py-1.5 font-semibold text-right">N inv</th>
                  <th className="py-1.5 font-semibold text-right">Min·Avg·Maks</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {d!.skus!.map((s, i) => (
                  <tr key={`${s.sku_label}-${i}`} onClick={() => setSku({ label: s.sku_label, id: s.sku_id ?? null })} className="border-b border-taco-divider cursor-pointer hover:bg-taco-page">
                    <td className="py-2 px-1"><div className="font-medium text-taco-text">{s.sku_label}</div></td>
                    <td className="py-2 text-right tabular-nums text-taco-sub">{s.n_invoices}</td>
                    <td className="py-2 text-right tabular-nums">{compact(s.p_min)} · {compact(s.p_avg)} · {compact(s.p_max)}</td>
                    <td className="py-2 text-right text-taco-muted pl-1">→</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (d?.invoices ?? []).length === 0 ? (
          <div className="text-center text-[13px] text-taco-muted py-10">Tidak ada invoice pada filter ini.</div>
        ) : (
          <div className="space-y-2 p-1">
            {d!.invoices!.map((e) => (
              <InvoiceCard key={e.invoice_id} inv={e} />
            ))}
          </div>
        )}
      </div>
      <div className="px-4 py-2 border-t border-taco-divider flex items-center justify-between text-[11px] text-taco-sub gap-2">
        <span className="italic text-taco-muted">
          {bucket === "lain_lain" && unknown > 0
            ? `+ ${unknown} observasi kompetitor tak dikenali — tidak masuk ember Lain-lain.`
            : "TACO bucket = satu baris merek TACO · Lain-lain → AC-41"}
        </span>
        {showSearch && <Pager pagination={d?.pagination} page={page} onPage={setPage} />}
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main page
// ════════════════════════════════════════════════════════════════════════════

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("30d");
  const [area, setArea] = useState("");
  const [areaOptions, setAreaOptions] = useState<{ id: string; name: string }[]>([]);
  const [totalRegions, setTotalRegions] = useState<number | null>(null);

  // Scope-driven panels
  const [cov, setCov] = useState<Async<CoverageV2>>(LOADING);
  const [top, setTop] = useState<Async<TopSkusPerAreaV2>>(LOADING);
  const [nonTacoInv, setNonTacoInv] = useState<Async<TopNonTacoInvoicesV2>>(LOADING);
  const [catDist, setCatDist] = useState<Async<CategoryDistributionV2>>(LOADING);
  const [catTrend, setCatTrend] = useState<Async<CategoryMonthlyTrendV2>>(LOADING);
  const [brandDist, setBrandDist] = useState<Async<BrandBucketDistributionV2>>(LOADING);

  // §1 card 3 + card 4 local per-area filters (default Semua wilayah)
  const [card3Area, setCard3Area] = useState(""); // region_id within returned data; "" = Semua
  const [card4Area, setCard4Area] = useState(""); // region_id; "" = inherit page scope

  // §3 Laporan SKU
  const [bands, setBands] = useState<Async<PriceBandsV2>>(LOADING);
  const [bandsQ, setBandsQ] = useState("");
  const [bandsQDeb, setBandsQDeb] = useState("");
  const [bandsPage, setBandsPage] = useState(1);
  const [bandsSort, setBandsSort] = useState<"n" | "qty" | "price">("n");
  const [bandsReload, setBandsReload] = useState(0);

  // §3 detail modal
  const [skuModal, setSkuModal] = useState<{ open: boolean; skuId: string; skuName: string }>({ open: false, skuId: "", skuName: "" });
  // §2 category drill modal
  const [catModal, setCatModal] = useState<{ open: boolean; category: string }>({ open: false, category: "" });
  // §4 brand bucket drill modal
  const [bucketModal, setBucketModal] = useState<{ open: boolean; bucket: BrandBucket | null }>({ open: false, bucket: null });

  // AI modal
  const [insight, setInsight] = useState<AiInsightV2 | null>(null);
  const [insightOpen, setInsightOpen] = useState(false);
  const [insightGenerating, setInsightGenerating] = useState(false);

  const scope: MarketScope = useMemo(() => ({ period, area: area || undefined }), [period, area]);

  // Area dropdown — authoritative regions (type=area). Also gives Y for X/Y card.
  useEffect(() => {
    let cancelled = false;
    getRegionsV2({ type: "area" })
      .then((res) => {
        if (cancelled) return;
        const rows = unwrapList<RegionBU>(res.data);
        setAreaOptions(rows.map((r) => ({ id: r.id, name: r.name })));
        setTotalRegions(rows.length);
      })
      .catch(() => {
        if (!cancelled) {
          setAreaOptions([]);
          setTotalRegions(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Scope-driven panels — AC-12 atomic reflow ──────────────────────────────
  const loadScope = useCallback(() => {
    setCov(LOADING);
    setTop(LOADING);
    setCatDist(LOADING);
    setCatTrend(LOADING);
    setBrandDist(LOADING);
    fetchCoverage(scope).then((d) => setCov({ loading: false, error: false, data: d })).catch(() => setCov({ loading: false, error: true, data: null }));
    fetchTopSkusPerArea(scope).then((d) => setTop({ loading: false, error: false, data: d })).catch(() => setTop({ loading: false, error: true, data: null }));
    fetchCategoryDistribution(scope).then((d) => setCatDist({ loading: false, error: false, data: d })).catch(() => setCatDist({ loading: false, error: true, data: null }));
    fetchCategoryMonthlyTrend(scope).then((d) => setCatTrend({ loading: false, error: false, data: d })).catch(() => setCatTrend({ loading: false, error: true, data: null }));
    fetchBrandBucketDistribution(scope).then((d) => setBrandDist({ loading: false, error: false, data: d })).catch(() => setBrandDist({ loading: false, error: true, data: null }));
  }, [scope]);
  useEffect(() => {
    loadScope();
    setCard3Area("");
    setCard4Area("");
  }, [loadScope]);

  // card 4 — Top-10 invoices most dominated by non-TACO value (AC-31).
  // Local per-area dropdown narrows further; "" inherits the page scope.
  useEffect(() => {
    let alive = true;
    setNonTacoInv(LOADING);
    fetchTopNonTacoInvoices({ period, area: card4Area || area || undefined })
      .then((d) => alive && setNonTacoInv({ loading: false, error: false, data: d }))
      .catch(() => alive && setNonTacoInv({ loading: false, error: true, data: null }));
    return () => { alive = false; };
  }, [period, area, card4Area]);

  // §3 reset page on scope change
  useEffect(() => {
    setBandsPage(1);
  }, [period, area]);

  useEffect(() => {
    const t = setTimeout(() => {
      setBandsQDeb(bandsQ);
      setBandsPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [bandsQ]);

  useEffect(() => {
    let alive = true;
    setBands(LOADING);
    fetchPriceBands(scope, bandsQDeb, bandsPage, bandsSort)
      .then((d) => alive && setBands({ loading: false, error: false, data: d }))
      .catch(() => alive && setBands({ loading: false, error: true, data: null }));
    return () => { alive = false; };
  }, [scope, bandsQDeb, bandsPage, bandsSort, bandsReload]);

  // AI: load latest SAVED insight on scope change (no LLM call). AC-13.
  const fetchSavedInsight = useCallback(async () => {
    try {
      const res = await getDashboardLatestInsight({ period, area: area || undefined });
      setInsight(adaptLatestInsight(res.data));
    } catch {
      setInsight(null);
    }
  }, [period, area]);
  useEffect(() => {
    fetchSavedInsight();
  }, [fetchSavedInsight]);

  const generateInsight = useCallback(async () => {
    setInsightGenerating(true);
    try {
      const res = await getDashboardAiInsight({ period });
      setInsight(adaptAiInsight(res.data));
    } catch {
      /* keep prior insight; modal stays open */
    } finally {
      setInsightGenerating(false);
    }
  }, [period]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const scopeCov = cov.data;
  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? period;
  const areaName = areaOptions.find((a) => a.id === area)?.name;
  const insightSubtitle = `Periode ${periodLabel} · ${areaName ?? "Semua wilayah"}`;

  const panelCov = (d: { coverage?: CoverageV2 } | null): CoverageV2 | null => d?.coverage ?? scopeCov;
  const isThin = (c: CoverageV2 | null): boolean => !!c && c.n_invoices < 3;

  // §1 card 3 — combined or per-region top-10 (AC-30 / AC-19).
  const card3Skus = useMemo(() => {
    const regions = top.data?.regions ?? [];
    if (card3Area) {
      const r = regions.find((x) => (x.region_id ?? x.region_name) === card3Area);
      return (r?.skus ?? []).slice(0, 10);
    }
    const agg = new Map<string, { sku_id: string; sku_name: string; occurrence_count: number }>();
    for (const r of regions) {
      for (const s of r.skus) {
        const cur = agg.get(s.sku_id);
        if (cur) cur.occurrence_count += s.occurrence_count;
        else agg.set(s.sku_id, { sku_id: s.sku_id, sku_name: s.sku_name, occurrence_count: s.occurrence_count });
      }
    }
    return Array.from(agg.values()).sort((a, b) => b.occurrence_count - a.occurrence_count).slice(0, 10);
  }, [top.data, card3Area]);

  // §3 client-side sort of displayed rows (mock-safe; live also sorts server-side).
  const bandRows = useMemo(() => {
    const rows = [...(bands.data?.skus ?? [])];
    if (bandsSort === "price") rows.sort((a, b) => (b.p_avg ?? b.p_median) - (a.p_avg ?? a.p_median));
    else if (bandsSort === "qty") rows.sort((a, b) => (b.qty_avg ?? 0) - (a.qty_avg ?? 0));
    else rows.sort((a, b) => b.n_invoices - a.n_invoices);
    return rows;
  }, [bands.data, bandsSort]);

  // §2 + §4 donut slices
  const catSlices = (catDist.data?.categories ?? []).map((c) => ({ label: c.category, value: c.n_lines, color: CAT_COLORS[c.category] ?? "#ADADAD" }));
  const brandSlices = (brandDist.data?.buckets ?? []).map((b) => ({ label: BUCKET_META[b.bucket].label, value: b.n_lines, color: BUCKET_META[b.bucket].color }));
  const brandTotal = (brandDist.data?.buckets ?? []).reduce((a, b) => a + b.n_lines, 0);

  // §2 trend → recharts pivot
  const trendData = useMemo(() => {
    const t = catTrend.data;
    if (!t) return [];
    return t.months.map((m) => {
      const row: Record<string, string | number> = { month: m };
      for (const c of t.categories) {
        const cell = t.rows.find((r) => r.month === m && r.category === c);
        row[c] = cell?.invoice_count ?? 0;
      }
      return row;
    });
  }, [catTrend.data]);

  return (
    <>
      <div className="space-y-3">
        {/* ── Header + AI trigger ───────────────────────────────────────── */}
        <V2PageHeader
          title="Intelijen Pasar"
          actions={
            <button onClick={() => setInsightOpen(true)} className="h-[34px] px-3.5 inline-flex items-center gap-1.5 bg-taco-accent text-white rounded-lg text-[12px] font-semibold hover:bg-taco-accent-dark transition-colors">
              <SparkleIcon size={13} />
              Ringkasan AI
            </button>
          }
        />

        {/* ── ① TRUTH BANNER (AC-1) ───────────────────────────────────── */}
        <TruthBanner cov={scopeCov} loading={cov.loading} error={cov.error} onRetry={loadScope} />

        {/* ── ② FILTER BAR (AC-12) — sticky ─────────────────────────────── */}
        <div className="sticky top-0 z-20 -mx-6 px-6 py-2 bg-taco-page/95 backdrop-blur-sm border-b border-taco-divider flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {PERIODS.map((p) => (
              <button key={p.value} onClick={() => setPeriod(p.value)} className={`h-8 px-3 rounded-full text-[12px] font-semibold transition-colors ${period === p.value ? "bg-taco-accent text-white" : "bg-white border border-taco-border text-taco-sub hover:text-taco-text"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <select value={area} onChange={(e) => setArea(e.target.value)} className="h-8 px-3 rounded-lg text-[12px] bg-white border border-taco-border text-taco-text outline-none">
              <option value="">Semua wilayah</option>
              {areaOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Card 1 — Total Invoice Terunggah (AC-29) */}
          <div className="bg-taco-card border border-taco-border rounded-2xl p-4 flex flex-col">
            <div className="text-[13px] font-semibold text-taco-text">Total Invoice Terunggah</div>
            <div className="text-[10px] text-taco-sub mt-0.5 leading-snug">{SUB_FREQ}</div>
            {cov.loading ? (
              <Skeleton className="h-9 w-16 mt-3" />
            ) : (
              <div className="text-[34px] font-bold text-taco-text tabular-nums leading-none mt-3">{cov.error ? "—" : scopeCov?.n_invoices ?? 0}</div>
            )}
            <div className="mt-auto pt-3"><CoverageChip c={scopeCov} error={cov.error} loading={cov.loading} /></div>
          </div>

          {/* Card 2 — Wilayah Tercakup X/Y (AC-29) */}
          <div className="bg-taco-card border border-taco-border rounded-2xl p-4 flex flex-col">
            <div className="text-[13px] font-semibold text-taco-text">Wilayah Tercakup</div>
            <div className="text-[10px] text-taco-sub mt-0.5 leading-snug">{SUB_FREQ}</div>
            {cov.loading ? (
              <Skeleton className="h-9 w-20 mt-3" />
            ) : (
              <div className="text-[34px] font-bold text-taco-text tabular-nums leading-none mt-3">
                {cov.error ? "—" : scopeCov?.k_areas ?? 0} <span className="text-[18px] text-taco-muted font-semibold">/ {totalRegions ?? "—"}</span>
              </div>
            )}
            <div className="text-[11px] text-taco-sub mt-1">wilayah aktif tersampel</div>
          </div>

          {/* Card 3 — Top 10 TACO (AC-30 / AC-19) */}
          <div className="bg-taco-card border border-taco-border rounded-2xl p-4 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-taco-text">Top 10 paling sering muncul</div>
                <div className="text-[10px] text-taco-sub mt-0.5 leading-snug max-w-[180px]">{SUB_FREQ}</div>
              </div>
              <span className="text-[10px] text-taco-accent bg-taco-accent-tint rounded px-1.5 py-0.5 font-semibold flex-shrink-0">TACO</span>
            </div>
            <select value={card3Area} onChange={(e) => setCard3Area(e.target.value)} className="h-7 mt-2 px-2 rounded-lg text-[11px] bg-white border border-taco-border text-taco-text w-full outline-none">
              <option value="">Semua wilayah</option>
              {(top.data?.regions ?? []).map((r) => (
                <option key={r.region_id ?? r.region_name} value={r.region_id ?? r.region_name}>{r.region_name}</option>
              ))}
            </select>
            {top.loading ? (
              <div className="space-y-1.5 mt-2.5"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></div>
            ) : top.error ? (
              <div className="text-[12px] text-taco-muted py-4">Gagal memuat.</div>
            ) : card3Skus.length === 0 ? (
              <div className="text-[12px] text-taco-muted py-4">Belum ada SKU TACO pada filter ini.</div>
            ) : (
              <ol className="mt-2.5 space-y-1.5 text-[12px] max-h-[160px] overflow-y-auto">
                {card3Skus.map((s, i) => (
                  <li key={s.sku_id} className="flex items-center gap-2">
                    <span className="text-taco-muted tabular-nums w-3.5">{i + 1}</span>
                    <span className="text-taco-text truncate flex-1">{s.sku_name}</span>
                    <span className="text-taco-muted tabular-nums text-[11px]">{s.occurrence_count}×</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-auto pt-2 text-[10px] text-taco-muted">Top 10 · gulir untuk selengkapnya</div>
          </div>

          {/* Card 4 — Top 10 invoices most dominated by non-TACO value (AC-31, revised) */}
          <div className="bg-taco-card border border-taco-border rounded-2xl p-4 flex flex-col">
            <div className="text-[13px] font-semibold text-taco-text leading-snug">Top 10 invoice paling dikuasai non-TACO (per nilai)</div>
            <div className="text-[10px] text-taco-sub mt-0.5 leading-snug">{SUB_NONTACO_INV}</div>
            <select value={card4Area} onChange={(e) => setCard4Area(e.target.value)} className="h-7 mt-2 px-2 rounded-lg text-[11px] bg-white border border-taco-border text-taco-text w-full outline-none">
              <option value="">Semua wilayah</option>
              {areaOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {nonTacoInv.loading ? (
              <div className="space-y-1.5 mt-2.5"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-5/6" /><Skeleton className="h-8 w-2/3" /></div>
            ) : nonTacoInv.error ? (
              <div className="text-[12px] text-taco-muted py-4">Gagal memuat.</div>
            ) : (nonTacoInv.data?.rows ?? []).length === 0 ? (
              <div className="text-[12px] text-taco-muted py-4">Belum ada invoice pada filter ini.</div>
            ) : (
              <ol className="mt-2.5 space-y-2 text-[12px] max-h-[200px] overflow-y-auto pr-1">
                {nonTacoInv.data!.rows.slice(0, 10).map((r) => {
                  const tacoPct = Math.round(r.taco_share * 100);
                  const nonPct = Math.round(r.non_taco_share * 100);
                  return (
                    <li key={r.invoice_id}>
                      <a href={`/taro/v2/invoices/${r.invoice_id}`} className="block rounded-lg border border-taco-divider hover:border-taco-accent px-2 py-1.5 cursor-pointer">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-taco-text font-medium truncate">{r.store_name} <span className="text-taco-sub font-normal">· {r.region_name}</span></span>
                          <span className="text-taco-muted tabular-nums text-[10px] flex-shrink-0">{fmtDate(r.invoice_date)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-taco-divider flex">
                            <div className="h-full bg-taco-accent" style={{ width: `${tacoPct}%` }} />
                            <div className="h-full bg-taco-text" style={{ width: `${nonPct}%` }} />
                          </div>
                          <span className="text-[10px] text-taco-sub tabular-nums whitespace-nowrap">TACO {tacoPct}% · non-TACO {nonPct}%</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 text-[10px]">
                          <span className="text-taco-muted tabular-nums">{compactRp(r.total_value)}</span>
                          {(r.qty_missing_lines ?? 0) > 0 && (
                            <span className="text-taco-warning">⚠ {r.qty_missing_lines} baris tanpa qty</span>
                          )}
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="mt-auto pt-2 text-[10px] text-taco-muted">Klik baris → detail invoice (per-baris + ember)</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Komposisi kategori TACO (AC-32) */}
          <Panel title="Komposisi kategori TACO" sub={SUB_CAT_PIE} coverage={panelCov(catDist.data)} coverageError={catDist.error} coverageLoading={catDist.loading}>
            {catDist.loading ? (
              <div className="flex items-center gap-5"><Skeleton className="w-[132px] h-[132px] rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></div></div>
            ) : catDist.error ? (
              <PanelError onRetry={loadScope} />
            ) : isThin(panelCov(catDist.data)) ? (
              <ThinData n={panelCov(catDist.data)?.n_invoices ?? 0} />
            ) : catSlices.length === 0 ? (
              <div className="text-center text-[13px] text-taco-muted py-10">Belum ada baris TACO terkategori pada filter ini.</div>
            ) : (
              <>
                <div className="flex items-center gap-5 mt-1">
                  <Donut slices={catSlices} onSlice={(label) => setCatModal({ open: true, category: label })} />
                  <div className="flex-1 space-y-1.5 text-[12px]">
                    {catDist.data!.categories.map((c) => (
                      <div key={c.category} onClick={() => setCatModal({ open: true, category: c.category })} className="flex items-center gap-2 cursor-pointer hover:bg-taco-page rounded px-1.5 py-1 -mx-1.5">
                        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: CAT_COLORS[c.category] ?? "#ADADAD" }} />
                        <span className="text-taco-text flex-1">{c.category}</span>
                        <span className="text-taco-sub tabular-nums">{c.n_lines} <span className="text-taco-muted">· {Math.round(c.pct * 100)}%</span></span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-taco-muted mt-3">Klik slice / baris legenda → daftar SKU di kategori itu. % dari baris TACO (bukan dari semua baris).</p>
              </>
            )}
          </Panel>

          {/* Tren unggahan kategori (AC-33) */}
          <Panel title="Tren unggahan kategori" sub={SUB_CAT_LINE} coverage={panelCov(catTrend.data)} coverageError={catTrend.error} coverageLoading={catTrend.loading}>
            {catTrend.loading ? (
              <Skeleton className="h-[150px] w-full rounded-xl" />
            ) : catTrend.error ? (
              <PanelError onRetry={loadScope} />
            ) : isThin(panelCov(catTrend.data)) ? (
              <ThinData n={panelCov(catTrend.data)?.n_invoices ?? 0} />
            ) : trendData.length === 0 ? (
              <div className="text-center text-[13px] text-taco-muted py-10">Belum ada tren pada filter ini.</div>
            ) : (
              <>
                <div style={{ width: "100%", height: 160 }}>
                  <ResponsiveContainer>
                    <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                      <CartesianGrid stroke="#F0F0F0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#ADADAD" }} tickLine={false} axisLine={{ stroke: "#E5E5E5" }} />
                      <YAxis width={28} tick={{ fontSize: 9, fill: "#ADADAD" }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      {(catTrend.data!.categories).map((c, i) => (
                        <Line key={c} type="linear" dataKey={c} stroke={CAT_LINE_COLORS[i % CAT_LINE_COLORS.length]} strokeWidth={c === "Laminates" ? 2 : 1.5} dot={false} isAnimationActive={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[10px] text-taco-muted mt-1">
                  {catTrend.data!.categories.map((c, i) => (
                    <span key={c} className="inline-flex items-center gap-1"><span className="w-3 border-t-2" style={{ borderColor: CAT_LINE_COLORS[i % CAT_LINE_COLORS.length] }} /> {c}</span>
                  ))}
                </div>
                <p className="text-[10px] text-taco-muted mt-2 leading-snug">Garis naik = lebih banyak invoice diunggah, bukan pasar tumbuh.</p>
              </>
            )}
          </Panel>
        </div>

        <Panel title="Laporan SKU" sub={SUB_LAPORAN} coverage={panelCov(bands.data)} coverageError={bands.error} coverageLoading={bands.loading}>
          <div className="flex items-center justify-between gap-3 my-3 flex-wrap">
            <SearchInput q={bandsQ} onQ={setBandsQ} placeholder="Cari SKU / kode…" />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-taco-muted">Urutkan:</span>
                {([["qty", "qty tercatat"], ["price", "harga tercatat"]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setBandsSort((s) => (s === v ? "n" : v))} className={`px-2 h-7 rounded-md font-semibold ${bandsSort === v ? "bg-taco-accent text-white" : "bg-white border border-taco-border text-taco-sub"}`}>
                    {l}
                  </button>
                ))}
              </div>
              <Pager pagination={bands.data?.pagination} page={bandsPage} onPage={setBandsPage} />
            </div>
          </div>
          {bands.loading ? (
            <div className="space-y-3 mt-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : bands.error ? (
            <PanelError onRetry={() => setBandsReload((n) => n + 1)} />
          ) : isThin(panelCov(bands.data)) ? (
            <ThinData n={panelCov(bands.data)?.n_invoices ?? 0} />
          ) : bandRows.length === 0 ? (
            bandsQDeb ? (
              <div className="px-5 py-10 text-center text-[13px] text-taco-muted">Tidak ada SKU yang cocok dengan “{bandsQDeb}”.</div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-10"><div className="text-[24px] mb-2 opacity-60">🔎</div><p className="text-[13px] text-taco-text font-medium">Belum ada SKU dengan ≥3 invoice pada filter ini.</p></div>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] min-w-[760px]">
                <thead>
                  <tr className="text-[10px] text-taco-muted uppercase tracking-wide text-left border-b border-taco-divider">
                    <th className="py-2 font-semibold">SKU</th>
                    <th className="py-2 font-semibold text-right">N inv</th>
                    <th className="py-2 font-semibold">Qty (min · avg · maks · Total*)</th>
                    <th className="py-2 font-semibold">Harga (min · avg · maks · Total*)</th>
                    <th className="py-2 font-semibold text-right">⚑</th>
                  </tr>
                </thead>
                <tbody className="text-taco-text">
                  {bandRows.map((row) => (
                    <LaporanRow key={row.sku_id} row={row} q={bandsQDeb} onOpen={() => setSkuModal({ open: true, skuId: row.sku_id, skuName: row.sku_name })} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Komposisi merek di invoice terunggah" sub={SUB_MEREK} coverage={panelCov(brandDist.data)} coverageError={brandDist.error} coverageLoading={brandDist.loading}>
          {brandDist.loading ? (
            <div className="flex items-center gap-8"><Skeleton className="w-[140px] h-[140px] rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /></div></div>
          ) : brandDist.error ? (
            <PanelError onRetry={loadScope} />
          ) : isThin(panelCov(brandDist.data)) ? (
            <ThinData n={panelCov(brandDist.data)?.n_invoices ?? 0} />
          ) : (
            <>
              {brandSlices.length <= 1 ? (
                <div className="flex flex-col items-center justify-center text-center py-8">
                  <div className="text-[22px] mb-2 opacity-50">🥧</div>
                  <p className="text-[13px] text-taco-text font-medium max-w-[340px]">Baru baris TACO yang terlihat pada filter ini — belum ada kompetitor atau lain-lain.</p>
                </div>
              ) : (
                <div className="flex items-center gap-8 mt-1 flex-wrap">
                  <Donut slices={brandSlices} size={140} width={20} onSlice={(label) => {
                    const bucket = (Object.keys(BUCKET_META) as BrandBucket[]).find((k) => BUCKET_META[k].label === label);
                    if (bucket) setBucketModal({ open: true, bucket });
                  }} />
                  <div className="space-y-2 text-[13px] min-w-[240px]">
                    {brandDist.data!.buckets.map((b) => (
                      <div key={b.bucket} onClick={() => setBucketModal({ open: true, bucket: b.bucket })} className="flex items-center gap-2.5 cursor-pointer hover:bg-taco-page rounded-lg px-2 py-1.5 -mx-2 border border-transparent hover:border-taco-border">
                        <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ background: BUCKET_META[b.bucket].color }} />
                        <span className="text-taco-text font-medium flex-1">{BUCKET_META[b.bucket].label}</span>
                        <span className="text-taco-sub tabular-nums">{b.n_lines} baris <span className="text-taco-muted">· {brandTotal ? Math.round((b.n_lines / brandTotal) * 100) : 0}%</span></span>
                        <span className="text-taco-muted">→</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(brandDist.data?.unknown_competitor_count ?? 0) > 0 && (
                <div className="mt-4 pt-2 border-t border-taco-divider text-[11px] text-taco-muted italic">
                  + {brandDist.data!.unknown_competitor_count} observasi kompetitor tak dikenali — tidak masuk ember Lain-lain.
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <SkuDetailModal
        open={skuModal.open}
        skuId={skuModal.skuId}
        skuName={skuModal.skuName}
        pagePeriod={period}
        pageArea={area}
        onClose={() => setSkuModal((s) => ({ ...s, open: false }))}
      />
      <CategoryDrillModal open={catModal.open} category={catModal.category} scope={scope} onClose={() => setCatModal((s) => ({ ...s, open: false }))} />
      <BrandBucketDrillModal open={bucketModal.open} bucket={bucketModal.bucket} scope={scope} onClose={() => setBucketModal((s) => ({ ...s, open: false }))} />

      <AiInsightModal
        open={insightOpen}
        onOpenChange={setInsightOpen}
        insight={insight}
        loading={false}
        period={period}
        title="Ringkasan AI Mingguan"
        subtitle={insightSubtitle}
        regenerateLabel="Buat Ringkasan Baru"
        emptyCtaLabel="Buat Ringkasan Baru"
        onRegenerate={generateInsight}
        regenerating={insightGenerating}
      />
    </>
  );
}

// ── §3 Laporan SKU row (AC-4/5/35/36) ────────────────────────────────────────

function LaporanRow({ row, q, onOpen }: { row: PriceBandRow; q: string; onOpen: () => void }) {
  const hasUp = row.outliers.some((o) => o.direction === "above");
  const hasDown = row.outliers.some((o) => o.direction === "below");
  const avg = row.p_avg ?? row.p_median;
  const unit = row.unit ?? "";
  return (
    <tr className="border-b border-taco-divider cursor-pointer hover:bg-taco-page/60" onClick={onOpen}>
      <td className="py-3 align-top">
        <div className="font-semibold"><Highlight text={row.sku_name} q={q} /></div>
        {row.sku_code && <div className="text-taco-muted text-[11px] tabular-nums"><Highlight text={row.sku_code} q={q} /></div>}
      </td>
      <td className="py-3 align-top text-right tabular-nums text-taco-sub">{row.n_invoices}</td>
      <td className="py-3 align-top">
        <div className="tabular-nums">{idID.format(row.qty_min ?? 0)} · {idID.format(row.qty_avg ?? 0)} · {idID.format(row.qty_max ?? 0)} {unit}</div>
        <div className="text-[11px] text-taco-muted">{TOTAL_TAG}: <span className="tabular-nums">{idID.format(row.qty_sum_sample ?? 0)} {unit}</span></div>
        <QtyMissingChip present={row.n_qty_present} lines={row.n_lines} missingPct={row.qty_missing_pct} />
      </td>
      <td className="py-3 align-top">
        <div className="tabular-nums">Rp {compact(row.p_min)} · {compact(avg)} · {compact(row.p_max)}</div>
        <div className="text-[11px] text-taco-muted">{TOTAL_TAG}: <span className="tabular-nums">{compactRp(row.price_sum_sample ?? 0)}</span></div>
      </td>
      <td className="py-3 align-top text-right">
        {hasUp ? (
          <span className="text-[10px] text-taco-error bg-[#FBE9E7] rounded-full px-1.5 py-0.5 font-semibold whitespace-nowrap">Outlier ▲</span>
        ) : hasDown ? (
          <span className="text-[10px] text-taco-success bg-[#E5F4EE] rounded-full px-1.5 py-0.5 font-semibold whitespace-nowrap">Outlier ▼</span>
        ) : (
          <span className="text-taco-muted">—</span>
        )}
      </td>
    </tr>
  );
}

// ── ① Truth banner ───────────────────────────────────────────────────────────

function TruthBanner({ cov, loading, error, onRetry }: { cov: CoverageV2 | null; loading: boolean; error: boolean; onRetry: () => void }) {
  const shimmer = <span className="inline-block align-middle h-3 w-5 bg-[#E6D3B5] rounded animate-pulse" />;
  const N = error ? "—" : loading ? shimmer : cov?.n_invoices ?? 0;
  const M = error ? "—" : loading ? shimmer : cov?.m_stores ?? 0;
  const K = error ? "—" : loading ? shimmer : cov?.k_areas ?? 0;
  return (
    <div className="rounded-xl bg-[#FEF6EC] border border-[#F3D9B5] flex items-start gap-3 px-4 py-3">
      <div className="w-1 self-stretch rounded-full bg-taco-warning flex-shrink-0" />
      <span className="text-taco-warning text-[16px] leading-none mt-0.5">⚖️</span>
      <p className="text-[13px] text-taco-text leading-relaxed">
        Sinyal pasar dari <b className="tabular-nums">{N}</b> invoice yang diambil sampel di <b className="tabular-nums">{M}</b> toko,{" "}
        <b className="tabular-nums">{K}</b> wilayah — <b>bukan total penjualan TACO.</b>
        {error && (
          <button onClick={onRetry} className="ml-2 text-[12px] text-taco-warning font-semibold underline">Coba lagi</button>
        )}
      </p>
    </div>
  );
}
