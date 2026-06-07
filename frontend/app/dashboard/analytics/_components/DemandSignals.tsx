"use client";

import { useEffect, useState } from "react";
import { getMarketDemand } from "@/lib/api";

interface DemandRow {
  keyword: string;
  regions: string[];
  count: number;
}

const MOCK: DemandRow[] = [
  {
    keyword: "Laminate tahan air",
    regions: ["Tangerang Selatan", "Bekasi", "Jakarta Barat"],
    count: 124,
  },
  {
    keyword: "Parquet jati premium",
    regions: ["Bekasi", "Jakarta Selatan"],
    count: 98,
  },
  {
    keyword: "HPL putih matte",
    regions: ["Tangerang Selatan", "Depok"],
    count: 74,
  },
  {
    keyword: "Vinyl tile 4mm",
    regions: ["Jakarta Barat", "Depok"],
    count: 62,
  },
  {
    keyword: "Edging ABS 22mm",
    regions: ["Bekasi", "Karawang"],
    count: 48,
  },
];

export function DemandSignals() {
  const [rows, setRows] = useState<DemandRow[]>(MOCK);

  useEffect(() => {
    let cancelled = false;
    getMarketDemand()
      .then((res) => {
        if (cancelled) return;
        const body = res.data as unknown as DemandRow[] | { data?: DemandRow[] };
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
  }, []);

  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0F0F0]">
        <h2 className="text-[15px] font-semibold text-[#1A1A1A]">
          Sinyal Toko (Permintaan)
        </h2>
        <p className="text-[13px] text-[#717171] mt-0.5">
          Dari Sinyal Toko (Permintaan) — semua kunjungan hari ini · Diurutkan
          berdasarkan volume
        </p>
      </div>
      <div>
        {rows.map((r, i) => (
          <div
            key={r.keyword + i}
            className="flex items-center px-5 py-3 border-b border-[#F0F0F0] last:border-0 gap-4"
          >
            <div className="text-[13px] font-bold text-[#ADADAD] w-6">
              #{i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-medium text-[#1A1A1A] truncate">
                {r.keyword}
              </div>
              <div className="text-[13px] text-[#717171] mt-0.5 truncate">
                {r.regions.join(", ")}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div
                className="h-2 rounded bg-[#1D9E75]/70"
                style={{
                  width: `${(r.count / max) * 140}px`,
                  minWidth: 24,
                }}
                aria-hidden
              />
              <span className="text-[13px] text-[#ADADAD] tabular-nums w-[88px] text-right">
                {r.count} sinyal
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
