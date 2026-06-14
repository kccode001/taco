"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCoverage,
  fetchPriceBands,
  fetchSkuEvidence,
  fetchDemandMix,
  fetchCompetitorBasket,
  fetchDistributorPerformance,
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
  PriceBandsV2,
  PriceBandRow,
  PriceBandOutlier,
  SkuEvidenceV2,
  DemandMixV2,
  CompetitorBasketV2,
  DistributorPerfV2,
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
function settle<T>(r: PromiseSettledResult<T>): Async<T> {
  return r.status === "fulfilled"
    ? { loading: false, error: false, data: r.value }
    : { loading: false, error: true, data: null };
}

// ── Shared bits ──────────────────────────────────────────────────────────────

/** AC-2 coverage chip — always rendered (AC-2.1), shows "—" on error/missing. */
function CoverageChip({
  c,
  error,
}: {
  c?: CoverageV2 | null;
  error?: boolean;
}) {
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
  legend,
  coverage,
  coverageError,
  children,
}: {
  title: string;
  sub?: string;
  legend?: React.ReactNode;
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
          {legend}
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

// ── ③ Hero — band row (CSS/SVG rail, AC-4/5) ─────────────────────────────────

function pos(p: number, min: number, max: number): number {
  if (max <= min) return 50;
  return Math.min(98, Math.max(2, ((p - min) / (max - min)) * 100));
}

function BandRow({
  row,
  onOpen,
  onOutlier,
}: {
  row: PriceBandRow;
  onOpen: () => void;
  onOutlier: (o: PriceBandOutlier) => void;
}) {
  const medianPos = pos(row.p_median, row.p_min, row.p_max);
  const hasUp = row.outliers.some((o) => o.direction === "above");
  const hasDown = row.outliers.some((o) => o.direction === "below");
  return (
    <div
      className="py-3.5 cursor-pointer hover:bg-taco-page/60 -mx-2 px-2 rounded-lg"
      onClick={onOpen}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-taco-text">
            {row.sku_name}
          </span>
          <span className="text-[10px] text-taco-muted bg-taco-page border border-taco-border rounded-full px-1.5 py-0.5 tabular-nums">
            N={row.n_invoices} invoice
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
        <span className="text-[11px] text-taco-sub tabular-nums">
          spread {Math.round(row.spread_pct * 100)}%
        </span>
      </div>
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
              onClick={(e) => {
                e.stopPropagation();
                onOutlier(o);
              }}
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
    </div>
  );
}

// ── ▸ F-3 Evidence drawer (AC-7) ─────────────────────────────────────────────

interface DrawerState {
  open: boolean;
  skuId: string;
  fallbackName: string;
  band: { min: number; median: number; max: number } | null;
  /** Outliers from the clicked band — tag evidence rows ▲/▼ on live data. */
  outliers: PriceBandOutlier[];
  highlight: string | null;
}

function EvidenceDrawer({
  state,
  data,
  loading,
  error,
  onClose,
  onRetry,
}: {
  state: DrawerState;
  data: SkuEvidenceV2 | null;
  loading: boolean;
  error: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const highlightRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!loading && data && state.highlight && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [loading, data, state.highlight]);

  if (!state.open) return null;
  const band = state.band;
  const cov = data?.coverage;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-[480px] sm:max-w-[480px] bg-white h-full overflow-y-auto flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-taco-divider flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-taco-text">
                {data?.sku_name ?? state.fallbackName}
              </h3>
              {band && (
                <div className="text-[11px] text-taco-sub mt-0.5 tabular-nums">
                  min {rupiah(band.min)} · median {rupiah(band.median)} · maks{" "}
                  {rupiah(band.max)}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-taco-muted hover:text-taco-text text-[20px] leading-none"
            >
              ✕
            </button>
          </div>
          <div className="mt-2">
            <CoverageChip c={cov} error={error} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[72px] rounded-xl bg-taco-divider animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <PanelError onRetry={onRetry} />
          ) : !data || data.invoices.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
              Tidak ada invoice untuk SKU ini pada filter saat ini.
            </div>
          ) : (
            <>
              {data.invoices.map((inv) => {
                const isHL = state.highlight === inv.invoice_id;
                const up = inv.outlier_direction === "above";
                const down = inv.outlier_direction === "below";
                return (
                  <div
                    key={inv.invoice_id}
                    ref={isHL ? highlightRef : undefined}
                    className={`rounded-xl p-3 ${
                      isHL && up
                        ? "border-2 border-taco-error/40 bg-[#FCEEEC]"
                        : isHL && down
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
                      <span className="tabular-nums">
                        {fmtDate(inv.invoice_date)}
                      </span>
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
              <p className="text-[10px] text-taco-muted text-center pt-1">
                diurutkan dari tanggal terbaru · menampilkan nama distributor asli
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("30d");
  const [area, setArea] = useState("");
  const [areaOptions, setAreaOptions] = useState<{ id: string; name: string }[]>(
    []
  );

  const [cov, setCov] = useState<Async<CoverageV2>>(LOADING);
  const [bands, setBands] = useState<Async<PriceBandsV2>>(LOADING);
  const [demand, setDemand] = useState<Async<DemandMixV2>>(LOADING);
  const [comp, setComp] = useState<Async<CompetitorBasketV2>>(LOADING);
  const [dist, setDist] = useState<Async<DistributorPerfV2>>(LOADING);

  // Evidence drawer
  const [drawer, setDrawer] = useState<DrawerState>({
    open: false,
    skuId: "",
    fallbackName: "",
    band: null,
    outliers: [],
    highlight: null,
  });
  const [evidence, setEvidence] = useState<Async<SkuEvidenceV2>>(LOADING);

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

  // AC-12 atomic reflow: one scope drives every panel; all enter loading
  // together and resolve together — no stale-N moment across panels.
  const loadAll = useCallback(async () => {
    setCov(LOADING);
    setBands(LOADING);
    setDemand(LOADING);
    setComp(LOADING);
    setDist(LOADING);
    const [c, pb, dm, cb, dp] = await Promise.allSettled([
      fetchCoverage(scope),
      fetchPriceBands(scope),
      fetchDemandMix(scope),
      fetchCompetitorBasket(scope),
      fetchDistributorPerformance(scope),
    ]);
    setCov(settle(c));
    setBands(settle(pb));
    setDemand(settle(dm));
    setComp(settle(cb));
    setDist(settle(dp));
  }, [scope]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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

  // Drawer open + fetch evidence.
  const openDrawer = useCallback(
    async (row: PriceBandRow, highlight: string | null) => {
      setDrawer({
        open: true,
        skuId: row.sku_id,
        fallbackName: row.sku_name,
        band: { min: row.p_min, median: row.p_median, max: row.p_max },
        outliers: row.outliers,
        highlight,
      });
      setEvidence(LOADING);
      try {
        const data = await fetchSkuEvidence(row.sku_id, scope, {
          sku_name: row.sku_name,
          p_min: row.p_min,
          p_median: row.p_median,
          p_max: row.p_max,
          outliers: row.outliers,
        });
        setEvidence({ loading: false, error: false, data });
      } catch {
        setEvidence({ loading: false, error: true, data: null });
      }
    },
    [scope]
  );
  const retryEvidence = useCallback(async () => {
    if (!drawer.skuId) return;
    setEvidence(LOADING);
    try {
      const data = await fetchSkuEvidence(drawer.skuId, scope, {
        sku_name: drawer.fallbackName,
        p_min: drawer.band?.min,
        p_median: drawer.band?.median,
        p_max: drawer.band?.max,
        outliers: drawer.outliers,
      });
      setEvidence({ loading: false, error: false, data });
    } catch {
      setEvidence({ loading: false, error: true, data: null });
    }
  }, [drawer.skuId, drawer.fallbackName, drawer.band, drawer.outliers, scope]);

  // Derived
  const scopeCov = cov.data;
  const periodLabel =
    PERIODS.find((p) => p.value === period)?.label ?? period;
  const areaName = areaOptions.find((a) => a.id === area)?.name;
  const insightSubtitle = `Periode ${periodLabel} · ${
    areaName ?? "Semua wilayah"
  }`;

  /** Panel coverage = the panel's own coverage, else the scope coverage. */
  function panelCov(d: { coverage?: CoverageV2 } | null): CoverageV2 | null {
    return d?.coverage ?? scopeCov;
  }
  function isThin(c: CoverageV2 | null): boolean {
    return !!c && c.n_invoices < 3;
  }

  return (
    <>
      <div className="space-y-4">
        {/* ── Header + AI trigger ─────────────────────────────────────── */}
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

        {/* ── ① TRUTH BANNER (AC-1) — first content block, every state ── */}
        <TruthBanner
          cov={scopeCov}
          loading={cov.loading}
          error={cov.error}
          onRetry={loadAll}
        />

        {/* ── ② FILTER BAR (AC-12) — sticky ───────────────────────────── */}
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

        {/* ── ③ HERO — PETA HARGA NYATA (AC-4,5,6) ────────────────────── */}
        <Panel
          title="Peta Harga Nyata"
          sub="Harga transaksi nyata per SKU — rentang min · median · maks dari invoice distributor."
          coverage={panelCov(bands.data)}
          coverageError={bands.error}
        >
          {bands.loading ? (
            <SkeletonRails rows={6} />
          ) : bands.error ? (
            <PanelError onRetry={loadAll} />
          ) : isThin(panelCov(bands.data)) ? (
            <ThinData n={panelCov(bands.data)?.n_invoices ?? 0} />
          ) : !bands.data || bands.data.skus.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10">
              <div className="text-[24px] mb-2 opacity-60">🔎</div>
              <p className="text-[13px] text-taco-text font-medium">
                Belum ada SKU dengan ≥3 invoice pada filter ini.
              </p>
              <p className="text-[12px] text-taco-sub mt-1">
                Tambah periode atau perluas wilayah.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-taco-divider">
              {bands.data.skus.map((row) => (
                <BandRow
                  key={row.sku_id}
                  row={row}
                  onOpen={() => openDrawer(row, null)}
                  onOutlier={(o) => openDrawer(row, o.invoice_id)}
                />
              ))}
            </div>
          )}
        </Panel>

        {/* ── ④ SEBARAN PERMINTAAN PER WILAYAH (AC-8,9) ───────────────── */}
        <Panel
          title={
            areaName
              ? `Sebaran Permintaan — ${areaName}`
              : "Sebaran Permintaan per Wilayah"
          }
          sub="Seberapa sering SKU muncul di invoice — bukan total volume terjual."
          legend={
            !area ? (
              <p className="text-[10px] text-taco-muted mt-0.5">
                Angka % = <b>muncul di …% invoice</b> wilayah tsb — frekuensi
                kemunculan, bukan volume/pangsa.
              </p>
            ) : undefined
          }
          coverage={panelCov(demand.data)}
          coverageError={demand.error}
        >
          {demand.loading ? (
            <SkeletonRails rows={5} />
          ) : demand.error ? (
            <PanelError onRetry={loadAll} />
          ) : isThin(panelCov(demand.data)) ? (
            <ThinData n={panelCov(demand.data)?.n_invoices ?? 0} />
          ) : !demand.data || demand.data.regions.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
              Tidak ada data permintaan untuk filter ini.
            </div>
          ) : area ? (
            // Single area → one column, top 10, full canonical label.
            <div className="space-y-2">
              {demand.data.regions[0].skus.slice(0, 10).map((s) => {
                const pct = Math.round(s.occurrence_pct * 100);
                return (
                  <div key={s.sku_id}>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-taco-sub truncate pr-2">
                        {s.sku_name}
                      </span>
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
            // All areas → up to 6 region columns, top 5 each.
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {demand.data.regions.slice(0, 6).map((r) => (
                <div
                  key={r.region_id ?? r.region_name}
                  className="rounded-xl border border-taco-divider p-3"
                >
                  <div className="text-[12px] font-semibold text-taco-text mb-2">
                    {r.region_name}{" "}
                    <span className="text-[10px] text-taco-muted font-normal tabular-nums">
                      · {r.n_invoices} invoice
                    </span>
                  </div>
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
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ── ⑤ BERBAGI KERANJANG KOMPETITOR (AC-10,11) ───────────────── */}
        <Panel
          title="Berbagi Keranjang Kompetitor"
          sub="Seberapa sering invoice memuat TACO sekaligus merek kompetitor — co-occurrence pada sampel, bukan pangsa pasar."
          coverage={panelCov(comp.data)}
          coverageError={comp.error}
        >
          {comp.loading ? (
            <SkeletonRails rows={3} />
          ) : comp.error ? (
            <PanelError onRetry={loadAll} />
          ) : isThin(panelCov(comp.data)) ? (
            <ThinData n={panelCov(comp.data)?.n_invoices ?? 0} />
          ) : !comp.data ||
            comp.data.n_with_taco_and_competitor === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-9">
              <div className="text-[22px] mb-2 opacity-50">🧺</div>
              <p className="text-[13px] text-taco-text font-medium">
                Tidak ada invoice yang memuat TACO + kompetitor pada filter ini.
              </p>
              <p className="text-[12px] text-taco-sub mt-1 tabular-nums">
                0 dari {comp.data?.n_invoices ?? 0} invoice tersampel.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6 items-center">
              <div className="rounded-xl bg-taco-accent-tint border border-[#F8D6CB] p-4">
                <div className="text-[13px] text-taco-sub leading-snug">
                  <b className="text-taco-text tabular-nums text-[22px]">
                    {comp.data.n_with_taco_and_competitor}
                  </b>{" "}
                  dari{" "}
                  <b className="tabular-nums">{comp.data.n_invoices}</b> invoice
                  memuat <b className="text-taco-accent">TACO + kompetitor</b>
                </div>
                <div className="text-[12px] text-taco-accent font-semibold mt-1 tabular-nums">
                  co-occurrence {Math.round(comp.data.co_occurrence_pct * 100)}%
                </div>
              </div>
              <div>
                <div className="text-[11px] text-taco-muted mb-2 uppercase tracking-wide">
                  Top merek kompetitor yang muncul bersama
                </div>
                <div className="space-y-2">
                  {comp.data.top_brands.slice(0, 3).map((b, i, arr) => (
                    <div
                      key={b.brand_id}
                      className={`flex items-center justify-between ${
                        i < arr.length - 1
                          ? "border-b border-taco-divider pb-2"
                          : "pb-1"
                      }`}
                    >
                      <span className="text-[13px] text-taco-text font-medium">
                        🚩 {b.brand_name}
                      </span>
                      <span className="text-[12px] text-taco-sub tabular-nums">
                        {b.n_invoices} invoice
                      </span>
                    </div>
                  ))}
                  {comp.data.top_brands.length === 0 && (
                    <p className="text-[12px] text-taco-muted">
                      Belum ada merek kompetitor terverifikasi pada filter ini.
                    </p>
                  )}
                </div>
                {comp.data.n_unknown_competitor > 0 && (
                  <p className="mt-3 text-[11px] text-taco-muted italic">
                    + {comp.data.n_unknown_competitor} invoice dengan kompetitor
                    tak dikenali (masuk hitungan total, tidak dinamai).
                  </p>
                )}
              </div>
            </div>
          )}
        </Panel>

        {/* ── ⑥ KINERJA DISTRIBUTOR (AC-16,17) ────────────────────────── */}
        <Panel
          title="Kinerja Distributor"
          sub="Berdasarkan invoice yang kami sampel — bukan total pembelian distributor."
          coverage={panelCov(dist.data)}
          coverageError={dist.error}
        >
          {dist.loading ? (
            <SkeletonRails rows={3} />
          ) : dist.error ? (
            <PanelError onRetry={loadAll} />
          ) : isThin(panelCov(dist.data)) ||
            !dist.data ||
            dist.data.distributors.length === 0 ? (
            <ThinData n={panelCov(dist.data)?.n_invoices ?? 0} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] text-taco-muted uppercase tracking-wide text-left border-b border-taco-divider">
                    <th className="py-2 font-semibold">Distributor</th>
                    <th className="py-2 font-semibold text-right">
                      Invoice tersampel
                    </th>
                    <th className="py-2 font-semibold text-right">
                      Rata-rata nilai invoice
                    </th>
                    <th className="py-2 font-semibold text-right">
                      Terakhir terlihat
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...dist.data.distributors]
                    .sort(
                      (a, b) =>
                        b.n_invoices - a.n_invoices ||
                        (b.last_invoice_date ?? "").localeCompare(
                          a.last_invoice_date ?? ""
                        )
                    )
                    .map((d) => (
                      <tr
                        key={d.supplier_name_normalized}
                        className="border-b border-taco-divider last:border-0"
                      >
                        <td className="py-2.5 font-medium text-taco-text">
                          {d.supplier_name_normalized}{" "}
                          <span
                            className="text-taco-muted cursor-help"
                            title={`raw: ${d.supplier_name_raw_sample}`}
                          >
                            ⓘ
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {d.n_invoices} invoice
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {rupiah(d.avg_invoice_value)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-taco-sub">
                          {fmtDate(d.last_invoice_date)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* ── ▸ Evidence drawer (F-3 / AC-7) ───────────────────────────── */}
      <EvidenceDrawer
        state={drawer}
        data={evidence.data}
        loading={evidence.loading}
        error={evidence.error}
        onClose={() => setDrawer((s) => ({ ...s, open: false }))}
        onRetry={retryEvidence}
      />

      {/* ── ▸ Ringkasan AI Mingguan modal (F-7 / AC-13,14) ───────────── */}
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
      <span className="text-taco-warning text-[16px] leading-none mt-0.5">
        ⚖️
      </span>
      <p className="text-[13px] text-taco-text leading-relaxed">
        Sinyal pasar dari <b className="tabular-nums">{N}</b> invoice yang
        diambil sampel di <b className="tabular-nums">{M}</b> toko,{" "}
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
