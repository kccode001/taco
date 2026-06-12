"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  getAnalyticsSummary,
  getAnalyticsShareByArea,
  getAnalyticsTrend,
  getAnalyticsTopSkus,
  getAnalyticsCompetitorBrands,
  getAnalyticsAreaStores,
  getDashboardAiInsight,
  getDashboardLatestInsight,
  adaptAiInsight,
  adaptLatestInsight,
} from "@/lib/v2/api";
import type {
  AnalyticsSummaryV2,
  ShareByAreaV2,
  AreaShareRow,
  AnalyticsTrendV2,
  TopSkusV2,
  CompetitorBrandsV2,
  AreaStoresDrillV2,
  AiInsightV2,
} from "@/lib/v2/types";
import { V2PageHeader } from "../_components/V2Tabs";
import { AiInsightModal } from "../_components/AiInsightModal";
import { SparkleIcon } from "../../../admin/_components/icons";

// ── Palette ──────────────────────────────────────────────────────────────────
const AREA_COLORS = [
  "#1D9E75", "#2563EB", "#0E7490", "#7C3AED", "#64748B", "#0891B2",
];
const TACO_GREEN = "#1D9E75";
// TACO bars on the share chart use the primary brand orange (KC round-2 spec).
const TACO_ORANGE = "#F04E23";
const NON_TACO_GREY = "#E5E7EB";
const COMP_RED = "#EF4444";
const BLACK = "#1A1A1A";

// ── Formatters ───────────────────────────────────────────────────────────────
const idID = new Intl.NumberFormat("id-ID");
const idr = (v: number) =>
  v >= 1_000_000
    ? `Rp ${(v / 1_000_000).toFixed(1)} jt`
    : `Rp ${idID.format(Math.round(v))}`;

// ── Period options ────────────────────────────────────────────────────────────
const PERIODS = [
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
  { value: "90d", label: "90 hari" },
  { value: "this_month", label: "Bulan Ini" },
  { value: "last_month", label: "Bln Lalu" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "Semua" },
];

// ── Shared sub-components ────────────────────────────────────────────────────

function DeltaChip({
  delta,
  suffix = "%",
}: {
  delta: number | null | undefined;
  suffix?: string;
}) {
  if (delta === null || delta === undefined)
    return <span className="text-[11px] text-taco-muted">—</span>;
  const up = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
        up ? "text-taco-success" : "text-taco-error"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
      {suffix}
    </span>
  );
}

