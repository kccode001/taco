"use client";

import { useEffect, useState } from "react";
import {
  getTaroAnalytics,
  type TaroAnalytics,
  type TaroNonTacoProductRow,
  type TaroSkuRankedRow,
  type TaroSkuTrendingRow,
} from "@/lib/api";
import { formatIdr } from "../../admin/taro-invoices/_components/mockData";

/** Empty TaroAnalytics shell used while the dashboard is loading or when the
 *  BE returns an empty response. Replaces the legacy MOCK_ANALYTICS spread so
 *  zero-state numbers reflect reality instead of demo values. */
const EMPTY_ANALYTICS: TaroAnalytics = {
  total_invoices: 0,
  processed: 0,
  needs_review: 0,
  avg_confidence: 0,
  monthly_volume: [],
  top_uploaded_skus: [],
  low_confidence_skus: [],
};

/** Taro Dashboard — SKU intelligence focus.
 *  Answers: what's selling, what's growing, what's slow, what TACO doesn't
 *  have yet (potential competitor signals). */

/** BE rows use nested `sku: { code, name }`. Legacy mocks use flat fields.
 *  These helpers read either shape so the panels work with both. */
type Ranked = TaroSkuRankedRow;
type Trending = TaroSkuTrendingRow;
type NonTaco = TaroNonTacoProductRow;

function skuCode(r: { sku?: { code: string }; sku_code?: string }): string {
  return r.sku?.code ?? r.sku_code ?? "";
}
function skuName(r: { sku?: { name: string }; sku_name?: string }): string {
  return r.sku?.name ?? r.sku_name ?? "";
}
function vol(r: Ranked): number {
  return r.total_volume ?? r.volume ?? 0;
}
function trendingVol(r: Trending): number {
  return r.current_month_volume ?? r.volume ?? 0;
}
function nonTacoFreq(r: NonTaco): number {
  return r.occurrence_count ?? r.frequency ?? 0;
}
function closestSku(r: NonTaco): { code: string; name: string; similarity: number } | null {
  if (r.likely_taco_sku_match?.sku) {
    return {
      code: r.likely_taco_sku_match.sku.code,
      name: r.likely_taco_sku_match.sku.name,
      similarity:
        r.likely_taco_sku_match.similarity_score ??
        r.likely_taco_sku_match.similarity ??
        0,
    };
  }
  if (r.closest_taco_sku) return r.closest_taco_sku;
  return null;
}
function nonTacoRegions(r: NonTaco): { display_path: string; count: number }[] {
  if (Array.isArray(r.regions_seen_in)) {
    return r.regions_seen_in.map((x) => ({
      display_path: x.region?.display_path ?? "—",
      count: x.count,
    }));
  }
  if (Array.isArray(r.regions)) return r.regions;
  return [];
}

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

