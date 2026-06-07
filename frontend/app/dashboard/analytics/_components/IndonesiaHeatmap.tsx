"use client";

import { useEffect, useMemo, useState } from "react";
import { getHeatmap, HeatmapMetric, HeatmapRegion } from "@/lib/api";

const REGIONS = [
  { id: "sumatera", name: "Sumatera" },
  { id: "jawa", name: "Jawa" },
  { id: "bali_ntt", name: "Bali / NTT" },
  { id: "kalimantan", name: "Kalimantan" },
  { id: "sulawesi", name: "Sulawesi" },
  { id: "maluku", name: "Maluku" },
  { id: "papua", name: "Papua" },
];

// Simplified Indonesia silhouettes — one path per island group. Geometry is
// approximate but recognisable left-to-right Sumatera → Papua.
const PATHS: Record<string, string> = {
  sumatera:
    "M40 110 L90 60 L130 70 L150 110 L130 170 L110 210 L80 240 L60 200 L50 160 Z",
  jawa:
    "M170 200 L260 175 L340 180 L400 200 L380 230 L300 235 L210 230 L170 220 Z",
  bali_ntt:
    "M420 215 L450 205 L490 215 L530 220 L555 215 L545 240 L490 240 L450 235 Z",
  kalimantan:
    "M210 90 L280 70 L350 90 L370 150 L330 200 L280 180 L240 150 Z",
  sulawesi:
    "M395 90 L440 70 L470 100 L455 140 L490 150 L500 200 L455 200 L450 160 L420 155 L405 140 Z",
  maluku:
    "M540 110 L590 100 L605 140 L585 180 L555 175 L535 150 Z",
  papua:
    "M630 80 L730 75 L780 100 L790 150 L760 200 L690 200 L650 170 L620 130 Z",
};

const METRIC_LABEL: Record<HeatmapMetric, string> = {
  visits: "Kunjungan",
  taco_price: "Harga TACO (rata-rata)",
  competitor_activity: "Aktivitas Kompetitor",
};

const METRIC_UNIT: Record<HeatmapMetric, string> = {
  visits: "kunjungan",
  taco_price: "indeks",
  competitor_activity: "sinyal",
};

// Mock fallback when /api/analytics/heatmap is not yet served by P1.
function mockHeatmap(metric: HeatmapMetric): HeatmapRegion[] {
  const seeds: Record<HeatmapMetric, number[]> = {
    visits: [128, 247, 41, 62, 38, 12, 18],
    taco_price: [92, 100, 88, 84, 82, 78, 76],
    competitor_activity: [87, 134, 22, 31, 18, 6, 9],
  };
  return REGIONS.map((r, i) => ({
    id: r.id,
    name: r.name,
    value: seeds[metric][i] ?? 0,
    unit: METRIC_UNIT[metric],
  }));
}

function fill(value: number, max: number, hasData: boolean) {
  if (!hasData) return "#E5E5E5";
  if (max === 0) return "#E5E5E5";
  const t = Math.max(0, Math.min(1, value / max));
  // Green gradient #E6F7F2 → #1D9E75
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = lerp(0xe6, 0x1d);
  const g = lerp(0xf7, 0x9e);
  const b = lerp(0xf2, 0x75);
  return `rgb(${r},${g},${b})`;
}

function formatValue(metric: HeatmapMetric, v: number) {
  if (metric === "taco_price") return `${v}`;
  return new Intl.NumberFormat("id-ID").format(v);
}

