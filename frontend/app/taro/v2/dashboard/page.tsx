"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import {
  getDashboardRecap,
  getDashboardTrending,
  getDashboardAiInsight,
  unwrapList,
  unwrapOne,
} from "@/lib/v2/api";
import type {
  DashboardRecapV2,
  TrendingItemV2,
  AiInsightV2,
} from "@/lib/v2/types";
import {
  MOCK_RECAP,
  MOCK_TRENDING,
  MOCK_AI_INSIGHT,
} from "../_components/mockData";
import { AiInsightCard } from "../_components/AiInsightCard";
import { V2PageHeader } from "../_components/V2Tabs";
import { Badge } from "../../../admin/_components/CrudShell";

/** Categorical area palette — greens/blues/teals/greys. NO orange (reserved
 *  for primary CTAs), NO competitor-red semantics (these are areas, not rivals). */
const AREA_COLORS = ["#1D9E75", "#2563EB", "#0E7490", "#7C3AED", "#64748B", "#0891B2"];

const PERIODS: { value: string; label: string }[] = [
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
  { value: "90d", label: "90 hari" },
];

const idID = new Intl.NumberFormat("id-ID");

function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-taco-border rounded-xl p-4">
      <div className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider">
        {label}
      </div>
      <div className="text-[24px] font-bold text-taco-text leading-tight mt-1">
        {value}
      </div>
      {hint && <div className="text-[12px] text-taco-sub mt-0.5">{hint}</div>}
    </div>
  );
}

