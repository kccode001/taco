"use client";

import { useEffect, useState } from "react";
import { getStockHealth, StockHealthRow } from "@/lib/api";
import { PRODUCT_LINES, ProductLineSlug } from "./categories";

// One row per locked product_line slug (8 rows — Plywood dropped).
const MOCK: Record<ProductLineSlug, StockHealthRow> = {
  taco_hpl: {
    category: "taco_hpl",
    label: "TACO HPL",
    sangat_minimum_pct: 42,
    cukup_pct: 47,
    sangat_besar_pct: 11,
    risk: "high",
    trend_pct: 8,
  },
  tiero: {
    category: "tiero",
    label: "TIero",
    sangat_minimum_pct: 24,
    cukup_pct: 61,
    sangat_besar_pct: 15,
    risk: "medium",
    trend_pct: 3,
  },
  eco_hpl: {
    category: "eco_hpl",
    label: "ECO HPL",
    sangat_minimum_pct: 18,
    cukup_pct: 69,
    sangat_besar_pct: 13,
    risk: "medium",
    trend_pct: 0,
  },
  taco_sheet: {
    category: "taco_sheet",
    label: "TACO Sheet",
    sangat_minimum_pct: 11,
    cukup_pct: 74,
    sangat_besar_pct: 15,
    risk: "low",
    trend_pct: 0,
  },
  taco_edging: {
    category: "taco_edging",
    label: "TACO Edging",
    sangat_minimum_pct: 9,
    cukup_pct: 78,
    sangat_besar_pct: 13,
    risk: "low",
    trend_pct: -2,
  },
  taco_hardware: {
    category: "taco_hardware",
    label: "TACO Hardware",
    sangat_minimum_pct: 6,
    cukup_pct: 62,
    sangat_besar_pct: 32,
    risk: "low",
    trend_pct: 0,
  },
  vinyl: {
    category: "vinyl",
    label: "Vinyl",
    sangat_minimum_pct: 22,
    cukup_pct: 63,
    sangat_besar_pct: 15,
    risk: "medium",
    trend_pct: 3,
  },
  fideco: {
    category: "fideco",
    label: "FIDECO",
    sangat_minimum_pct: 14,
    cukup_pct: 71,
    sangat_besar_pct: 15,
    risk: "low",
    trend_pct: 0,
  },
};

function RiskBadge({ risk }: { risk: StockHealthRow["risk"] }) {
  const styles = {
    high: "bg-[#FEE2E2] text-[#D0342C]",
    medium: "bg-[#FFF5E6] text-[#E07B00]",
    low: "bg-[#E6F7F2] text-[#1D9E75]",
  } as const;
  const labels = { high: "Tinggi", medium: "Sedang", low: "Rendah" } as const;
  return (
    <span
      className={`text-[11px] font-bold px-2 py-0.5 rounded ${styles[risk]}`}
    >
      {labels[risk]}
    </span>
  );
}

function TrendArrow({ pct }: { pct: number }) {
  if (pct === 0)
    return <span className="text-[#ADADAD] text-[13px] font-semibold">→</span>;
  const up = pct > 0;
  return (
    <span
      className={
        "text-[13px] font-semibold " +
        (up ? "text-[#D0342C]" : "text-[#1D9E75]")
      }
    >
      {up ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}

export function KesehatanStokKategori() {
  const [rows, setRows] = useState<StockHealthRow[]>(() =>
    PRODUCT_LINES.map((c) => MOCK[c.slug])
  );

  useEffect(() => {
    let cancelled = false;
    getStockHealth()
      .then((res) => {
        if (cancelled) return;
        const body = res.data as unknown as
          | { data?: StockHealthRow[] }
          | StockHealthRow[];
        const list = Array.isArray(body) ? body : body?.data ?? [];
        // Always render 8 rows in locked order, filling holes with mock so
        // demo never shows a partial table.
        const byCat = new Map(list.map((r) => [r.category, r]));
        setRows(PRODUCT_LINES.map((c) => byCat.get(c.slug) ?? MOCK[c.slug]));
      })
      .catch(() => {
        if (!cancelled) setRows(PRODUCT_LINES.map((c) => MOCK[c.slug]));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0F0F0]">
        <h2 className="text-[15px] font-semibold text-[#1A1A1A]">
          Kesehatan Stok per Kategori
        </h2>
        <p className="text-[13px] text-[#717171] mt-0.5">
          Dari Level Stok semua kunjungan minggu ini · % toko per status · 8
          kategori produk
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F7F7F7] text-[12px] font-semibold text-[#ADADAD] uppercase tracking-wide">
              <th className="text-left px-5 py-3">Kategori</th>
              <th className="text-right px-4 py-3">Sangat Minimum</th>
              <th className="text-right px-4 py-3">Stock Cukup</th>
              <th className="text-right px-4 py-3">Sangat Besar</th>
              <th className="text-left px-4 py-3">Risiko Stockout</th>
              <th className="text-left px-5 py-3">Trend Minggu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.category}
                className="border-b border-[#F0F0F0] last:border-0 hover:bg-[#FAFAFA]"
              >
                <td className="px-5 py-3.5 text-[14px] font-medium text-[#1A1A1A]">
                  {r.label}
                </td>
                <td
                  className={
                    "px-4 py-3.5 text-[14px] text-right font-semibold " +
                    (r.sangat_minimum_pct >= 30
                      ? "text-[#D0342C]"
                      : r.sangat_minimum_pct >= 15
                      ? "text-[#E07B00]"
                      : "text-[#1A1A1A]")
                  }
                >
                  {r.sangat_minimum_pct}%
                </td>
                <td className="px-4 py-3.5 text-[14px] text-right text-[#1A1A1A]">
                  {r.cukup_pct}%
                </td>
                <td className="px-4 py-3.5 text-[14px] text-right text-[#1D9E75]">
                  {r.sangat_besar_pct}%
                </td>
                <td className="px-4 py-3.5">
                  <RiskBadge risk={r.risk} />
                </td>
                <td className="px-5 py-3.5">
                  <TrendArrow pct={r.trend_pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
