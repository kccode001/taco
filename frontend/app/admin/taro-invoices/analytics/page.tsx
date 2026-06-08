"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getRegionAreas,
  getTaroAnalytics,
  type RegionArea,
  type TaroAnalytics,
  type TaroRegionPriceExtremeRow,
  type TaroRegionsSummaryRow,
} from "@/lib/api";
import { TableHeader } from "../../_components/CrudShell";
import { ChevronDownIcon, MapIcon } from "../../_components/icons";
import {
  MOCK_ANALYTICS,
  MOCK_REGION_AREAS,
  formatIdr,
} from "../_components/mockData";

/** 5-7 distinguishable hues drawn from the taco-adjacent palette — used for
 *  multi-line regional series only. Avoids rainbow + reserves orange for KPIs. */
const REGION_PALETTE = [
  "#1A1A1A", // text — anchor series
  "#1D9E75", // success green
  "#4F8BD6", // info blue
  "#7C5BBC", // muted violet
  "#E07B00", // warning amber
  "#9C7E55", // bronze
  "#5C7080", // slate
];

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`bg-white border rounded-xl p-5 ${
        accent ? "border-taco-accent" : "border-taco-border"
      }`}
    >
      <div className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`text-[24px] font-bold mt-2 leading-tight ${
          accent ? "text-taco-accent" : "text-taco-text"
        }`}
      >
        {value}
      </div>
      {hint && <div className="text-[12px] text-taco-sub mt-1">{hint}</div>}
    </div>
  );
}