export default function TaroDashboardOverviewPage() {
  const [analytics, setAnalytics] = useState<TaroAnalytics | null>(null);
  const [topSkus, setTopSkus] = useState<TaroSkuRankedRow[]>([]);
  const [trendingSkus, setTrendingSkus] = useState<TaroSkuTrendingRow[]>([]);
  const [slowSkus, setSlowSkus] = useState<TaroSkuRankedRow[]>([]);
  const [nonTaco, setNonTaco] = useState<TaroNonTacoProductRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await getTaroAnalytics();
        const data = (res.data ?? {}) as TaroAnalytics &
          Record<string, unknown>;
        // BE emits `processed_count` / `needs_review_count` while the FE
        // historically read `processed` / `needs_review`. Normalize so KPI
        // tiles display real backend totals — including zeros after a wipe.
        const normalized: TaroAnalytics = {
          ...data,
          total_invoices: (data.total_invoices as number | undefined) ?? 0,
          processed:
            (data.processed as number | undefined) ??
            (data.processed_count as number | undefined) ??
            0,
          needs_review:
            (data.needs_review as number | undefined) ??
            (data.needs_review_count as number | undefined) ??
            0,
          avg_confidence: (data.avg_confidence as number | undefined) ?? 0,
          monthly_volume:
            (data.monthly_volume as TaroAnalytics["monthly_volume"]) ?? [],
          top_uploaded_skus:
            (data.top_uploaded_skus as TaroAnalytics["top_uploaded_skus"]) ?? [],
          low_confidence_skus:
            (data.low_confidence_skus as TaroAnalytics["low_confidence_skus"]) ?? [],
        };
        setAnalytics(normalized);

        // Pass through whatever BE returns. Empty arrays render real empty
        // states — no mock fallbacks pretending the catalog has data.
        setTopSkus(
          data.top_taco_skus && data.top_taco_skus.length
            ? data.top_taco_skus.slice(0, 10)
            : []
        );
        setTrendingSkus(
          data.trending_taco_skus && data.trending_taco_skus.length
            ? data.trending_taco_skus.slice(0, 10)
            : []
        );
        setSlowSkus(
          data.least_popular_taco_skus && data.least_popular_taco_skus.length
            ? data.least_popular_taco_skus.slice(0, 10)
            : []
        );
        setNonTaco(
          data.detected_non_taco_products && data.detected_non_taco_products.length
            ? data.detected_non_taco_products
            : []
        );
      } catch {
        // Network/BE error → treat as empty rather than faking data. Real
        // failures should be visible, not papered over with mocks.
        setAnalytics(EMPTY_ANALYTICS);
        setTopSkus([]);
        setTrendingSkus([]);
        setSlowSkus([]);
        setNonTaco([]);
      }
    })();
  }, []);

  const a = analytics ?? EMPTY_ANALYTICS;

  const trendingUp = trendingSkus.filter((s) => s.growth_pct > 0).sort((x, y) => y.growth_pct - x.growth_pct);
  const trendingDown = trendingSkus.filter((s) => s.growth_pct < 0).sort((x, y) => x.growth_pct - y.growth_pct);

  const topSkuMax = Math.max(1, ...topSkus.map((s) => vol(s)));
  const slowSkuMax = Math.max(1, ...slowSkus.map((s) => vol(s)));

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-bold text-taco-text leading-tight">
        Taro Dashboard
      </h1>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label="Total Invoice"
          value={(a.total_invoices ?? 0).toLocaleString("id-ID")}
          hint={`${a.processed ?? 0} diproses`}
          accent
        />
        <Kpi
          label="Perlu Review"
          value={(a.needs_review ?? 0).toLocaleString("id-ID")}
          hint="Confidence rendah / belum cocok"
        />
        <Kpi
          label="Rata-rata Kepercayaan"
          value={
            (a.avg_confidence ?? 0) > 0
              ? `${Math.round((a.avg_confidence ?? 0) * 100)}%`
              : "—"
          }
          hint="Akurasi OCR keseluruhan"
        />
        <Kpi
          label="SKU TACO Aktif"
          value={topSkus.length.toString()}
          hint="Punya volume di invoice terbaru"
        />
      </div>

      {/* Global empty-state banner — shown when there are zero invoices,
          which is the state right after a data wipe or on a fresh install. */}
      {(a.total_invoices ?? 0) === 0 && (
        <div className="bg-white border border-taco-border rounded-xl px-6 py-10 text-center">
          <div className="text-[15px] font-semibold text-taco-text mb-1">
            Belum ada data.
          </div>
          <div className="text-[13px] text-taco-sub max-w-[480px] mx-auto">
            Upload invoice pertama Anda dari aplikasi sales agent.
          </div>
        </div>
      )}

      {/* PANEL 1 — Top 10 TACO SKU Terpopuler */}
      <Panel
        title="Top 10 TACO SKU Terpopuler"
        subtitle="Ranking berdasarkan volume unit dari invoice masuk."
      >
        {topSkus.length === 0 ? (
          <EmptyState text="Belum ada SKU yang dipetakan" />
        ) : (
        <div className="space-y-2.5">
          {topSkus.map((s, idx) => {
            const v = vol(s);
            const pct = (v / topSkuMax) * 100;
            return (
              <div key={`${skuCode(s)}-${idx}`} className="flex items-center gap-3">
                <span className="text-[11px] text-taco-muted font-mono w-6 text-right">
                  #{idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 text-[12px] mb-1">
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] text-taco-muted truncate">
                        {skuCode(s)}
                      </div>
                      <div className="text-taco-text truncate font-medium">
                        {skuName(s)}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-[13px] text-taco-text font-semibold">
                        {v.toLocaleString("id-ID")} unit
                      </div>
                      {s.total_value !== undefined && (
                        <div className="text-[11px] text-taco-muted">
                          {formatIdr(s.total_value)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="h-2 bg-taco-page rounded-full overflow-hidden">
                    <div
                      className="h-full bg-taco-text transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PANEL 2 — Trending */}
        <Panel
          title="TACO SKU Trending Bulan Ini"
          subtitle="Pertumbuhan bulan-ke-bulan. Hijau = naik, merah = turun."
        >
          {trendingSkus.length === 0 ? (
            <EmptyState text="Belum ada data trending" />
          ) : (
            <div className="space-y-2">
              {trendingUp.slice(0, 5).map((s) => (
                <TrendingRow key={`up-${skuCode(s)}`} sku={s} />
              ))}
              {trendingDown.slice(0, 5).map((s) => (
                <TrendingRow key={`dn-${skuCode(s)}`} sku={s} />
              ))}
            </div>
          )}
        </Panel>

        {/* PANEL 3 — Slow Movers */}
        <Panel
          title="TACO SKU Kurang Diminati"
          subtitle="10 SKU dengan volume terendah — kandidat sales push."
        >
          {slowSkus.length === 0 ? (
            <EmptyState text="Belum ada data" />
          ) : (
          <div className="space-y-2.5">
            {slowSkus.map((s, idx) => {
              const v = vol(s);
              const pct = (v / slowSkuMax) * 100;
              return (
                <div key={`${skuCode(s)}-${idx}`} className="flex items-center gap-3">
                  <span className="text-[11px] text-taco-muted font-mono w-6 text-right">
                    #{idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 text-[12px] mb-1">
                      <span className="text-taco-text truncate">{skuName(s)}</span>
                      <span className="text-taco-muted whitespace-nowrap">
                        {v} unit
                      </span>
                    </div>
                    <div className="h-1.5 bg-taco-page rounded-full overflow-hidden">
                      <div
                        className="h-full bg-taco-sub"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </Panel>
      </div>

      {/* PANEL 4 — Detected non-TACO products (the "competitor radar") */}
      <Panel
        title="Produk Non-TACO Terdeteksi"
        subtitle="Raw OCR text yang tidak match SKU TACO tapi sering muncul. Bisa jadi produk kompetitor populer atau kandidat sinonim baru."
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-taco-page border-b border-taco-border">
                {["Raw Text", "Frekuensi", "Avg Harga", "Mirip TACO?", "Sebaran Wilayah"].map((c) => (
                  <th
                    key={c}
                    className="text-left px-4 py-2.5 text-[11px] font-semibold text-taco-muted uppercase tracking-wider"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nonTaco.map((row) => {
                const closest = closestSku(row);
                const regions = nonTacoRegions(row);
                const sim = closest?.similarity ?? 0;
                // BE may emit similarity as 0..1 (legacy) or 0..100 (new shape).
                // Normalize to fraction.
                const simFrac = sim > 1.5 ? sim / 100 : sim;
                return (
                  <tr
                    key={row.raw_text}
                    className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
                  >
                    <td className="px-4 py-3 text-[13px] text-taco-text max-w-[240px]">
                      <div className="truncate font-medium" title={row.raw_text}>
                        {row.raw_text}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap">
                      <span className="font-semibold">{nonTacoFreq(row)}</span>
                      <span className="text-taco-muted text-[11px] ml-1">x</span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap">
                      {formatIdr(row.avg_unit_price)}
                    </td>
                    <td className="px-4 py-3 max-w-[240px]">
                      {closest && simFrac >= 0.65 && simFrac <= 0.85 ? (
                        <div className="flex flex-col gap-1">
                          <div className="text-[12px] text-taco-text truncate">
                            {closest.code}
                            <span className="text-taco-muted ml-1.5">
                              ({Math.round(simFrac * 100)}%)
                            </span>
                          </div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#FFF5E6] text-taco-warning text-[10px] font-medium w-fit">
                            Pertimbangkan sinonim
                          </span>
                        </div>
                      ) : closest ? (
                        <div className="text-[12px] text-taco-sub truncate">
                          {closest.code}
                          <span className="text-taco-muted ml-1.5">
                            ({Math.round(simFrac * 100)}%)
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#FEE2E2] text-taco-error text-[10px] font-medium">
                          Kemungkinan kompetitor
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="flex flex-wrap gap-1">
                        {regions.slice(0, 3).map((r) => (
                          <span
                            key={r.display_path}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-taco-page border border-taco-border text-[10px] text-taco-sub"
                            title={r.display_path}
                          >
                            <span className="truncate max-w-[120px]">{r.display_path.split(" - ").pop()}</span>
                            <span className="text-taco-muted">{r.count}</span>
                          </span>
                        ))}
                        {regions.length > 3 && (
                          <span className="text-[10px] text-taco-muted self-center">
                            +{regions.length - 3} lain
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {nonTaco.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-taco-muted">
                    Belum ada produk non-TACO terdeteksi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-8 text-center text-[13px] text-taco-muted">{text}</div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-taco-border rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-[14px] font-semibold text-taco-text">{title}</h2>
        {subtitle && (
          <p className="text-[12px] text-taco-sub mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function TrendingRow({ sku }: { sku: TaroSkuTrendingRow }) {
  const up = sku.growth_pct >= 0;
  // BE emits integer percent (e.g. 48 = +48%, 9999 = from-zero sentinel).
  // Legacy mocks emit decimal fraction (0.48). Treat values > 5 as already-
  // integer-percent, otherwise multiply.
  const raw = Math.abs(sku.growth_pct);
  const pct = raw > 5 ? Math.round(raw) : Math.round(raw * 100);
  const displayPct = pct >= 1000 ? "1000%+" : `${pct}%`;
  const v = trendingVol(sku);
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 border-b border-taco-divider last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-taco-text truncate font-medium">
          {skuName(sku)}
        </div>
        <div className="text-[11px] text-taco-muted">
          {skuCode(sku)} · {v} unit
        </div>
      </div>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
          up
            ? "bg-[#E6F7F2] text-taco-success"
            : "bg-[#FEE2E2] text-taco-error"
        }`}
      >
        <span>{up ? "▲" : "▼"}</span>
        {displayPct}
      </span>
    </div>
  );
}