export function IndonesiaHeatmap() {
  const [metric, setMetric] = useState<HeatmapMetric>("visits");
  const [regions, setRegions] = useState<HeatmapRegion[]>(() =>
    mockHeatmap("visits")
  );
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHeatmap(metric)
      .then((res) => {
        if (cancelled) return;
        const body = res.data as unknown as
          | { data?: HeatmapRegion[] }
          | HeatmapRegion[];
        const list = Array.isArray(body) ? body : body?.data ?? [];
        if (list.length) setRegions(list);
        else setRegions(mockHeatmap(metric));
      })
      .catch(() => {
        if (!cancelled) setRegions(mockHeatmap(metric));
      });
    return () => {
      cancelled = true;
    };
  }, [metric]);

  const byId = useMemo(() => {
    const map = new Map<string, HeatmapRegion>();
    regions.forEach((r) => map.set(r.id, r));
    return map;
  }, [regions]);

  const max = useMemo(() => regions.reduce((m, r) => Math.max(m, r.value), 0), [
    regions,
  ]);

  const ranked = useMemo(
    () =>
      [...regions].sort((a, b) =>
        metric === "taco_price"
          ? // For price index, higher = stronger position, so still sort desc
            b.value - a.value
          : b.value - a.value
      ),
    [regions, metric]
  );

  const top5 = ranked.slice(0, 5);
  const bottom5 = [...ranked].reverse().slice(0, 5);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0F0F0] flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold text-[#1A1A1A]">
            Peta Sebaran Indonesia
          </h2>
          <p className="text-[13px] text-[#717171] mt-0.5">
            7 wilayah · Metrik: {METRIC_LABEL[metric]}
          </p>
        </div>
        <div
          className="flex gap-2 flex-wrap"
          role="tablist"
          aria-label="Metrik heatmap"
        >
          {(["visits", "taco_price", "competitor_activity"] as HeatmapMetric[]).map(
            (m) => {
              const active = metric === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMetric(m)}
                  className={
                    "h-[32px] px-3.5 rounded-full text-[13px] font-medium border transition-colors " +
                    (active
                      ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                      : "bg-white text-[#717171] border-[#E5E5E5] hover:text-[#1A1A1A]")
                  }
                >
                  {METRIC_LABEL[m]}
                </button>
              );
            }
          )}
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="relative">
          <svg
            viewBox="0 0 820 280"
            className="w-full h-auto"
            role="img"
            aria-label={`Peta Indonesia, metrik ${METRIC_LABEL[metric]}`}
          >
            <rect width="820" height="280" fill="#FAFAFA" rx="8" />
            {REGIONS.map((r) => {
              const region = byId.get(r.id);
              const value = region?.value ?? 0;
              const hasData = !!region && region.value > 0;
              const isHover = hover === r.id;
              return (
                <g key={r.id}>
                  <path
                    d={PATHS[r.id]}
                    fill={fill(value, max, hasData)}
                    stroke={isHover ? "#1A1A1A" : "#FFFFFF"}
                    strokeWidth={isHover ? 1.8 : 1.2}
                    onMouseEnter={() => setHover(r.id)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: "pointer", transition: "stroke 0.15s" }}
                  />
                </g>
              );
            })}
            {REGIONS.map((r) => {
              // Approximate label centroids
              const centers: Record<string, [number, number]> = {
                sumatera: [85, 165],
                jawa: [285, 205],
                bali_ntt: [485, 225],
                kalimantan: [290, 130],
                sulawesi: [450, 145],
                maluku: [570, 145],
                papua: [705, 145],
              };
              const [cx, cy] = centers[r.id];
              return (
                <text
                  key={r.id + "-l"}
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="#1A1A1A"
                  pointerEvents="none"
                >
                  {r.name}
                </text>
              );
            })}
          </svg>
          {hover && (
            <div
              className="absolute top-3 right-3 bg-white border border-[#E5E5E5] rounded-lg shadow-md px-3 py-2 text-[13px]"
              role="status"
            >
              <div className="font-semibold text-[#1A1A1A]">
                {byId.get(hover)?.name}
              </div>
              <div className="text-[#717171]">
                {METRIC_LABEL[metric]}:{" "}
                <span className="font-medium text-[#1A1A1A]">
                  {formatValue(metric, byId.get(hover)?.value ?? 0)}
                </span>{" "}
                {METRIC_UNIT[metric]}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          <RankTable
            title={`Top 5 Wilayah · ${METRIC_LABEL[metric]}`}
            rows={top5}
            metric={metric}
            tone="success"
          />
          <RankTable
            title={`Bottom 5 Wilayah · ${METRIC_LABEL[metric]}`}
            rows={bottom5}
            metric={metric}
            tone="muted"
          />
        </div>
      </div>
    </div>
  );
}

function RankTable({
  title,
  rows,
  metric,
  tone,
}: {
  title: string;
  rows: HeatmapRegion[];
  metric: HeatmapMetric;
  tone: "success" | "muted";
}) {
  const accent = tone === "success" ? "text-[#1D9E75]" : "text-[#ADADAD]";
  return (
    <div className="border border-[#E5E5E5] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-[#F7F7F7] border-b border-[#F0F0F0] text-[12px] font-semibold text-[#717171] uppercase tracking-wide">
        {title}
      </div>
      <table className="w-full">
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id + i}
              className="border-b border-[#F0F0F0] last:border-0"
            >
              <td
                className={`px-4 py-2.5 text-[13px] font-semibold w-10 ${accent}`}
              >
                #{i + 1}
              </td>
              <td className="px-1 py-2.5 text-[14px] text-[#1A1A1A]">
                {r.name}
              </td>
              <td className="px-4 py-2.5 text-right text-[14px] font-medium text-[#1A1A1A]">
                {formatValue(metric, r.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