/** Horizontal bar chart for region volumes (top 10 + "Lainnya"). */
function RegionVolumeBars({ data }: { data: TaroRegionsSummaryRow[] }) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.invoice_count - a.invoice_count),
    [data]
  );
  const top = sorted.slice(0, 10);
  const rest = sorted.slice(10);
  const otherCount = rest.reduce((s, r) => s + r.invoice_count, 0);
  const all = [
    ...top.map((r) => ({
      key: r.region.id ?? "__tanpa__",
      label: r.region.display_path,
      count: r.invoice_count,
    })),
    ...(otherCount > 0
      ? [
          {
            key: "__other__",
            label: `Lainnya (${rest.length} wilayah)`,
            count: otherCount,
          },
        ]
      : []),
  ];
  const max = Math.max(...all.map((r) => r.count), 1);
  const total = all.reduce((s, r) => s + r.count, 0);
  return (
    <div className="space-y-2.5">
      {all.map((r) => {
        const pct = total > 0 ? (r.count / total) * 100 : 0;
        return (
          <div key={r.key} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 text-[12px] mb-1">
                <span className="text-taco-text truncate">{r.label}</span>
                <span className="text-taco-muted whitespace-nowrap">
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-taco-page rounded-full overflow-hidden">
                <div
                  className="h-full bg-taco-text transition-all"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-[13px] font-semibold text-taco-text w-10 text-right">
              {r.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Multi-line trend per region. BE shape: per-region rows each with
 *  `months: [{ month, invoices }]`. We invert into a per-month axis and draw
 *  one polyline per region. */
function RegionMonthlyTrend({
  data,
  showAll,
}: {
  data: NonNullable<TaroAnalytics["region_monthly"]>;
  showAll: boolean;
}) {
  const w = 640;
  const h = 220;
  const pad = { l: 36, r: 16, t: 18, b: 32 };

  // Sort regions by total invoices desc; take top 5 unless showAll.
  const ranked = useMemo(() => {
    const withTotals = data.map((row) => ({
      row,
      total: row.months.reduce((s, m) => s + (m.invoices ?? 0), 0),
    }));
    withTotals.sort((a, b) => b.total - a.total);
    const slice = showAll ? withTotals : withTotals.slice(0, 5);
    return slice.map((w) => w.row);
  }, [data, showAll]);

  // Union of months in display order — preserve BE order (oldest → newest).
  const monthsAxis = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const r of ranked) {
      for (const m of r.months) {
        if (!seen.has(m.month)) {
          seen.add(m.month);
          list.push(m.month);
        }
      }
    }
    return list;
  }, [ranked]);

  const maxVal = useMemo(() => {
    let m = 1;
    for (const r of ranked) {
      for (const pt of r.months) if (pt.invoices > m) m = pt.invoices;
    }
    return m;
  }, [ranked]);

  const stepX =
    monthsAxis.length > 1
      ? (w - pad.l - pad.r) / (monthsAxis.length - 1)
      : 0;
  const yFor = (v: number) =>
    pad.t + (h - pad.t - pad.b) * (1 - v / maxVal);

  if (ranked.length === 0 || monthsAxis.length === 0) {
    return (
      <div className="text-[12px] text-taco-muted py-6 text-center">
        Belum ada data tren bulanan.
      </div>
    );
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-[220px]"
        role="img"
        aria-label="Tren bulanan per region"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.t + (h - pad.t - pad.b) * t;
          return (
            <line
              key={t}
              x1={pad.l}
              x2={w - pad.r}
              y1={y}
              y2={y}
              stroke="#F0F0F0"
              strokeWidth={1}
            />
          );
        })}
        {ranked.map((r, idx) => {
          const color = REGION_PALETTE[idx % REGION_PALETTE.length];
          const monthMap = new Map<string, number>();
          for (const m of r.months) monthMap.set(m.month, m.invoices);
          const pts = monthsAxis.map((mo, i) => ({
            x: pad.l + i * stepX,
            y: yFor(monthMap.get(mo) ?? 0),
            v: monthMap.get(mo) ?? 0,
          }));
          const path = pts
            .map(
              (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
            )
            .join(" ");
          return (
            <g key={r.region.id ?? "tanpa"}>
              <path d={path} fill="none" stroke={color} strokeWidth={2} />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.8} fill={color} />
              ))}
            </g>
          );
        })}
        {monthsAxis.map((m, i) => (
          <text
            key={m}
            x={pad.l + i * stepX}
            y={h - 10}
            textAnchor="middle"
            fontSize="11"
            fill="#717171"
          >
            {m}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-3 mt-3">
        {ranked.map((r, idx) => (
          <div
            key={r.region.id ?? "tanpa"}
            className="flex items-center gap-1.5 text-[11px]"
          >
            <span
              className="w-3 h-1.5 rounded-sm"
              style={{ background: REGION_PALETTE[idx % REGION_PALETTE.length] }}
            />
            <span className="text-taco-sub">{r.region.display_path}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pivot Core's two-row min/max emit into a single "spread" row per SKU. */
interface PivotedExtreme {
  sku_code: string;
  sku_name: string;
  min_region: string;
  min_price: number;
  max_region: string;
  max_price: number;
  spread: number;
}

function pivotPriceExtremes(rows: TaroRegionPriceExtremeRow[]): PivotedExtreme[] {
  const map = new Map<
    string,
    {
      sku_code: string;
      sku_name: string;
      min_region?: string;
      min_price?: number;
      max_region?: string;
      max_price?: number;
    }
  >();
  for (const r of rows) {
    const key = r.sku.code;
    const cur =
      map.get(key) ??
      ({ sku_code: r.sku.code, sku_name: r.sku.name } as {
        sku_code: string;
        sku_name: string;
        min_region?: string;
        min_price?: number;
        max_region?: string;
        max_price?: number;
      });
    if (r.is_min) {
      cur.min_region = r.region.display_path;
      cur.min_price = r.avg_price;
    }
    if (r.is_max) {
      cur.max_region = r.region.display_path;
      cur.max_price = r.avg_price;
    }
    map.set(key, cur);
  }
  const out: PivotedExtreme[] = [];
  for (const c of Array.from(map.values())) {
    if (
      c.min_price != null &&
      c.max_price != null &&
      c.min_region &&
      c.max_region
    ) {
      out.push({
        sku_code: c.sku_code,
        sku_name: c.sku_name,
        min_region: c.min_region,
        min_price: c.min_price,
        max_region: c.max_region,
        max_price: c.max_price,
        spread: c.max_price - c.min_price,
      });
    }
  }
  out.sort((a, b) => b.spread - a.spread);
  return out.slice(0, 10);
}

export default function TaroAnalyticsPage() {
  const [data, setData] = useState<TaroAnalytics | null>(null);
  const [regions, setRegions] = useState<RegionArea[]>([]);
  const [regionFilter, setRegionFilter] = useState<string | "all">("all");
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const regionMenuRef = useRef<HTMLDivElement>(null);
  const [showAllTrend, setShowAllTrend] = useState(false);
  const [globalOpen, setGlobalOpen] = useState(false);

  // Load regions for the filter chip dropdown.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getRegionAreas();
        const rdata =
          ((res.data as { data?: RegionArea[] })?.data ??
            (res.data as RegionArea[])) ?? [];
        if (alive) setRegions(rdata.length ? rdata : MOCK_REGION_AREAS);
      } catch {
        if (alive) setRegions(MOCK_REGION_AREAS);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load analytics — scoped by region when set. BE returns processed_count /
  // needs_review_count keys; normalize into the FE shape.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getTaroAnalytics(
          regionFilter === "all" ? undefined : { region_id: regionFilter }
        );
        const raw = res.data as unknown as Record<string, unknown> | null;
        if (!alive) return;
        if (!raw || raw.total_invoices == null) {
          setData(scopeMockToRegion(MOCK_ANALYTICS, regionFilter));
          return;
        }
        const lowSrc =
          (raw.low_confidence_skus as Array<Record<string, unknown>> | undefined) ?? [];
        const topSrc =
          (raw.top_uploaded_skus as Array<Record<string, unknown>> | undefined) ?? [];
        const normalized: TaroAnalytics = {
          total_invoices: Number(raw.total_invoices) || 0,
          processed: Number(raw.processed ?? raw.processed_count) || 0,
          needs_review: Number(raw.needs_review ?? raw.needs_review_count) || 0,
          avg_confidence: Number(raw.avg_confidence) || 0,
          monthly_volume:
            (raw.monthly_volume as TaroAnalytics["monthly_volume"]) ?? [],
          top_uploaded_skus: topSrc.map((s) => ({
            sku_code: String(s.sku_code ?? ""),
            sku_name: String(s.sku_name ?? ""),
            count: Number(s.count) || 0,
          })),
          low_confidence_skus: lowSrc.map((s) => ({
            sku_code: String(s.sku_code ?? ""),
            sku_name: String(s.sku_name ?? ""),
            avg_confidence: Number(s.avg_confidence) || 0,
            samples: Number(s.samples ?? s.line_count) || 0,
          })),
          regions_summary:
            (raw.regions_summary as TaroAnalytics["regions_summary"]) ??
            scopeMockToRegion(MOCK_ANALYTICS, regionFilter).regions_summary,
          region_monthly:
            (raw.region_monthly as TaroAnalytics["region_monthly"]) ??
            scopeMockToRegion(MOCK_ANALYTICS, regionFilter).region_monthly,
          top_skus_by_region:
            (raw.top_skus_by_region as TaroAnalytics["top_skus_by_region"]) ??
            scopeMockToRegion(MOCK_ANALYTICS, regionFilter).top_skus_by_region,
          region_price_extremes:
            (raw.region_price_extremes as TaroAnalytics["region_price_extremes"]) ??
            scopeMockToRegion(MOCK_ANALYTICS, regionFilter).region_price_extremes,
        };
        if (normalized.total_invoices === 0) {
          setData(scopeMockToRegion(MOCK_ANALYTICS, regionFilter));
        } else {
          setData(normalized);
        }
      } catch {
        if (alive) setData(scopeMockToRegion(MOCK_ANALYTICS, regionFilter));
      }
    })();
    return () => {
      alive = false;
    };
  }, [regionFilter]);

  useEffect(() => {
    if (!regionMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!regionMenuRef.current?.contains(e.target as Node)) {
        setRegionMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRegionMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [regionMenuOpen]);

  const regionMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) m.set(r.id, r.display_path);
    return m;
  }, [regions]);

  const regionsSummary = useMemo<TaroRegionsSummaryRow[]>(
    () => data?.regions_summary ?? [],
    [data?.regions_summary]
  );

  const pivotedExtremes = useMemo(
    () => pivotPriceExtremes(data?.region_price_extremes ?? []),
    [data?.region_price_extremes]
  );

  if (!data) {
    return <div className="text-[13px] text-taco-muted">Memuat analitik…</div>;
  }

  const processedPct = data.total_invoices
    ? Math.round((data.processed / data.total_invoices) * 100)
    : 0;

  const topSkusByRegion = (data.top_skus_by_region ?? []).slice(0, 3);

  const selectedRegionLabel =
    regionFilter === "all"
      ? "Semua Wilayah"
      : regionMap.get(regionFilter) ?? "Semua Wilayah";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-taco-text leading-tight">
            Analitik Taro Invoices
          </h1>
          <p className="text-[13px] text-taco-sub mt-1">
            Volume, kepercayaan OCR, dan SKU paling sering muncul — dianalisa per
            wilayah ASM.
          </p>
        </div>
      </div>

      {/* KPI tiles — only the AI confidence tile carries brand orange */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Invoice" value={String(data.total_invoices)} />
        <Kpi
          label="Sudah Diproses"
          value={String(data.processed)}
          hint={`${processedPct}% dari total`}
        />
        <Kpi label="Perlu Review" value={String(data.needs_review)} />
        <Kpi
          label="Rata-rata Kepercayaan AI"
          value={`${Math.round(data.avg_confidence * 100)}%`}
          accent
        />
      </div>

      {/* Region filter chip row */}
      <div className="bg-white border border-taco-border rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="text-[12px] font-semibold text-taco-muted uppercase tracking-wider">
          Filter Wilayah
        </div>
        <button
          type="button"
          onClick={() => setRegionFilter("all")}
          className={`h-[32px] px-3 rounded-full text-[12px] font-semibold border transition-colors ${
            regionFilter === "all"
              ? "bg-taco-text text-white border-taco-text"
              : "bg-white text-taco-sub border-taco-border hover:border-taco-text hover:text-taco-text"
          }`}
        >
          Semua Wilayah
        </button>
        <div ref={regionMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setRegionMenuOpen((v) => !v)}
            className={`h-[32px] pl-3 pr-2 inline-flex items-center gap-2 border rounded-full text-[12px] font-semibold transition-colors min-w-[200px] max-w-[280px] ${
              regionFilter !== "all"
                ? "bg-taco-text text-white border-taco-text"
                : regionMenuOpen
                ? "border-taco-text text-taco-text"
                : "bg-white text-taco-sub border-taco-border hover:border-taco-text hover:text-taco-text"
            }`}
          >
            <span className="flex-shrink-0">
              <MapIcon size={12} />
            </span>
            <span className="truncate flex-1 text-left">
              {regionFilter === "all" ? "Pilih wilayah…" : selectedRegionLabel}
            </span>
            <span className="flex-shrink-0">
              <ChevronDownIcon size={12} />
            </span>
          </button>
          {regionMenuOpen && (
            <div className="absolute z-30 mt-1.5 w-[300px] bg-white border border-taco-border rounded-lg shadow-lg overflow-hidden">
              <div className="max-h-[280px] overflow-y-auto">
                {regions.map((r) => {
                  const active = regionFilter === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setRegionFilter(r.id);
                        setRegionMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-[13px] hover:bg-taco-page ${
                        active
                          ? "bg-taco-page text-taco-text font-semibold"
                          : "text-taco-text"
                      }`}
                    >
                      {r.display_path}
                    </button>
                  );
                })}
              </div>
              <div className="px-3 py-2 border-t border-taco-divider text-[11px] text-taco-muted">
                {regions.length} wilayah ASM
              </div>
            </div>
          )}
        </div>
        {regionFilter !== "all" && (
          <span className="text-[11px] text-taco-muted">
            Semua panel difilter ke wilayah ini
          </span>
        )}
      </div>

      {/* Volume per Region */}
      <div className="bg-white border border-taco-border rounded-xl p-5">
        <div className="text-[14px] font-semibold text-taco-text mb-1">
          Volume Invoice per Wilayah
        </div>
        <div className="text-[12px] text-taco-muted mb-4">
          {regionsSummary.length} wilayah aktif · top 10 ditampilkan
        </div>
        {regionsSummary.length === 0 ? (
          <div className="text-[12px] text-taco-muted py-6 text-center">
            Belum ada data per wilayah.
          </div>
        ) : (
          <RegionVolumeBars data={regionsSummary} />
        )}
      </div>

      {/* Monthly trend per region */}
      <div className="bg-white border border-taco-border rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <div>
            <div className="text-[14px] font-semibold text-taco-text">
              Tren Bulanan per Wilayah
            </div>
            <div className="text-[12px] text-taco-muted mt-0.5">
              6 bulan terakhir · {showAllTrend ? "semua wilayah" : "top 5"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAllTrend((v) => !v)}
            className="h-[32px] px-3 rounded-full text-[12px] font-semibold border border-taco-border text-taco-sub hover:border-taco-text hover:text-taco-text"
          >
            {showAllTrend ? "Tampilkan Top 5" : "Tampilkan semua wilayah"}
          </button>
        </div>
        {data.region_monthly && data.region_monthly.length > 0 ? (
          <RegionMonthlyTrend
            data={data.region_monthly}
            showAll={showAllTrend}
          />
        ) : (
          <div className="text-[12px] text-taco-muted py-6 text-center">
            Belum ada data tren bulanan.
          </div>
        )}
      </div>

      {/* Top SKU per region */}
      <div className="bg-white border border-taco-border rounded-xl p-5">
        <div className="text-[14px] font-semibold text-taco-text mb-1">
          Top SKU per Wilayah
        </div>
        <div className="text-[12px] text-taco-muted mb-4">
          5 SKU paling sering muncul di 3 wilayah terbesar
        </div>
        {topSkusByRegion.length === 0 ? (
          <div className="text-[12px] text-taco-muted py-6 text-center">
            Belum ada data per wilayah.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topSkusByRegion.map((r) => (
              <div
                key={r.region.id ?? "tanpa"}
                className="border border-taco-divider rounded-lg p-4 bg-taco-page/40"
              >
                <div className="text-[12px] font-semibold text-taco-text truncate mb-3">
                  {r.region.display_path}
                </div>
                <ol className="space-y-2">
                  {r.top_skus.map((s, i) => (
                    <li
                      key={s.sku.code}
                      className="flex items-start gap-2 text-[12px]"
                    >
                      <span className="text-taco-muted font-mono w-4 flex-shrink-0">
                        {i + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-taco-text truncate">
                          {s.sku.name}
                        </div>
                        <div className="text-taco-muted font-mono text-[10px]">
                          {s.sku.code}
                        </div>
                      </div>
                      <span className="text-taco-text font-semibold flex-shrink-0">
                        {s.count}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Price extremes */}
      <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
        <div className="p-5 pb-3">
          <div className="text-[14px] font-semibold text-taco-text mb-1">
            Sebaran Harga per Wilayah
          </div>
          <div className="text-[12px] text-taco-muted">
            SKU dengan selisih harga terbesar antar-wilayah — kandidat arbitrase
            regional
          </div>
        </div>
        <table className="w-full">
          <TableHeader
            cols={["SKU", "Region Termurah", "Region Termahal", "Selisih"]}
          />
          <tbody>
            {pivotedExtremes.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-[12px] text-taco-muted"
                >
                  {regionFilter === "all"
                    ? "Belum ada data sebaran harga."
                    : "Sebaran harga tidak tersedia saat filter wilayah aktif."}
                </td>
              </tr>
            ) : (
              pivotedExtremes.map((s) => (
                <tr
                  key={s.sku_code}
                  className="border-b border-taco-divider last:border-0"
                >
                  <td className="px-4 py-2.5 text-[13px] text-taco-text max-w-[220px]">
                    <div className="font-mono text-[10px] text-taco-muted">
                      {s.sku_code}
                    </div>
                    <div className="truncate">{s.sku_name}</div>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-taco-text">
                    <div className="truncate max-w-[200px]">{s.min_region}</div>
                    <div className="text-[11px] text-taco-muted">
                      {formatIdr(s.min_price)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-taco-text">
                    <div className="truncate max-w-[200px]">{s.max_region}</div>
                    <div className="text-[11px] text-taco-muted">
                      {formatIdr(s.max_price)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] font-semibold text-taco-text whitespace-nowrap">
                    {formatIdr(s.spread)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Confidence per region */}
      <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
        <div className="p-5 pb-3">
          <div className="text-[14px] font-semibold text-taco-text mb-1">
            Kepercayaan OCR per Wilayah
          </div>
          <div className="text-[12px] text-taco-muted">
            Wilayah mana yang menghasilkan OCR paling bersih vs paling perlu
            review
          </div>
        </div>
        <table className="w-full">
          <TableHeader
            cols={["Wilayah", "Avg Confidence", "Needs Review Rate", "Invoice"]}
          />
          <tbody>
            {regionsSummary.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-[12px] text-taco-muted"
                >
                  Belum ada data per wilayah.
                </td>
              </tr>
            ) : (
              [...regionsSummary]
                .sort((a, b) => b.avg_confidence - a.avg_confidence)
                .map((r) => {
                  const conf = Math.round(r.avg_confidence * 100);
                  const review = Math.round(r.needs_review_rate * 100);
                  const confColor =
                    conf >= 85
                      ? "#1D9E75"
                      : conf >= 70
                      ? "#E07B00"
                      : "#D0342C";
                  return (
                    <tr
                      key={r.region.id ?? "tanpa"}
                      className="border-b border-taco-divider last:border-0"
                    >
                      <td className="px-4 py-2.5 text-[13px] text-taco-text max-w-[280px] truncate">
                        {r.region.display_path}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-taco-text whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: confColor }}
                          />
                          {conf}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-taco-text whitespace-nowrap">
                        {review}%
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-taco-sub whitespace-nowrap">
                        {r.invoice_count}
                      </td>
                    </tr>
                  );
                })
            )}
          </tbody>
        </table>
      </div>

      {/* Collapsible global SKU panels (de-emphasized) */}
      <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setGlobalOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-taco-page transition-colors"
        >
          <div>
            <div className="text-[14px] font-semibold text-taco-text">
              Detail Global (Lintas Wilayah)
            </div>
            <div className="text-[12px] text-taco-muted mt-0.5">
              Top SKU dan SKU dengan kepercayaan terendah — agregat semua wilayah
            </div>
          </div>
          <span
            className={`text-taco-muted transition-transform ${
              globalOpen ? "rotate-180" : ""
            }`}
          >
            <ChevronDownIcon size={16} />
          </span>
        </button>
        {globalOpen && (
          <div className="border-t border-taco-divider grid grid-cols-1 lg:grid-cols-2">
            <div className="p-5">
              <div className="text-[13px] font-semibold text-taco-text mb-1">
                Top 10 SKU paling sering muncul
              </div>
              <div className="text-[12px] text-taco-muted mb-4">
                Berdasarkan invoice 90 hari terakhir
              </div>
              <GlobalTopBars data={data.top_uploaded_skus} />
            </div>
            <div className="border-t lg:border-t-0 lg:border-l border-taco-divider">
              <div className="p-5 pb-3">
                <div className="text-[13px] font-semibold text-taco-text mb-1">
                  10 SKU dengan kepercayaan terendah
                </div>
                <div className="text-[12px] text-taco-muted">
                  Kandidat untuk sinonim baru atau pemurnian sampel
                </div>
              </div>
              <table className="w-full">
                <TableHeader cols={["Kode", "Nama", "Avg Conf.", "Sampel"]} />
                <tbody>
                  {data.low_confidence_skus.map((s) => (
                    <tr
                      key={s.sku_code}
                      className="border-b border-taco-divider last:border-0"
                    >
                      <td className="px-4 py-2 font-mono text-[11px] text-taco-muted whitespace-nowrap">
                        {s.sku_code}
                      </td>
                      <td className="px-4 py-2 text-[13px] text-taco-text max-w-[200px]">
                        <div className="truncate">{s.sku_name}</div>
                      </td>
                      <td className="px-4 py-2 text-[13px] text-taco-text whitespace-nowrap">
                        {Math.round(s.avg_confidence * 100)}%
                      </td>
                      <td className="px-4 py-2 text-[13px] text-taco-sub whitespace-nowrap">
                        {s.samples}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GlobalTopBars({
  data,
}: {
  data: TaroAnalytics["top_uploaded_skus"];
}) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.sku_code} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-taco-text truncate">
              <span className="font-mono text-[10px] text-taco-muted mr-2">
                {d.sku_code}
              </span>
              {d.sku_name}
            </div>
            <div className="h-1.5 bg-taco-page rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-taco-text"
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
          </div>
          <div className="text-[13px] font-semibold text-taco-text w-12 text-right">
            {d.count}
          </div>
        </div>
      ))}
    </div>
  );
}

/** When a region filter is active, narrow the mock dataset so the page still
 *  shows useful single-region content during the BE landing window. */
function scopeMockToRegion(
  mock: TaroAnalytics,
  regionFilter: string | "all"
): TaroAnalytics {
  if (regionFilter === "all") return mock;
  const summary = mock.regions_summary?.find(
    (r) => r.region.id === regionFilter
  );
  return {
    ...mock,
    total_invoices: summary?.invoice_count ?? 0,
    processed: summary ? Math.round(summary.invoice_count * 0.9) : 0,
    needs_review: summary
      ? Math.round(summary.invoice_count * summary.needs_review_rate)
      : 0,
    avg_confidence: summary?.avg_confidence ?? 0,
    regions_summary: summary ? [summary] : [],
    region_monthly: (mock.region_monthly ?? []).filter(
      (m) => m.region.id === regionFilter
    ),
    top_skus_by_region: (mock.top_skus_by_region ?? []).filter(
      (r) => r.region.id === regionFilter
    ),
    // Price extremes are cross-region — empty when scoped (mirrors BE).
    region_price_extremes: [],
  };
}
