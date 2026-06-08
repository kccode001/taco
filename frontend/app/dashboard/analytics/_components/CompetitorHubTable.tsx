"use client";

import { useEffect, useState } from "react";
import { getCompetitorHub } from "@/lib/api";
import { PRODUCT_LINES } from "./categories";

interface CompetitorRow {
  sku: string;
  brand: string;
  harga_beli: number;
  harga_jual: number;
  taco_price: number;
  gap_pct: number;
  trend_points: number[];
  region?: string;
}

const MOCK: CompetitorRow[] = [
  {
    sku: "Laminate 8mm Original",
    brand: "Krono",
    harga_beli: 155000,
    harga_jual: 165000,
    taco_price: 185000,
    gap_pct: -11,
    trend_points: [18, 16, 20, 12, 10],
    region: "Tangerang Selatan",
  },
  {
    sku: "HPL Matte 3mm",
    brand: "Egger",
    harga_beli: 185000,
    harga_jual: 198000,
    taco_price: 210000,
    gap_pct: -6,
    trend_points: [12, 14, 12, 13, 13],
    region: "Jakarta",
  },
  {
    sku: "Sensation Oak 8mm",
    brand: "Pergo",
    harga_beli: 228000,
    harga_jual: 245000,
    taco_price: 185000,
    gap_pct: 30,
    trend_points: [16, 14, 12, 10, 8],
    region: "Jakarta Selatan",
  },
  {
    sku: "Laminate Classic 8mm",
    brand: "Krono",
    harga_beli: 145000,
    harga_jual: 158000,
    taco_price: 185000,
    gap_pct: -15,
    trend_points: [14, 12, 16, 10, 8],
    region: "Bekasi",
  },
];

const REGIONS = [
  { id: "", label: "Semua wilayah" },
  { id: "jakarta", label: "Jakarta" },
  { id: "tangerang", label: "Tangerang" },
  { id: "bekasi", label: "Bekasi" },
  { id: "bogor", label: "Bogor" },
  { id: "bandung", label: "Bandung" },
];

// Map a row's region string to a coarse region slug for client-side filtering.
function regionSlug(region?: string): string {
  if (!region) return "";
  const r = region.toLowerCase();
  if (r.includes("jakarta")) return "jakarta";
  if (r.includes("tangerang")) return "tangerang";
  if (r.includes("bekasi")) return "bekasi";
  if (r.includes("bogor")) return "bogor";
  if (r.includes("bandung")) return "bandung";
  return "";
}

// Map a competitor SKU string to a product line slug for client-side filtering.
function skuCategorySlug(sku: string): string {
  const s = sku.toLowerCase();
  if (s.includes("hpl")) return "taco_hpl";
  if (s.includes("edging")) return "taco_edging";
  if (s.includes("vinyl")) return "vinyl";
  if (s.includes("sheet")) return "taco_sheet";
  if (s.includes("hardware")) return "taco_hardware";
  if (s.includes("tiero")) return "tiero";
  if (s.includes("fideco")) return "fideco";
  if (s.includes("eco")) return "eco_hpl";
  // Laminate -> grouped with TACO Sheet as a coarse approximation for demo.
  if (s.includes("laminate")) return "taco_sheet";
  return "";
}

const formatRp = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

