"use client";

import { useEffect, useState } from "react";
import { getTacoPriceIndex, TacoPriceIndexRow } from "@/lib/api";
import { PRODUCT_LINES } from "./categories";

// Display category strings (e.g. "TACO HPL") -> product line slug.
const CATEGORY_LABEL_TO_SLUG: Record<string, string> = PRODUCT_LINES.reduce(
  (acc, c) => {
    acc[c.label.toLowerCase()] = c.slug;
    return acc;
  },
  {} as Record<string, string>
);

function categorySlug(category: string): string {
  const direct = CATEGORY_LABEL_TO_SLUG[category.toLowerCase()];
  if (direct) return direct;
  // Fallback: row may already store the slug.
  return category.toLowerCase().replace(/\s+/g, "_");
}

const MOCK: TacoPriceIndexRow[] = [
  {
    sku_id: "TH-001",
    sku_name: "TACO HPL 3mm Putih Matte",
    category: "TACO HPL",
    avg_harga_beli: 178000,
    avg_harga_jual: 210000,
    margin_pct: 18.0,
    dispersion: 4800,
    store_count: 42,
    alert: null,
  },
  {
    sku_id: "TI-014",
    sku_name: "TIero Premium Walnut 4mm",
    category: "TIero",
    avg_harga_beli: 232000,
    avg_harga_jual: 279000,
    margin_pct: 20.3,
    dispersion: 7100,
    store_count: 24,
    alert: "top_margin",
  },
  {
    sku_id: "ES-022",
    sku_name: "ECO HPL Oak Natural",
    category: "ECO HPL",
    avg_harga_beli: 92000,
    avg_harga_jual: 108000,
    margin_pct: 17.4,
    dispersion: 3600,
    store_count: 31,
    alert: "low_margin",
  },
  {
    sku_id: "TS-118",
    sku_name: "TACO Sheet 18mm Standard",
    category: "TACO Sheet",
    avg_harga_beli: 145000,
    avg_harga_jual: 172000,
    margin_pct: 18.6,
    dispersion: 8500,
    store_count: 47,
    alert: "low_margin",
  },
  {
    sku_id: "TE-051",
    sku_name: "Edging ABS 1mm Putih",
    category: "TACO Edging",
    avg_harga_beli: 11000,
    avg_harga_jual: 14000,
    margin_pct: 27.3,
    dispersion: 800,
    store_count: 33,
    alert: null,
  },
  {
    sku_id: "TV-077",
    sku_name: "Vinyl Tile 4mm Woodgrain",
    category: "Vinyl",
    avg_harga_beli: 96000,
    avg_harga_jual: 116000,
    margin_pct: 20.8,
    dispersion: 5100,
    store_count: 29,
    alert: "top_margin",
  },
];

const formatRp = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

function AlertChip({ kind }: { kind: TacoPriceIndexRow["alert"] }) {
  if (kind === "low_margin")
    return (
      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#FEE2E2] text-[#D0342C]">
        Margin tipis
      </span>
    );
  if (kind === "top_margin")
    return (
      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#EAF3DE] text-[#0F6E56]">
        Top margin
      </span>
    );
  return <span className="text-[#ADADAD] text-[13px]">—</span>;
}

export function IndeksHargaTaco() {
  const [filter, setFilter] = useState<string>("all");
  const [rows, setRows] = useState<TacoPriceIndexRow[]>(MOCK);

  // Client-side filter on top of whatever rows are loaded so the UI reacts even
  // if BE ignores the category param (or hasn't shipped it yet).
  const visibleRows =
    filter === "all"
      ? rows
      : rows.filter((r) => categorySlug(r.category) === filter);

  useEffect(() => {
    let cancelled = false;
    const params = filter === "all" ? undefined : { category: filter };
    getTacoPriceIndex(params)
      .then((res) => {
        if (cancelled) return;
        const body = res.data as unknown as
          | { data?: TacoPriceIndexRow[] }
          | TacoPriceIndexRow[];
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
  }, [filter]);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0F0F0] flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold text-[#1A1A1A]">
            Indeks Harga TACO
          </h2>
          <p className="text-[13px] text-[#717171] mt-0.5">
            Rata-rata Harga Jual ke Tukang per SKU di semua toko · 30 hari
            terakhir
          </p>
        </div>
        <div className="flex gap-2 flex-wrap max-w-[640px] justify-end">
          <FilterPill
            label="Semua"
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
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F7F7F7] text-[12px] font-semibold text-[#ADADAD] uppercase tracking-wide">
              <th className="text-left px-5 py-3">SKU TACO</th>
              <th className="text-left px-4 py-3">Kategori</th>
              <th className="text-right px-4 py-3">Harga Beli</th>
              <th className="text-right px-4 py-3">Harga Jual ke Tukang</th>
              <th className="text-right px-4 py-3">Margin %</th>
              <th className="text-left px-4 py-3">Dispersi</th>
              <th className="text-left px-5 py-3">Alert</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr
                key={r.sku_id}
                className="border-b border-[#F0F0F0] last:border-0 hover:bg-[#FAFAFA]"
              >
                <td className="px-5 py-3.5 text-[14px] font-medium text-[#1A1A1A]">
                  {r.sku_name}
                </td>
                <td className="px-4 py-3.5 text-[13px] text-[#717171] uppercase tracking-wide">
                  {r.category}
                </td>
                <td className="px-4 py-3.5 text-[14px] text-right text-[#1A1A1A]">
                  {formatRp(r.avg_harga_beli)}
                </td>
                <td className="px-4 py-3.5 text-[14px] text-right text-[#1A1A1A]">
                  {formatRp(r.avg_harga_jual)}
                </td>
                <td
                  className={
                    "px-4 py-3.5 text-[13px] text-right font-semibold " +
                    (r.margin_pct >= 18
                      ? "text-[#1D9E75]"
                      : "text-[#E07B00]")
                  }
                >
                  {r.margin_pct.toFixed(1).replace(".", ",")}%
                </td>
                <td className="px-4 py-3.5 text-[13px] text-[#717171]">
                  ±{formatRp(r.dispersion)} ({r.store_count} toko)
                </td>
                <td className="px-5 py-3.5">
                  <AlertChip kind={r.alert} />
                </td>
              </tr>
            ))}
            {!visibleRows.length && (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-10 text-center text-[14px] text-[#717171]"
                >
                  Belum ada data harga TACO untuk filter ini.
                </td>
              </tr>
            )}
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