function KpiTile({
  label,
  value,
  delta,
  suffix = "%",
  sub,
}: {
  label: string;
  value: string;
  delta?: number | null;
  suffix?: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-taco-border rounded-xl p-4 flex flex-col gap-1">
      <div className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider">
        {label}
      </div>
      <div className="text-[22px] font-bold text-taco-text leading-tight">
        {value}
      </div>
      <div className="flex items-center gap-2">
        <DeltaChip delta={delta} suffix={suffix} />
        {sub && <span className="text-[11px] text-taco-muted">{sub}</span>}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  sub,
  children,
  headerRight,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-taco-divider flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold text-taco-text">{title}</h2>
          {sub && <p className="text-[12px] text-taco-sub">{sub}</p>}
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

// ── Drill-down drawer ────────────────────────────────────────────────────────

function DrillDrawer({
  open,
  areaName,
  data,
  loading,
  onClose,
}: {
  open: boolean;
  areaName: string;
  data: AreaStoresDrillV2 | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-white h-full overflow-y-auto flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-taco-divider flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-taco-text">
              {areaName}
            </h3>
            <p className="text-[12px] text-taco-sub">Toko per area</p>
          </div>
          <button
            onClick={onClose}
            className="text-taco-muted hover:text-taco-text text-[20px] leading-none"
          >
            ×
          </button>
        </div>

        {data?.area_kpis && (
          <div className="px-5 py-3 border-b border-taco-divider grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-taco-muted uppercase tracking-wider">
                TACO Share
              </div>
              <div className="text-[18px] font-bold text-taco-text">
                {data.area_kpis.taco_share_value_pct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-taco-muted uppercase tracking-wider">
                Invoices
              </div>
              <div className="text-[18px] font-bold text-taco-text">
                {data.area_kpis.invoice_count}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-taco-muted uppercase tracking-wider">
                Kompetitor
              </div>
              <div className="text-[18px] font-bold text-taco-text">
                {data.area_kpis.competitor_share_pct.toFixed(1)}%
              </div>
            </div>
          </div>
        )}

        <div className="flex-1">
          {loading ? (
            <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
              Memuat…
            </div>
          ) : !data || data.stores.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
              Tidak ada data toko untuk area ini.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-taco-page border-b border-taco-border">
                  {["Toko", "Invoice", "TACO Share", "Top SKU"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-[10px] font-semibold text-taco-muted uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.stores.map((s) => (
                  <tr
                    key={s.store_id}
                    className="border-b border-taco-divider last:border-0"
                  >
                    <td className="px-4 py-3 text-[13px] font-medium text-taco-text">
                      {s.store_name}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-taco-sub">
                      {s.invoice_count}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[13px] font-semibold"
                        style={{
                          color:
                            s.taco_share_value_pct >= 50
                              ? TACO_GREEN
                              : s.taco_share_value_pct >= 25
                              ? "#D97706"
                              : COMP_RED,
                        }}
                      >
                        {s.taco_share_value_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-taco-sub truncate max-w-[140px]">
                      {s.top_sku_name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("30d");
  const [areaFilter, setAreaFilter] = useState<string>("");
  // Per-section SKU area filter — independent of the global area filter
  const [skuAreaFilter, setSkuAreaFilter] = useState<string>("");

  // Data
  const [summary, setSummary] = useState<AnalyticsSummaryV2 | null>(null);
  const [shareByArea, setShareByArea] = useState<ShareByAreaV2 | null>(null);
  const [trend, setTrend] = useState<AnalyticsTrendV2 | null>(null);
  const [topSkus, setTopSkus] = useState<TopSkusV2 | null>(null);
  const [competitor, setCompetitor] = useState<CompetitorBrandsV2 | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [topSkusLoading, setTopSkusLoading] = useState(true);

  // Drill-down
  const [drillAreaId, setDrillAreaId] = useState<string | null>(null);
  const [drillAreaName, setDrillAreaName] = useState("");
  const [drillData, setDrillData] = useState<AreaStoresDrillV2 | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  // AI insight (single Generate button → modal). Reuses the persisted
  // taro_v2_market_insights row + markdown modal infra.
  const [insight, setInsight] = useState<AiInsightV2 | null>(null);
  const [insightModalOpen, setInsightModalOpen] = useState(false);
  const [insightGenerating, setInsightGenerating] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = {
        period,
        ...(areaFilter ? { area: areaFilter } : {}),
      };
      const [sumRes, shareRes, trendRes, compRes] = await Promise.all([
        getAnalyticsSummary(params),
        getAnalyticsShareByArea(params),
        getAnalyticsTrend(params),
        getAnalyticsCompetitorBrands(params),
      ]);
      setSummary(sumRes.data);
      setShareByArea(shareRes.data);
      setTrend(trendRes.data);
      setCompetitor(compRes.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [period, areaFilter]);

  const fetchTopSkus = useCallback(async () => {
    setTopSkusLoading(true);
    try {
      const params = {
        period,
        ...(skuAreaFilter ? { area: skuAreaFilter } : {}),
      };
      const res = await getAnalyticsTopSkus(params);
      setTopSkus(res.data);
    } catch {
      setTopSkus(null);
    } finally {
      setTopSkusLoading(false);
    }
  }, [period, skuAreaFilter]);

  // Load the latest SAVED insight for the period (no LLM call) on mount/period change.
  const fetchSavedInsight = useCallback(async () => {
    try {
      const res = await getDashboardLatestInsight({ period });
      setInsight(adaptLatestInsight(res.data));
    } catch {
      setInsight(null);
    }
  }, [period]);

  // Generate a fresh insight (Sonnet) — triggered from the modal.
  const generateInsight = useCallback(async () => {
    setInsightGenerating(true);
    try {
      const res = await getDashboardAiInsight({ period });
      setInsight(adaptAiInsight(res.data));
    } finally {
      setInsightGenerating(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    fetchTopSkus();
  }, [fetchTopSkus]);

  useEffect(() => {
    fetchSavedInsight();
  }, [fetchSavedInsight]);

  const openDrill = useCallback(
    async (areaId: string | null, areaName: string) => {
      if (!areaId) return;
      setDrillAreaId(areaId);
      setDrillAreaName(areaName);
      setDrillLoading(true);
      setDrillData(null);
      try {
        const res = await getAnalyticsAreaStores({ area_id: areaId, period });
        setDrillData(res.data);
      } catch {
        setDrillData(null);
      } finally {
        setDrillLoading(false);
      }
    },
    [period]
  );

  const closeDrill = () => setDrillAreaId(null);

  // Derived
  const byArea = shareByArea?.by_area ?? [];
  const kpis = summary?.kpis;

  // 4 management KPI cards derived from fetched data
  const areasCovered = byArea.filter((a) => a.invoice_count > 0).length;
  const weakestArea = useMemo(() => {
    if (byArea.length === 0) return null;
    return byArea.reduce((w, a) =>
      a.taco_share_value_pct < w.taco_share_value_pct ? a : w
    );
  }, [byArea]);
  // Area with the highest TACO share (name + %) — replaces the old value card.
  const topArea = useMemo(() => {
    if (byArea.length === 0) return null;
    return byArea.reduce((t, a) =>
      a.taco_share_value_pct > t.taco_share_value_pct ? a : t
    );
  }, [byArea]);

  // Area options for the global filter and SKU section filter
  const areaOptions = useMemo(
    () => byArea.map((a) => ({ id: a.area_id ?? "", name: a.area_name })),
    [byArea]
  );

  // Trend: pivot per-area series into recharts format [{bucket, area1, area2…}]
  const trendData = useMemo(() => {
    const perArea = trend?.per_area ?? [];
    const buckets = new Map<string, Record<string, number>>();
    for (const area of perArea) {
      for (const pt of area.series) {
        if (!buckets.has(pt.bucket))
          buckets.set(pt.bucket, {
            bucket: pt.bucket as unknown as number,
          });
        buckets.get(pt.bucket)![area.area_name] = pt.taco_share_value_pct;
      }
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [trend]);

  const trendAreas = trend?.per_area ?? [];

  // Competitor: only show areas with at least one named brand
  const namedCompetitorAreas = useMemo(
    () => (competitor?.by_area ?? []).filter((a) => a.top_brands.length > 0),
    [competitor]
  );

  return (
    <>
      <div className="space-y-5">
        {/* ── Header (sticky on scroll) ──────────────────────────────── */}
        <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-3 bg-taco-page/95 backdrop-blur-sm border-b border-taco-border">
          <V2PageHeader
            title="Dashboard"
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setInsightModalOpen(true)}
                  className="h-[32px] px-3 inline-flex items-center gap-1.5 bg-taco-accent text-white rounded-lg text-[12px] font-semibold hover:opacity-90 transition-opacity"
                >
                  <SparkleIcon size={13} />
                  Generate Insight
                </button>
                <div className="flex items-center gap-1 bg-white border border-taco-border rounded-lg p-0.5">
                  {PERIODS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setPeriod(p.value)}
                      className={`h-[30px] px-2.5 rounded-md text-[12px] font-semibold transition-colors ${
                        period === p.value
                          ? "bg-taco-text text-white"
                          : "text-taco-sub hover:text-taco-text"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  className="h-[32px] text-[13px] border border-taco-border rounded-lg px-2.5 text-taco-text bg-white outline-none"
                >
                  <option value="">Semua Area</option>
                  {areaOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            }
          />
        </div>

        {/* ── Error state ─────────────────────────────────────────────── */}
        {loadError && (
          <div className="text-[13px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            Gagal memuat data. Periksa koneksi lalu coba lagi.
          </div>
        )}

        {/* ── A. 4 KPI cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label="TACO Share (%)"
            value={kpis ? `${kpis.taco_share_pct.toFixed(1)}%` : "—"}
            delta={kpis?.taco_share_delta_pp}
            suffix=" pp"
            sub="vs. Non-TACO"
          />
          <KpiTile
            label="Area Tertinggi"
            value={
              loading
                ? "—"
                : topArea
                ? `${topArea.taco_share_value_pct.toFixed(1)}%`
                : "—"
            }
            sub={topArea?.area_name ?? "share TACO tertinggi"}
          />
          <KpiTile
            label="Area Terjangkau"
            value={loading ? "—" : String(areasCovered)}
            sub="area dengan invoice"
          />
          <KpiTile
            label="Area Terlemah"
            value={
              loading
                ? "—"
                : weakestArea
                ? `${weakestArea.taco_share_value_pct.toFixed(1)}%`
                : "—"
            }
            sub={weakestArea?.area_name ?? undefined}
          />
        </div>

        {/* ── B. TACO vs Non-TACO per Area ────────────────────────────── */}
        <SectionCard
          title="TACO vs Non-TACO per Area"
          sub="Proporsi nilai IDR yang dikuasai TACO dibanding merek lain, per wilayah."
        >
          {loading ? (
            <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
              Memuat…
            </div>
          ) : byArea.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
              Tidak ada data untuk periode ini.
            </div>
          ) : (
            <div className="p-5">
              <ResponsiveContainer
                width="100%"
                height={Math.max(200, byArea.length * 60)}
              >
                <BarChart
                  data={byArea.map((a) => ({
                    area_name: a.area_name,
                    TACO: Number(a.taco_share_value_pct.toFixed(1)),
                    "Non-TACO": Number(
                      (100 - a.taco_share_value_pct).toFixed(1)
                    ),
                    _areaId: a.area_id,
                  }))}
                  layout="vertical"
                  margin={{ left: 8, right: 24 }}
                  onClick={(e) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const payload = (e as any)?.activePayload?.[0]
                      ?.payload as AreaShareRow & { _areaId: string };
                    if (payload?._areaId) {
                      openDrill(payload._areaId, payload.area_name);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid horizontal={false} stroke="#F0F0F0" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "#717171" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="area_name"
                    width={120}
                    tick={{ fontSize: 12, fill: "#1A1A1A" }}
                  />
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [
                      `${Number(v).toFixed(1)}%`,
                      String(name),
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) => (
                      <span style={{ color: BLACK }}>{value}</span>
                    )}
                  />
                  <Bar
                    dataKey="TACO"
                    fill={TACO_ORANGE}
                    stackId="share"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="Non-TACO"
                    fill={NON_TACO_GREY}
                    stackId="share"
                    radius={[0, 3, 3, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        {/* ── Trend Over Time ─────────────────────────────────────────── */}
        <SectionCard
          title="Trend TACO Share dari Waktu ke Waktu"
          sub={`Per area, dikelompokkan berdasarkan tanggal upload (${
            trend?.bucket_type === "week" ? "mingguan" : "bulanan"
          }).`}
        >
          {loading ? (
            <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
              Memuat…
            </div>
          ) : trendData.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-taco-muted">
              Belum ada data trend untuk periode ini.
            </div>
          ) : (
            <div className="p-5">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 11, fill: "#717171" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "#717171" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [
                      `${Number(v).toFixed(1)}%`,
                      String(name),
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {trendAreas.map((a, i) => (
                    <Line
                      key={a.area_id ?? i}
                      type="monotone"
                      dataKey={a.area_name}
                      stroke={AREA_COLORS[i % AREA_COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        {/* ── Ringkasan per Area (table) ───────────────────────────────── */}
        <SectionCard
          title="Ringkasan per Area"
          sub="Rincian share nilai IDR, kuantitas, dan frekuensi invoice per wilayah."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-taco-page border-b border-taco-border">
                  {[
                    "Area",
                    "Invoice",
                    "TACO Share (nilai)",
                    "TACO Share (qty)",
                    "TACO Share (freq)",
                    "Kompetitor %",
                    "Unresolved",
                    "Nilai TACO",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-[10px] font-semibold text-taco-muted uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-[13px] text-taco-muted"
                    >
                      Memuat…
                    </td>
                  </tr>
                ) : byArea.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-[13px] text-taco-muted"
                    >
                      Tidak ada data untuk periode ini.
                    </td>
                  </tr>
                ) : (
                  byArea.map((a, i) => (
                    <tr
                      key={a.area_id ?? i}
                      className="border-b border-taco-divider last:border-0 hover:bg-taco-page cursor-pointer transition-colors"
                      onClick={() => openDrill(a.area_id, a.area_name)}
                    >
                      <td className="px-4 py-3 text-[13px] font-medium text-taco-text">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              background: AREA_COLORS[i % AREA_COLORS.length],
                            }}
                          />
                          {a.area_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-taco-sub">
                        {idID.format(a.invoice_count)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-[13px] font-semibold"
                          style={{ color: TACO_GREEN }}
                        >
                          {a.taco_share_value_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-taco-sub">
                        {a.taco_share_qty_pct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-[13px] text-taco-sub">
                        {a.taco_share_freq_pct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-[13px] font-semibold"
                          style={{
                            color:
                              a.competitor_share_pct > 20 ? COMP_RED : "#717171",
                          }}
                        >
                          {a.competitor_share_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-taco-sub">
                        {idID.format(a.unresolved_count)}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-taco-sub">
                        {idr(a.taco_value)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* ── C. Top TACO SKU ──────────────────────────────────────── */}
          <SectionCard
            title="Top TACO SKU"
            sub={
              topSkus
                ? `${topSkus.unmatched_count} item belum tercocokkan ke katalog`
                : undefined
            }
            headerRight={
              <select
                value={skuAreaFilter}
                onChange={(e) => setSkuAreaFilter(e.target.value)}
                className="h-[28px] text-[12px] border border-taco-border rounded-lg px-2 text-taco-text bg-white outline-none"
              >
                <option value="">Semua Area</option>
                {areaOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-taco-page border-b border-taco-border">
                    {[
                      "SKU",
                      "Kategori",
                      "Penetrasi Invoice",
                      "Rata-rata Qty",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 text-[10px] font-semibold text-taco-muted uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topSkusLoading ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-[13px] text-taco-muted"
                      >
                        Memuat…
                      </td>
                    </tr>
                  ) : !topSkus || topSkus.top_skus.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-[13px] text-taco-muted"
                      >
                        Belum ada TACO SKU yang terverifikasi.
                      </td>
                    </tr>
                  ) : (
                    topSkus.top_skus.map((s, i) => (
                      <tr
                        key={s.sku_id}
                        className="border-b border-taco-divider last:border-0"
                      >
                        <td className="px-4 py-2.5 text-[13px] font-medium text-taco-text">
                          <span className="inline-flex items-center gap-2">
                            <span className="text-[11px] text-taco-muted font-mono w-5 text-right">
                              {i + 1}
                            </span>
                            <span className="flex flex-col">
                              <span>{s.sku_name}</span>
                              {s.sku_code && (
                                <span className="text-[11px] text-taco-muted font-mono">
                                  {s.sku_code}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {s.catalog_category ? (
                            <span className="text-[11px] bg-taco-page text-taco-sub px-2 py-0.5 rounded-full">
                              {s.catalog_category}
                            </span>
                          ) : (
                            <span className="text-[11px] text-taco-muted">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[13px] font-semibold text-taco-text">
                            {s.invoice_count}
                          </span>
                          <span className="text-[11px] text-taco-muted ml-1">
                            dari {topSkus.total_invoices} invoice
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-taco-sub">
                          {s.avg_qty_per_invoice.toFixed(1)}
                          <span className="text-[11px] text-taco-muted ml-0.5">
                            /inv
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* ── D. Sinyal Kompetitor ─────────────────────────────────── */}
          <SectionCard
            title="Sinyal Kompetitor"
            sub="Merek kompetitor yang muncul berhadapan dengan TACO dan seberapa kuat, per wilayah. Terisi dari baris invoice yang ditandai admin sebagai merek kompetitor saat resolusi."
          >
            {loading ? (
              <div className="px-5 py-8 text-center text-[13px] text-taco-muted">
                Memuat…
              </div>
            ) : namedCompetitorAreas.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-taco-muted">
                Belum ada merek kompetitor yang ditandai. Tandai baris invoice
                sebagai merek kompetitor saat resolusi agar muncul di sini.
              </div>
            ) : (
              <div className="divide-y divide-taco-divider">
                {namedCompetitorAreas.map((a, i) => (
                  <div key={a.area_id ?? i} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-semibold text-taco-text">
                        {a.area_name}
                      </span>
                      <span
                        className="text-[13px] font-bold"
                        style={{
                          color: a.competitor_pct > 15 ? COMP_RED : "#717171",
                        }}
                      >
                        {a.competitor_pct.toFixed(1)}% kompetitor
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {a.top_brands.map((b) => (
                        <span
                          key={b.brand_name}
                          className="text-[11px] bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full"
                        >
                          {b.brand_name} · {idr(b.value)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── Area Drill-Down Drawer ─────────────────────────────────────── */}
      <DrillDrawer
        open={drillAreaId !== null}
        areaName={drillAreaName}
        data={drillData}
        loading={drillLoading}
        onClose={closeDrill}
      />

      {/* ── AI Insight Modal (single Generate button) ──────────────────── */}
      <AiInsightModal
        open={insightModalOpen}
        onOpenChange={setInsightModalOpen}
        insight={insight}
        loading={false}
        period={period}
        onRegenerate={generateInsight}
        regenerating={insightGenerating}
      />
    </>
  );
}
