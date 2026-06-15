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
  fetchPriceBands,
  fetchSkuPriceHistory,
  fetchTopSkusPerArea,
  fetchPriceGapPairs,
  fetchSkuWhitespace,
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
  TopSkusPerAreaV2,
  PriceGapPairsV2,
  PriceGapPairRow,
  SkuWhitespaceV2,
  RegionBU,
  AiInsightV2,
} from "@/lib/v2/types";
import { V2PageHeader } from "../_components/V2Tabs";
import { AiInsightModal } from "../_components/AiInsightModal";
import { SparkleIcon } from "../../../admin/_components/icons";

// ── Formatters ───────────────────────────────────────────────────────────────
const idID = new Intl.NumberFormat("id-ID");
const rupiah = (v: number) => `Rp ${idID.format(Math.round(v))}`;

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

/** Signed percentage with id-ID one-decimal formatting (+14,8% / −7,9%). */
function fmtGapPct(frac: number): string {
  const v = frac * 100;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Signed Rupiah gap (+Rp 9.000 / −Rp 5.000). */
function fmtGapRp(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${rupiah(Math.abs(v))}`;
}

const PERIODS = [
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
  { value: "90d", label: "90 hari" },
  { value: "this_month", label: "Bulan Ini" },
  { value: "last_month", label: "Bln Lalu" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "Semua" },
];

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

/** AC-2 coverage chip — always rendered (AC-2.1), shows "—" on error/missing. */
function CoverageChip({ c, error }: { c?: CoverageV2 | null; error?: boolean }) {
  const text =
    error || !c
      ? "— invoice · — toko · — wilayah"
      : `${c.n_invoices} invoice · ${c.m_stores} toko · ${c.k_areas} wilayah · terakhir ${fmtDate(
          c.last_invoice_date
        )}`;
  return (
    <span className="flex-shrink-0 inline-flex items-center text-[11px] text-taco-muted bg-taco-page border border-taco-border rounded-full px-2.5 py-1 tabular-nums">
      {text}
    </span>
  );
}

function Panel({
  title,
  sub,
  coverage,
  coverageError,
  children,
}: {
  title: string;
  sub?: string;
  coverage?: CoverageV2 | null;
  coverageError?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-taco-card border border-taco-border rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-taco-text">{title}</h2>
          {sub && <p className="text-[12px] text-taco-sub mt-0.5">{sub}</p>}
        </div>
        <CoverageChip c={coverage} error={coverageError} />
      </div>
      {children}
    </section>
  );
}

/** AC-3 thin-data — chart replaced, no numbers, single exact sentence. */
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
      <p className="text-[13px] text-taco-text font-medium">
        Gagal memuat panel ini.
      </p>
      <button
        onClick={onRetry}
        className="mt-3 h-8 px-4 rounded-lg bg-white border border-taco-border text-[12px] text-taco-text hover:bg-taco-page transition-colors"
      >
        Coba lagi
      </button>
    </div>
  );
}

function SkeletonRails({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4 mt-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <div className="h-3 w-40 bg-taco-divider rounded mb-2 animate-pulse" />
          <div className="h-1.5 w-full bg-taco-divider rounded-full animate-pulse" />
        </div>
      ))}
    </div>
  );
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

/** Search input + pager toolbar (R2/R3/R4). Server-side; debounced upstream. */
function TableToolbar({
  q,
  onQ,
  placeholder,
  pagination,
  page,
  onPage,
}: {
  q: string;
  onQ: (v: string) => void;
  placeholder: string;
  pagination?: PaginationV2;
  page: number;
  onPage: (p: number) => void;
}) {
  const total = pagination?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const btn =
    "h-8 w-8 rounded-lg border border-taco-border bg-white flex items-center justify-center";
  return (
    <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted text-[13px]">
          🔎
        </span>
        <input
          type="text"
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder={placeholder}
          className={`h-9 w-[250px] pl-8 pr-3 rounded-lg text-[13px] bg-white border text-taco-text placeholder:text-taco-muted outline-none focus:border-taco-accent ${
            q ? "border-taco-accent" : "border-taco-border"
          }`}
        />
      </div>
      <div className="flex items-center gap-2 text-[12px] text-taco-sub">
        <span className="tabular-nums">
          Hal. {page} / {pages}
        </span>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className={`${btn} ${
            page <= 1
              ? "text-taco-muted cursor-not-allowed"
              : "text-taco-text hover:bg-taco-page"
          }`}
          aria-label="Sebelumnya"
        >
          ◀
        </button>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className={`${btn} ${
            page >= pages
              ? "text-taco-muted cursor-not-allowed"
              : "text-taco-text hover:bg-taco-page"
          }`}
          aria-label="Berikutnya"
        >
          ▶
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// R2 · Peta Harga Nyata — hero band-rail row (AC-4/5)
// ════════════════════════════════════════════════════════════════════════════

const ROW_GRID = "grid grid-cols-[1fr_64px_minmax(240px,1.6fr)_88px] gap-3";

function pos(p: number, min: number, max: number): number {
  if (max <= min) return 50;
  return Math.min(96, Math.max(4, ((p - min) / (max - min)) * 100));
}

function HeroRow({
  row,
  q,
  onOpen,
}: {
  row: PriceBandRow;
  q: string;
  onOpen: () => void;
}) {
  const medianPos = pos(row.p_median, row.p_min, row.p_max);
  const hasUp = row.outliers.some((o) => o.direction === "above");
  const hasDown = row.outliers.some((o) => o.direction === "below");
  return (
    <div
      className={`${ROW_GRID} items-center py-3.5 px-2 -mx-2 cursor-pointer hover:bg-taco-page/60 rounded-lg`}
      onClick={onOpen}
    >
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="text-[13px] font-semibold text-taco-text">
          <Highlight text={row.sku_name} q={q} />
        </span>
        {hasUp && (
          <span className="text-[10px] text-taco-error bg-[#FBE9E7] rounded-full px-1.5 py-0.5 font-semibold">
            Outlier ▲
          </span>
        )}
        {hasDown && (
          <span className="text-[10px] text-taco-success bg-[#E5F4EE] rounded-full px-1.5 py-0.5 font-semibold">
            Outlier ▼
          </span>
        )}
      </div>
      <span className="text-[12px] text-taco-sub tabular-nums text-right">
        {row.n_invoices}
      </span>
      <div className="relative h-9">
        <span className="absolute left-0 -top-0.5 text-[10px] text-taco-muted tabular-nums">
          {rupiah(row.p_min)}
        </span>
        <span className="absolute right-0 -top-0.5 text-[10px] text-taco-muted tabular-nums">
          {rupiah(row.p_max)}
        </span>
        <div className="absolute left-0 right-0 top-5 h-1.5 rounded-full bg-taco-divider" />
        <div
          className="absolute top-5 h-1.5 rounded-full bg-taco-accent/30"
          style={{ left: "2%", right: "2%" }}
        />
        <div
          className="absolute top-3.5 w-0.5 h-4 bg-taco-text rounded"
          style={{ left: `${medianPos}%` }}
        />
        <span
          className="absolute top-[34px] text-[9px] text-taco-text tabular-nums -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${medianPos}%` }}
        >
          median {rupiah(row.p_median)}
        </span>
        {row.outliers.map((o, i) => {
          const left = pos(o.unit_price, row.p_min, row.p_max);
          const up = o.direction === "above";
          const tip = `${rupiah(o.unit_price)} · ${o.supplier_name} · ${
            o.region_name
          }${o.invoice_date ? ` · ${fmtDate(o.invoice_date)}` : ""} · Outlier ${
            up ? "▲" : "▼"
          }`;
          return (
            <div
              key={i}
              className={`absolute -translate-x-1/2 ${up ? "-top-0.5" : "top-[26px]"}`}
              style={{ left: `${left}%` }}
              title={tip}
            >
              <span
                className={`block w-3 h-3 rounded-full border-2 border-white shadow ${
                  up ? "bg-taco-error" : "bg-taco-success"
                }`}
              />
              <span
                className={`text-[12px] leading-none ${
                  up ? "text-taco-error" : "text-taco-success"
                }`}
              >
                {up ? "▲" : "▼"}
              </span>
            </div>
          );
        })}
      </div>
      <span className="text-[11px] text-taco-sub tabular-nums text-right">
        {Math.round(row.spread_pct * 100)}%
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// R5 · SKU detail modal (sku-price-history) — AC-7/25/26/27
// ════════════════════════════════════════════════════════════════════════════