function DeltaChip({ pct }: { pct?: number | null }) {
  if (pct === null || pct === undefined)
    return <span className="text-[12px] text-taco-muted">—</span>;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[12px] font-semibold ${
        up ? "text-taco-success" : "text-taco-error"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function DashboardV2Page() {
  const [period, setPeriod] = useState("30d");
  const [trendingArea, setTrendingArea] = useState("");
  const [recap, setRecap] = useState<DashboardRecapV2 | null>(null);
  const [trending, setTrending] = useState<TrendingItemV2[]>([]);
  const [insight, setInsight] = useState<AiInsightV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);

  const fetchInsight = useCallback(async () => {
    setInsightLoading(true);
    try {
      const res = await getDashboardAiInsight({ period });
      setInsight(unwrapOne<AiInsightV2>(res.data));
    } catch {
      setInsight(MOCK_AI_INSIGHT);
    } finally {
      setInsightLoading(false);
    }
  }, [period]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, tRes] = await Promise.all([
        getDashboardRecap({ period }),
        getDashboardTrending({ period, area: trendingArea || undefined }),
      ]);
      const r = unwrapOne<DashboardRecapV2>(rRes.data);
      setRecap(r ?? MOCK_RECAP);
      setTrending(unwrapList<TrendingItemV2>(tRes.data));
      setUsingMock(false);
    } catch {
      setRecap(MOCK_RECAP);
      setTrending(MOCK_TRENDING);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, [period, trendingArea]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useEffect(() => {
    fetchInsight();
  }, [fetchInsight]);

  const byArea = recap?.by_area ?? [];
  const series = recap?.qty_over_time ?? [];
  const totals = recap?.totals;

  // Area filter value is the canonical area_id (the live `?area=` param is a
  // UUID per Mortar's DTO). Client-side filtering still runs so the toggle works
  // on mock too — mock trending rows carry only area_name, so match on either.
  const selectedAreaName = byArea.find(
    (a) => a.area_id === trendingArea
  )?.area_name;
  const trendingFiltered = useMemo(() => {
    if (!trendingArea) return trending;
    return trending.filter(
      (t) =>
        t.area_id === trendingArea ||
        (selectedAreaName != null && t.area_name === selectedAreaName)
    );
  }, [trending, trendingArea, selectedAreaName]);

  // Area options derived from recap rows: value = area_id (UUID for the live
  // filter param), label = area_name.
  const areaOptions = byArea.map((a) => ({
    id: a.area_id,
    name: a.area_name,
  }));

  return (
    <div className="space-y-6">
      <V2PageHeader
        title="Dashboard Permintaan Pasar"
        description="Rekap item tercatat per area dan kuantitas terjual sepanjang waktu — untuk memahami permintaan pasar TACO."
        actions={
          <div className="flex items-center gap-2">
            {usingMock && <Badge tone="warn">Data demo — BE belum siap</Badge>}
            <div className="flex items-center gap-1 bg-white border border-taco-border rounded-lg p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`h-[30px] px-3 rounded-md text-[12px] font-semibold transition-colors ${
                    period === p.value
                      ? "bg-taco-text text-white"
                      : "text-taco-sub hover:text-taco-text"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Total Item" value={totals ? idID.format(totals.total_items) : "—"} />
        <KpiTile label="Total Kuantitas" value={totals ? idID.format(totals.total_qty) : "—"} />
        <KpiTile label="Total Invoice" value={totals ? idID.format(totals.total_invoices) : "—"} />
        <KpiTile label="Area Aktif" value={totals ? String(totals.active_areas) : "—"} />
      </div>

      {/* AI insight — centerpiece, full width */}
      <AiInsightCard
        insight={insight}
        loading={insightLoading}
        period={PERIODS.find((p) => p.value === period)?.label ?? period}
        onRegenerate={fetchInsight}
        regenerating={insightLoading}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Items logged split by area */}
        <div className="bg-white border border-taco-border rounded-xl p-5">
          <h2 className="text-[15px] font-semibold text-taco-text mb-0.5">
            Item Tercatat per Area
          </h2>
          <p className="text-[13px] text-taco-sub mb-4">
            Jumlah item yang dicatat tim Taro, dibagi per area.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={byArea}
              layout="vertical"
              margin={{ left: 8, right: 16 }}
            >
              <CartesianGrid horizontal={false} stroke="#F0F0F0" />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#717171" }} />
              <YAxis
                type="category"
                dataKey="area_name"
                width={110}
                tick={{ fontSize: 12, fill: "#1A1A1A" }}
              />
              <Tooltip formatter={(v) => idID.format(Number(v))} />
              <Bar dataKey="items_logged" name="Item" radius={[0, 4, 4, 0]}>
                {byArea.map((_, i) => (
                  <Cell key={i} fill={AREA_COLORS[i % AREA_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Quantity sold over time */}
        <div className="bg-white border border-taco-border rounded-xl p-5">
          <h2 className="text-[15px] font-semibold text-taco-text mb-0.5">
            Kuantitas Terjual dari Waktu ke Waktu
          </h2>
          <p className="text-[13px] text-taco-sub mb-4">
            Total kuantitas terjual per periode.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series} margin={{ left: 0, right: 8 }}>
              <defs>
                <linearGradient id="qtyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1D9E75" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#1D9E75" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: "#717171" }} />
              <YAxis
                tick={{ fontSize: 12, fill: "#717171" }}
                tickFormatter={(v) => idID.format(Number(v))}
              />
              <Tooltip formatter={(v) => idID.format(Number(v))} />
              <Area
                type="monotone"
                dataKey="qty"
                name="Kuantitas"
                stroke="#1D9E75"
                strokeWidth={2.5}
                fill="url(#qtyFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Area recap table with deltas */}
      <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-taco-divider">
          <h2 className="text-[15px] font-semibold text-taco-text">
            Rekap per Area
          </h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-taco-page border-b border-taco-border">
              {["Area", "Item Tercatat", "Kuantitas Terjual", "Perubahan"].map(
                (c) => (
                  <th
                    key={c}
                    className="text-left px-5 py-2.5 text-[11px] font-semibold text-taco-muted uppercase tracking-wider"
                  >
                    {c}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {byArea.map((a, i) => (
              <tr
                key={a.area_id}
                className="border-b border-taco-divider last:border-0"
              >
                <td className="px-5 py-3 text-[13px] font-medium text-taco-text">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: AREA_COLORS[i % AREA_COLORS.length] }}
                    />
                    {a.area_name}
                  </span>
                </td>
                <td className="px-5 py-3 text-[13px] text-taco-sub">
                  {idID.format(a.items_logged)}
                </td>
                <td className="px-5 py-3 text-[13px] text-taco-sub">
                  {idID.format(a.qty_sold)}
                </td>
                <td className="px-5 py-3">
                  <DeltaChip pct={a.delta_pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top trending per area */}
      <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-taco-divider flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-[15px] font-semibold text-taco-text">
            Item Trending Teratas{" "}
            {trendingArea ? `· ${selectedAreaName ?? ""}` : "· Semua Area"}
          </h2>
          <select
            value={trendingArea}
            onChange={(e) => setTrendingArea(e.target.value)}
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
        <table className="w-full">
          <thead>
            <tr className="bg-taco-page border-b border-taco-border">
              {["#", "Item", "Area", "Kuantitas", "Tren"].map((c) => (
                <th
                  key={c}
                  className="text-left px-5 py-2.5 text-[11px] font-semibold text-taco-muted uppercase tracking-wider"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-taco-muted">
                  Memuat…
                </td>
              </tr>
            ) : trendingFiltered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-taco-muted">
                  Belum ada data trending untuk pilihan ini.
                </td>
              </tr>
            ) : (
              trendingFiltered.map((t, i) => (
                <tr
                  key={`${t.sku_code ?? t.name}-${i}`}
                  className="border-b border-taco-divider last:border-0"
                >
                  <td className="px-5 py-3 text-[13px] font-semibold text-taco-muted">
                    {t.rank ?? i + 1}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-taco-text">
                    <div className="font-medium">{t.name}</div>
                    {t.sku_code && (
                      <div className="text-[11px] text-taco-muted font-mono">
                        {t.sku_code}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-taco-sub">
                    {t.area_name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-taco-sub">
                    {idID.format(t.qty_sold)}
                  </td>
                  <td className="px-5 py-3">
                    <DeltaChip pct={t.trend_pct} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