function TrendSvg({
  points,
  tone,
}: {
  points: number[];
  tone: "up" | "down" | "flat";
}) {
  const stroke =
    tone === "up"
      ? "#1D9E75"
      : tone === "down"
      ? "#D0342C"
      : "#E07B00";
  const step = 60 / Math.max(1, points.length - 1);
  const path = points
    .map((y, i) => `${i === 0 ? "M" : "L"} ${i * step} ${y}`)
    .join(" ");
  return (
    <svg width="60" height="24" viewBox="0 0 60 24" aria-hidden>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CompetitorHubTable() {
  const [filter, setFilter] = useState<string>("all");
  const [region, setRegion] = useState<string>("");
  const [rows, setRows] = useState<CompetitorRow[]>(MOCK);

  // Apply client-side filtering on top of whatever rows came back (live or mock).
  // BE may ignore params or 401/404 → we still want the UI to react to filters.
  const visibleRows = rows.filter((r) => {
    if (region && regionSlug(r.region) !== region) return false;
    if (filter !== "all" && skuCategorySlug(r.sku) !== filter) return false;
    return true;
  });

  useEffect(() => {
    let cancelled = false;
    const params: Record<string, string> = { range: "30d" };
    if (region) params.region = region;
    if (filter !== "all") params.category = filter;
    getCompetitorHub(params)
      .then((res) => {
        if (cancelled) return;
        const body = res.data as unknown as
          | { data?: CompetitorRow[] }
          | CompetitorRow[];
        const list = Array.isArray(body) ? body : body?.data ?? [];
        if (list.length) setRows(list);
        else setRows(MOCK);
      })
      .catch(() => {
        if (!cancelled) setRows(MOCK);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, region]);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0F0F0] flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold text-[#1A1A1A]">
            Indeks Harga Kompetitor
          </h2>
          <p className="text-[13px] text-[#717171] mt-0.5">
            30 hari terakhir · SKU terlacak dari invoice · filter wilayah +
            kategori
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="h-[32px] px-3 border border-[#E5E5E5] rounded-full text-[13px] text-[#1A1A1A] bg-white outline-none"
            aria-label="Filter wilayah"
          >
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2 flex-wrap max-w-[640px]">
            <FilterPill
              label="Semua SKU"
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            {PRODUCT_LINES.map((c) => (
              <FilterPill
                key={c.slug}
                label={c.label}
                active={filter === c.slug}
                onClick={() => setFilter(c.slug)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F7F7F7] text-[12px] font-semibold text-[#ADADAD] uppercase tracking-wide">
              <th className="text-left px-5 py-3">SKU Kompetitor</th>
              <th className="text-left px-4 py-3">Merek</th>
              <th className="text-left px-4 py-3">Wilayah</th>
              <th className="text-right px-4 py-3">Harga Beli</th>
              <th className="text-right px-4 py-3">Harga Jual ke Tukang</th>
              <th className="text-center px-4 py-3">Tren 30 Hari</th>
              <th className="text-right px-4 py-3">vs TACO</th>
              <th className="text-right px-5 py-3">Gap</th>
            </tr>
          </thead>
          <tbody>
            {!visibleRows.length && (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-10 text-center text-[14px] text-[#717171]"
                >
                  Tidak ada SKU kompetitor untuk filter ini.
                </td>
              </tr>
            )}
            {visibleRows.map((r, i) => {
              const tone =
                r.gap_pct > 5 ? "up" : r.gap_pct < -5 ? "down" : "flat";
              return (
                <tr
                  key={r.sku + i}
                  className="border-b border-[#F0F0F0] last:border-0 hover:bg-[#FAFAFA]"
                >
                  <td className="px-5 py-3.5 text-[14px] font-medium text-[#1A1A1A]">
                    {r.sku}
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-[#717171]">
                    {r.brand}
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-[#717171]">
                    {r.region ?? "—"}
                  </td>
                  <td className="px-4 py-3.5 text-[14px] text-right text-[#1A1A1A]">
                    {formatRp(r.harga_beli)}
                  </td>
                  <td className="px-4 py-3.5 text-[14px] text-right text-[#1A1A1A]">
                    {formatRp(r.harga_jual)}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <div className="inline-block">
                      <TrendSvg points={r.trend_points} tone={tone} />
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-right text-[#ADADAD]">
                    {formatRp(r.taco_price)}
                  </td>
                  <td
                    className={
                      "px-5 py-3.5 text-[13px] text-right font-bold " +
                      (r.gap_pct > 0
                        ? "text-[#1D9E75]"
                        : r.gap_pct < -10
                        ? "text-[#D0342C]"
                        : "text-[#E07B00]")
                    }
                  >
                    {r.gap_pct > 0 ? "+" : ""}
                    {r.gap_pct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-[32px] px-3.5 rounded-full text-[13px] font-medium border transition-colors " +
        (active
          ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
          : "bg-white text-[#717171] border-[#E5E5E5] hover:text-[#1A1A1A]")
      }
    >
      {label}
    </button>
  );
}