interface ModalState {
  open: boolean;
  skuId: string;
  skuName: string;
  /** In-modal Area filter — defaults "" = Semua (NOT inherited, AC-25). */
  area: string;
  /** In-modal Store filter — defaults "" = Semua (NOT inherited, AC-25). */
  storeId: string;
}
interface ModalOptions {
  areas: { id: string; name: string }[];
  stores: { id: string; name: string; region_id: string | null }[];
}

/** Recharts dot renderer — outliers as colored ▲/▼ markers (AC-26). */
function TrendDot(props: {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { dir?: "above" | "below" | null };
}) {
  const { cx, cy, index, payload } = props;
  if (cx == null || cy == null) return <g key={index} />;
  const dir = payload?.dir;
  if (dir === "above" || dir === "below") {
    const color = dir === "above" ? "#D0342C" : "#1D9E75";
    return (
      <g key={index}>
        <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={2} />
        <text
          x={cx}
          y={dir === "above" ? cy - 8 : cy + 14}
          textAnchor="middle"
          fontSize={10}
          fill={color}
        >
          {dir === "above" ? "▲" : "▼"}
        </text>
      </g>
    );
  }
  return <circle key={index} cx={cx} cy={cy} r={3.5} fill="#1A1A1A" />;
}

function SkuDetailModal({
  state,
  data,
  loading,
  error,
  options,
  onArea,
  onStore,
  onClose,
  onRetry,
}: {
  state: ModalState;
  data: SkuPriceHistoryV2 | null;
  loading: boolean;
  error: boolean;
  options: ModalOptions | null;
  onArea: (v: string) => void;
  onStore: (v: string) => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  if (!state.open) return null;

  const cov = data?.coverage ?? null;
  const thin = !!cov && cov.n_invoices < 3;
  const chartData = (data?.trend ?? []).map((t) => ({
    label: fmtDateShort(t.invoice_date),
    price: t.unit_price,
    dir: t.outlier_direction ?? null,
  }));
  const storeOpts = (options?.stores ?? []).filter(
    (s) => !state.area || s.region_id === state.area
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-taco-border overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-taco-divider flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[16px] font-semibold text-taco-text">
                {data?.sku_name || state.skuName}
              </h3>
              {!loading && !error && data && (
                <div className="text-[12px] text-taco-sub mt-1 tabular-nums">
                  {cov?.n_invoices ?? 0} invoice · min {rupiah(data.p_min)} · avg{" "}
                  {rupiah(data.p_avg)} · maks {rupiah(data.p_max)}
                </div>
              )}
              {loading && (
                <div className="h-3 w-48 bg-taco-divider rounded mt-2 animate-pulse" />
              )}
              {error && <div className="text-[12px] text-taco-sub mt-1">—</div>}
            </div>
            <button
              onClick={onClose}
              className="text-taco-muted hover:text-taco-text text-[20px] leading-none"
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>
          <div className="mt-2">
            <CoverageChip c={cov} error={error} />
          </div>
          {/* In-modal Area + Store filters (AC-25/27) — default Semua/Semua. */}
          <div className="flex items-center gap-2 mt-3">
            <select
              value={state.area}
              onChange={(e) => onArea(e.target.value)}
              className="h-8 px-3 rounded-lg text-[12px] bg-white border border-taco-border text-taco-text outline-none"
            >
              <option value="">Semua wilayah</option>
              {(options?.areas ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={state.storeId}
              onChange={(e) => onStore(e.target.value)}
              className="h-8 px-3 rounded-lg text-[12px] bg-white border border-taco-border text-taco-text outline-none"
            >
              <option value="">Semua toko</option>
              {storeOpts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="space-y-3">
              <div className="h-[180px] rounded-xl bg-taco-divider animate-pulse" />
              <div className="h-[64px] rounded-xl bg-taco-divider animate-pulse" />
              <div className="h-[64px] rounded-xl bg-taco-divider animate-pulse" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center text-center py-14">
              <div className="text-[24px] mb-2 text-taco-error">⚠️</div>
              <p className="text-[13px] text-taco-text font-medium">
                Gagal memuat detail SKU.
              </p>
              <button
                onClick={onRetry}
                className="mt-3 h-8 px-4 rounded-lg bg-white border border-taco-border text-[12px] text-taco-text hover:bg-taco-page"
              >
                Coba lagi
              </button>
            </div>
          ) : thin || !data ? (
            <ThinData n={cov?.n_invoices ?? 0} />
          ) : (
            <>
              {/* Trend chart (AC-26) */}
              <div className="text-[10px] text-taco-muted uppercase tracking-wide font-semibold mb-2">
                Tren harga per invoice (Rp)
              </div>
              <div style={{ width: "100%", height: 190 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={chartData}
                    margin={{ top: 12, right: 16, bottom: 4, left: 4 }}
                  >
                    <CartesianGrid stroke="#F0F0F0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: "#ADADAD" }}
                      tickLine={false}
                      axisLine={{ stroke: "#E5E5E5" }}
                    />
                    <YAxis
                      width={42}
                      tick={{ fontSize: 9, fill: "#ADADAD" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                      domain={["dataMin - 4000", "dataMax + 4000"]}
                    />
                    <Tooltip
                      formatter={(v: unknown) => [rupiah(Number(v)), "Harga"]}
                      labelStyle={{ fontSize: 11 }}
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    />
                    {data.p_avg > 0 && (
                      <ReferenceLine
                        y={data.p_avg}
                        stroke="#F04E23"
                        strokeDasharray="3 3"
                        strokeOpacity={0.5}
                      />
                    )}
                    <Line
                      type="linear"
                      dataKey="price"
                      stroke="#1A1A1A"
                      strokeWidth={2}
                      dot={<TrendDot />}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-taco-muted mt-1">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-taco-text" />{" "}
                  harga invoice
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-taco-error" />{" "}
                  outlier ▲
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 border-t border-dashed border-taco-accent" />{" "}
                  rata-rata
                </span>
              </div>

              {/* Invoice list (AC-7) — sorted date desc */}
              <div className="text-[10px] text-taco-muted uppercase tracking-wide font-semibold mt-4 mb-2">
                Invoice penyumbang · urut tanggal terbaru
              </div>
              <div className="space-y-2">
                {data.invoices.map((inv) => {
                  const up = inv.outlier_direction === "above";
                  const down = inv.outlier_direction === "below";
                  return (
                    <div
                      key={inv.invoice_id}
                      className={`rounded-xl p-3 ${
                        up
                          ? "border-2 border-taco-error/40 bg-[#FCEEEC]"
                          : down
                          ? "border-2 border-taco-success/40 bg-[#ECF7F2]"
                          : "border border-taco-divider"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold text-taco-text">
                          {inv.store_name} · {inv.region_name}
                        </span>
                        <span
                          className={`text-[13px] font-semibold tabular-nums ${
                            up
                              ? "text-taco-error"
                              : down
                              ? "text-taco-success"
                              : "text-taco-text"
                          }`}
                        >
                          {rupiah(inv.unit_price)}
                          {up ? " ▲" : down ? " ▼" : ""}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[11px] text-taco-sub">
                        <span>Distributor: {inv.supplier_name}</span>
                        <span className="tabular-nums">{fmtDate(inv.invoice_date)}</span>
                      </div>
                      {inv.image_url ? (
                        <a
                          href={inv.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-taco-accent font-medium mt-1.5 inline-flex items-center gap-1"
                        >
                          📎 Lihat invoice ↗
                        </a>
                      ) : (
                        <span className="text-[11px] text-taco-muted mt-1.5 inline-block">
                          Tanpa lampiran gambar
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main page
// ════════════════════════════════════════════════════════════════════════════

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("30d");
  const [area, setArea] = useState("");
  const [areaOptions, setAreaOptions] = useState<{ id: string; name: string }[]>([]);

  // Scope-driven panels (coverage + R1)
  const [cov, setCov] = useState<Async<CoverageV2>>(LOADING);
  const [top, setTop] = useState<Async<TopSkusPerAreaV2>>(LOADING);

  // R2 hero (paginated + searchable)
  const [bands, setBands] = useState<Async<PriceBandsV2>>(LOADING);
  const [bandsQ, setBandsQ] = useState("");
  const [bandsQDeb, setBandsQDeb] = useState("");
  const [bandsPage, setBandsPage] = useState(1);
  const [bandsReload, setBandsReload] = useState(0);

  // R3 head-to-head (paginated + searchable)
  const [gap, setGap] = useState<Async<PriceGapPairsV2>>(LOADING);
  const [gapQ, setGapQ] = useState("");
  const [gapQDeb, setGapQDeb] = useState("");
  const [gapPage, setGapPage] = useState(1);
  const [gapReload, setGapReload] = useState(0);

  // R4 white-space (paginated + searchable)
  const [white, setWhite] = useState<Async<SkuWhitespaceV2>>(LOADING);
  const [whiteQ, setWhiteQ] = useState("");
  const [whiteQDeb, setWhiteQDeb] = useState("");
  const [whitePage, setWhitePage] = useState(1);
  const [whiteReload, setWhiteReload] = useState(0);

  // R5 modal
  const [modal, setModal] = useState<ModalState>({
    open: false,
    skuId: "",
    skuName: "",
    area: "",
    storeId: "",
  });
  const [modalData, setModalData] = useState<Async<SkuPriceHistoryV2>>(LOADING);
  const [modalOptions, setModalOptions] = useState<ModalOptions | null>(null);

  // AI modal
  const [insight, setInsight] = useState<AiInsightV2 | null>(null);
  const [insightOpen, setInsightOpen] = useState(false);
  const [insightGenerating, setInsightGenerating] = useState(false);

  const scope: MarketScope = useMemo(
    () => ({ period, area: area || undefined }),
    [period, area]
  );

  // Area dropdown — authoritative regions (type=area).
  useEffect(() => {
    let cancelled = false;
    getRegionsV2({ type: "area" })
      .then((res) => {
        if (cancelled) return;
        const rows = unwrapList<RegionBU>(res.data);
        setAreaOptions(rows.map((r) => ({ id: r.id, name: r.name })));
      })
      .catch(() => {
        if (!cancelled) setAreaOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Scope-driven core panels (coverage + R1) — AC-12 atomic reflow ──────────
  const loadCore = useCallback(() => {
    setCov(LOADING);
    setTop(LOADING);
    fetchCoverage(scope)
      .then((d) => setCov({ loading: false, error: false, data: d }))
      .catch(() => setCov({ loading: false, error: true, data: null }));
    fetchTopSkusPerArea(scope)
      .then((d) => setTop({ loading: false, error: false, data: d }))
      .catch(() => setTop({ loading: false, error: true, data: null }));
  }, [scope]);
  useEffect(() => {
    loadCore();
  }, [loadCore]);

  // On scope change, reset each paginated panel to page 1 (search params stay
  // local to their panel per spec §7; only page resets so a stale page index
  // can't outrun the new scope's row count).
  useEffect(() => {
    setBandsPage(1);
    setGapPage(1);
    setWhitePage(1);
  }, [period, area]);

  // Debounced search commits (250ms, PRD §8) — committing a query resets page.
  useEffect(() => {
    const t = setTimeout(() => {
      setBandsQDeb(bandsQ);
      setBandsPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [bandsQ]);
  useEffect(() => {
    const t = setTimeout(() => {
      setGapQDeb(gapQ);
      setGapPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [gapQ]);
  useEffect(() => {
    const t = setTimeout(() => {
      setWhiteQDeb(whiteQ);
      setWhitePage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [whiteQ]);

  // ── Per-panel fetch effects (scope + own q/page). `alive` guards races. ─────
  useEffect(() => {
    let alive = true;
    setBands(LOADING);
    fetchPriceBands(scope, bandsQDeb, bandsPage)
      .then((d) => alive && setBands({ loading: false, error: false, data: d }))
      .catch(() => alive && setBands({ loading: false, error: true, data: null }));
    return () => {
      alive = false;
    };
  }, [scope, bandsQDeb, bandsPage, bandsReload]);

  useEffect(() => {
    let alive = true;
    setGap(LOADING);
    fetchPriceGapPairs(scope, gapQDeb, gapPage)
      .then((d) => alive && setGap({ loading: false, error: false, data: d }))
      .catch(() => alive && setGap({ loading: false, error: true, data: null }));
    return () => {
      alive = false;
    };
  }, [scope, gapQDeb, gapPage, gapReload]);

  useEffect(() => {
    let alive = true;
    setWhite(LOADING);
    fetchSkuWhitespace(scope, whiteQDeb, whitePage)
      .then((d) => alive && setWhite({ loading: false, error: false, data: d }))
      .catch(() => alive && setWhite({ loading: false, error: true, data: null }));
    return () => {
      alive = false;
    };
  }, [scope, whiteQDeb, whitePage, whiteReload]);

  // ── R5 modal fetch (single endpoint backs the whole modal) ──────────────────
  useEffect(() => {
    if (!modal.open || !modal.skuId) return;
    let alive = true;
    setModalData(LOADING);
    fetchSkuPriceHistory(modal.skuId, {
      period,
      area: modal.area || undefined,
      storeId: modal.storeId || undefined,
    })
      .then((d) => {
        if (!alive) return;
        setModalData({ loading: false, error: false, data: d });
        // Derive dropdown options ONCE from the unfiltered (Semua/Semua) fetch.
        if (!modal.area && !modal.storeId) {
          const areas = new Map<string, string>();
          const stores = new Map<
            string,
            { id: string; name: string; region_id: string | null }
          >();
          for (const t of d.trend) {
            if (t.region_id) areas.set(t.region_id, t.region_name);
            const sid = t.store_id ?? t.store_name;
            if (sid) stores.set(sid, { id: sid, name: t.store_name, region_id: t.region_id });
          }
          setModalOptions({
            areas: Array.from(areas, ([id, name]) => ({ id, name })),
            stores: Array.from(stores.values()),
          });
        }
      })
      .catch(() => alive && setModalData({ loading: false, error: true, data: null }));
    return () => {
      alive = false;
    };
  }, [modal.open, modal.skuId, modal.area, modal.storeId, period]);

  const openModal = useCallback((row: PriceBandRow) => {
    setModalOptions(null);
    setModal({
      open: true,
      skuId: row.sku_id,
      skuName: row.sku_name,
      area: "",
      storeId: "",
    });
  }, []);

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

  /** Panel coverage = the panel's own coverage, else the scope coverage. */
  const panelCov = (d: { coverage?: CoverageV2 } | null): CoverageV2 | null =>
    d?.coverage ?? scopeCov;
  const isThin = (c: CoverageV2 | null): boolean => !!c && c.n_invoices < 3;

  // R3 rows sorted by |%gap| desc (BE sorts; re-assert client-side — AC-20).
  const gapRows: (PriceGapPairRow & { gapRp: number; gapPct: number })[] = (
    gap.data?.rows ?? []
  )
    .map((r) => {
      const gapRp = r.taco_unit_price - r.competitor_unit_price;
      const gapPct = r.competitor_unit_price ? gapRp / r.competitor_unit_price : 0;
      return { ...r, gapRp, gapPct };
    })
    .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct));

  return (
    <>
      <div className="space-y-4">
        {/* ── Header + AI trigger ───────────────────────────────────────── */}
        <V2PageHeader
          title="Intelijen Pasar"
          actions={
            <button
              onClick={() => setInsightOpen(true)}
              className="h-[34px] px-3.5 inline-flex items-center gap-1.5 bg-taco-accent text-white rounded-lg text-[12px] font-semibold hover:bg-taco-accent-dark transition-colors"
            >
              <SparkleIcon size={13} />
              Ringkasan AI
            </button>
          }
        />

        {/* ── ① TRUTH BANNER (AC-1) — first content block, every state ──── */}
        <TruthBanner
          cov={scopeCov}
          loading={cov.loading}
          error={cov.error}
          onRetry={loadCore}
        />

        {/* ── ② FILTER BAR (AC-12) — sticky ─────────────────────────────── */}
        <div className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-taco-page/95 backdrop-blur-sm border-b border-taco-divider flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`h-8 px-3 rounded-full text-[12px] font-semibold transition-colors ${
                  period === p.value
                    ? "bg-taco-accent text-white"
                    : "bg-white border border-taco-border text-taco-sub hover:text-taco-text"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="h-8 px-3 rounded-lg text-[12px] bg-white border border-taco-border text-taco-text outline-none"
            >
              <option value="">Semua wilayah</option>
              {areaOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── ③ R1 — SKU TERATAS PER WILAYAH (AC-8,9,18,19) ─────────────── */}
        <Panel
          title={areaName ? `SKU Teratas — ${areaName}` : "SKU Teratas per Wilayah"}
          sub="SKU paling sering muncul di invoice — bukan total volume terjual."
          coverage={panelCov(top.data)}
          coverageError={top.error}
        >
          {top.loading ? (
            <SkeletonRails rows={5} />
          ) : top.error ? (
            <PanelError onRetry={loadCore} />
          ) : isThin(panelCov(top.data)) ? (
            <ThinData n={panelCov(top.data)?.n_invoices ?? 0} />
          ) : !top.data || top.data.regions.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
              Tidak ada data SKU untuk filter ini.
            </div>
          ) : area ? (
            // Single area → one column, top 10 (AC-9).
            <div className="space-y-2">
              {top.data.regions[0].skus.slice(0, 10).map((s) => {
                const pct = Math.round(s.occurrence_pct * 100);
                return (
                  <div key={s.sku_id}>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-taco-sub truncate pr-2">{s.sku_name}</span>
                      <span className="text-taco-muted tabular-nums whitespace-nowrap">
                        muncul di {pct}% invoice
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-taco-divider mt-1">
                      <div
                        className="h-2 rounded-full bg-taco-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-taco-muted pt-1">top 10 SKU</p>
            </div>
          ) : (
            // All areas → up to 6 region columns, top 5 each (AC-9); per-column
            // thin-data when a column has N<3 invoices (AC-18).
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {top.data.regions.slice(0, 6).map((r) => {
                const colThin = r.n_invoices < 3;
                return (
                  <div
                    key={r.region_id ?? r.region_name}
                    className={`rounded-xl p-3 ${
                      colThin
                        ? "border border-dashed border-[#F3D9B5] bg-taco-honesty/40"
                        : "border border-taco-divider"
                    }`}
                  >
                    <div className="text-[12px] font-semibold text-taco-text mb-2">
                      {r.region_name}{" "}
                      <span className="text-[10px] text-taco-muted font-normal tabular-nums">
                        · {r.n_invoices} invoice
                      </span>
                    </div>
                    {colThin ? (
                      <div className="flex flex-col items-center justify-center text-center py-6">
                        <div className="text-[20px] mb-1.5 opacity-60">🔬</div>
                        <p className="text-[12px] text-taco-text font-medium leading-snug">
                          Sampel terlalu kecil untuk filter ini (N={r.n_invoices}).{" "}
                          <span className="text-taco-sub font-normal">
                            Tambah periode atau pilih wilayah lain.
                          </span>
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {r.skus.slice(0, 5).map((s) => {
                          const pct = Math.round(s.occurrence_pct * 100);
                          return (
                            <div key={s.sku_id}>
                              <div className="flex justify-between text-[11px]">
                                <span className="text-taco-sub truncate pr-1">
                                  {s.sku_name}
                                </span>
                                <span className="text-taco-muted tabular-nums whitespace-nowrap">
                                  muncul di {pct}%
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-taco-divider mt-1">
                                <div
                                  className="h-1.5 rounded-full bg-taco-accent"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* ── ④ R2 — PETA HARGA NYATA HERO (AC-4,5,6) ───────────────────── */}
        <Panel
          title="Peta Harga Nyata"
          sub="Harga transaksi nyata per SKU — rentang min · median · maks dari invoice distributor. Klik baris untuk lihat tren & invoice."
          coverage={panelCov(bands.data)}
          coverageError={bands.error}
        >
          <TableToolbar
            q={bandsQ}
            onQ={setBandsQ}
            placeholder="Cari SKU…"
            pagination={bands.data?.pagination}
            page={bandsPage}
            onPage={setBandsPage}
          />
          {bands.loading ? (
            <SkeletonRails rows={6} />
          ) : bands.error ? (
            <PanelError onRetry={() => setBandsReload((n) => n + 1)} />
          ) : isThin(panelCov(bands.data)) ? (
            <ThinData n={panelCov(bands.data)?.n_invoices ?? 0} />
          ) : !bands.data || bands.data.skus.length === 0 ? (
            bandsQDeb ? (
              <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
                Tidak ada SKU yang cocok dengan “{bandsQDeb}”.
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-10">
                <div className="text-[24px] mb-2 opacity-60">🔎</div>
                <p className="text-[13px] text-taco-text font-medium">
                  Belum ada SKU dengan ≥3 invoice pada filter ini.
                </p>
                <p className="text-[12px] text-taco-sub mt-1">
                  Tambah periode atau perluas wilayah.
                </p>
              </div>
            )
          ) : (
            <>
              <div
                className={`${ROW_GRID} px-2 pb-1.5 border-b border-taco-divider text-[10px] text-taco-muted uppercase tracking-wide font-semibold`}
              >
                <span>SKU</span>
                <span className="text-right">N invoice</span>
                <span>Rentang harga (min · median · maks)</span>
                <span className="text-right">Spread</span>
              </div>
              <div className="divide-y divide-taco-divider">
                {bands.data.skus.map((row) => (
                  <HeroRow
                    key={row.sku_id}
                    row={row}
                    q={bandsQDeb}
                    onOpen={() => openModal(row)}
                  />
                ))}
              </div>
            </>
          )}
        </Panel>

        {/* ── ⑤ R3 — ADU HARGA TACO vs KOMPETITOR (AC-10,11,20,21,22) ───── */}
        <Panel
          title="Adu Harga TACO vs Kompetitor"
          sub="Adu harga di nota yang sama — hanya invoice yang memuat TACO dan kompetitor."
          coverage={panelCov(gap.data)}
          coverageError={gap.error}
        >
          <TableToolbar
            q={gapQ}
            onQ={setGapQ}
            placeholder="Cari SKU / merek / toko…"
            pagination={gap.data?.pagination}
            page={gapPage}
            onPage={setGapPage}
          />
          {gap.loading ? (
            <SkeletonRails rows={4} />
          ) : gap.error ? (
            <PanelError onRetry={() => setGapReload((n) => n + 1)} />
          ) : isThin(panelCov(gap.data)) ? (
            <ThinData n={panelCov(gap.data)?.n_invoices ?? 0} />
          ) : gapRows.length === 0 ? (
            <>
              {gapQDeb ? (
                <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
                  Tidak ada baris yang cocok dengan “{gapQDeb}”.
                </div>
              ) : (
                // AC-22 2nd clause: N≥3 but no resolved-brand pair.
                <div className="flex flex-col items-center justify-center text-center py-10">
                  <div className="text-[22px] mb-2 opacity-50">🚩</div>
                  <p className="text-[13px] text-taco-text font-medium max-w-[360px]">
                    Tidak ada observasi adu harga dengan merek kompetitor yang
                    dikenali pada filter ini.
                  </p>
                </div>
              )}
              {(gap.data?.unknown_competitor_count ?? 0) > 0 && (
                <div className="mt-2 pt-2 border-t border-taco-divider text-[11px] text-taco-muted italic">
                  + {gap.data?.unknown_competitor_count} observasi kompetitor tak
                  dikenali — tidak dinamai.
                </div>
              )}
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] text-taco-muted uppercase tracking-wide text-left border-b border-taco-divider">
                      <th className="py-2 font-semibold">Invoice</th>
                      <th className="py-2 font-semibold">Toko / Wilayah</th>
                      <th className="py-2 font-semibold">Tgl</th>
                      <th className="py-2 font-semibold">TACO SKU @ harga</th>
                      <th className="py-2 font-semibold">Kompetitor @ harga</th>
                      <th className="py-2 font-semibold text-right">Selisih</th>
                    </tr>
                  </thead>
                  <tbody className="text-taco-text">
                    {gapRows.map((r) => {
                      const pricier = r.gapRp > 0;
                      const cheaper = r.gapRp < 0;
                      const tone = pricier
                        ? "text-taco-error"
                        : cheaper
                        ? "text-taco-success"
                        : "text-taco-sub";
                      return (
                        <tr key={r.invoice_id} className="border-b border-taco-divider">
                          <td className="py-2.5 align-top">
                            {r.image_url ? (
                              <a
                                href={r.image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-taco-accent font-medium inline-flex items-center gap-1"
                              >
                                #{r.invoice_id} ↗
                              </a>
                            ) : (
                              <span className="text-taco-sub">#{r.invoice_id}</span>
                            )}
                          </td>
                          <td className="py-2.5 align-top">
                            <div className="font-medium">{r.store_name}</div>
                            <div className="text-taco-sub">{r.region_name}</div>
                          </td>
                          <td className="py-2.5 align-top tabular-nums text-taco-sub">
                            {fmtDate(r.invoice_date)}
                          </td>
                          <td className="py-2.5 align-top">
                            <div className="font-medium">{r.taco_sku_name}</div>
                            <div className="text-taco-text tabular-nums">
                              {rupiah(r.taco_unit_price)}
                            </div>
                          </td>
                          <td className="py-2.5 align-top">
                            <div className="font-medium">
                              🚩 {r.competitor_brand_name}
                              {r.competitor_ocr_text && (
                                <span className="text-taco-sub font-normal">
                                  {" "}
                                  · “{r.competitor_ocr_text}”
                                </span>
                              )}
                            </div>
                            <div className="text-taco-text tabular-nums">
                              {rupiah(r.competitor_unit_price)}
                            </div>
                          </td>
                          <td className="py-2.5 align-top text-right">
                            <div className={`font-semibold tabular-nums ${tone}`}>
                              {fmtGapRp(r.gapRp)}
                            </div>
                            <div className={`tabular-nums ${tone}`}>
                              {fmtGapPct(r.gapPct)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(gap.data?.unknown_competitor_count ?? 0) > 0 && (
                <div className="mt-3 pt-2 border-t border-taco-divider text-[11px] text-taco-muted italic">
                  + {gap.data?.unknown_competitor_count} observasi kompetitor tak
                  dikenali — tidak dinamai.
                </div>
              )}
            </>
          )}
        </Panel>

        {/* ── ⑥ R4 — WHITE-SPACE SKU PER WILAYAH (AC-23,24) ─────────────── */}
        <Panel
          title="White-Space SKU per Wilayah"
          sub="Bukan bukti distribusi nol — peluang riset."
          coverage={panelCov(white.data)}
          coverageError={white.error}
        >
          <TableToolbar
            q={whiteQ}
            onQ={setWhiteQ}
            placeholder="Cari SKU / wilayah…"
            pagination={white.data?.pagination}
            page={whitePage}
            onPage={setWhitePage}
          />
          {white.loading ? (
            <SkeletonRails rows={5} />
          ) : white.error ? (
            <PanelError onRetry={() => setWhiteReload((n) => n + 1)} />
          ) : !white.data || white.data.rows.length === 0 ? (
            whiteQDeb ? (
              <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
                Tidak ada baris yang cocok dengan “{whiteQDeb}”.
              </div>
            ) : (
              // AC-24: rendered set empty under filter → AC-3 thin-data body.
              <ThinData n={panelCov(white.data)?.n_invoices ?? 0} />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[10px] text-taco-muted uppercase tracking-wide text-left border-b border-taco-divider">
                    <th className="py-2 font-semibold">TACO SKU</th>
                    <th className="py-2 font-semibold">Wilayah</th>
                    <th className="py-2 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {white.data.rows.map((r) => (
                    <tr
                      key={`${r.sku_id}-${r.region_id ?? r.region_name}`}
                      className="border-b border-taco-divider last:border-0"
                    >
                      <td className="py-2.5 font-medium text-taco-text">{r.sku_name}</td>
                      <td className="py-2.5 text-taco-sub">{r.region_name}</td>
                      <td className="py-2.5 text-right">
                        <span className="text-[11px] text-taco-muted bg-taco-page border border-taco-border rounded-full px-2 py-0.5">
                          belum terlihat di sampel
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* ── ▸ R5 SKU detail modal (F-3 / AC-7,25,26,27) ──────────────────── */}
      <SkuDetailModal
        state={modal}
        data={modalData.data}
        loading={modalData.loading}
        error={modalData.error}
        options={modalOptions}
        onArea={(v) => setModal((s) => ({ ...s, area: v, storeId: "" }))}
        onStore={(v) => setModal((s) => ({ ...s, storeId: v }))}
        onClose={() => setModal((s) => ({ ...s, open: false }))}
        onRetry={() => setModal((s) => ({ ...s }))}
      />

      {/* ── ▸ Ringkasan AI Mingguan modal (F-7 / AC-13,14) ───────────────── */}
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

// ── ① Truth banner ───────────────────────────────────────────────────────────

function TruthBanner({
  cov,
  loading,
  error,
  onRetry,
}: {
  cov: CoverageV2 | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const shimmer = (
    <span className="inline-block align-middle h-3 w-5 bg-[#E6D3B5] rounded animate-pulse" />
  );
  const N = error ? "—" : loading ? shimmer : cov?.n_invoices ?? 0;
  const M = error ? "—" : loading ? shimmer : cov?.m_stores ?? 0;
  const K = error ? "—" : loading ? shimmer : cov?.k_areas ?? 0;
  return (
    <div className="rounded-xl bg-[#FEF6EC] border border-[#F3D9B5] flex items-start gap-3 px-4 py-3">
      <div className="w-1 self-stretch rounded-full bg-taco-warning flex-shrink-0" />
      <span className="text-taco-warning text-[16px] leading-none mt-0.5">⚖️</span>
      <p className="text-[13px] text-taco-text leading-relaxed">
        Sinyal pasar dari <b className="tabular-nums">{N}</b> invoice yang diambil
        sampel di <b className="tabular-nums">{M}</b> toko,{" "}
        <b className="tabular-nums">{K}</b> wilayah —{" "}
        <b>bukan total penjualan TACO.</b>
        {error && (
          <button
            onClick={onRetry}
            className="ml-2 text-[12px] text-taco-warning font-semibold underline"
          >
            Coba lagi
          </button>
        )}
      </p>
    </div>
  );
}
