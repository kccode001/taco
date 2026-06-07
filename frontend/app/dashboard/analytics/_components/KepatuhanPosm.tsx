"use client";

import { useEffect, useState } from "react";
import { getPosmCompliance, PosmComplianceRow } from "@/lib/api";

const MOCK: PosmComplianceRow[] = [
  {
    asset: "Standing Banner TACO",
    baik_pct: 67,
    rusak_ringan_pct: 14,
    perlu_ganti_pct: 11,
    tidak_ada_pct: 8,
    score_pct: 81,
  },
  {
    asset: "Leaflet Promo Laminate",
    baik_pct: 45,
    rusak_ringan_pct: 22,
    perlu_ganti_pct: 21,
    tidak_ada_pct: 12,
    score_pct: 67,
  },
  {
    asset: "Wobbler HPL",
    baik_pct: 52,
    rusak_ringan_pct: 18,
    perlu_ganti_pct: 14,
    tidak_ada_pct: 16,
    score_pct: 70,
  },
  {
    asset: "Display Vinyl Sample",
    baik_pct: 38,
    rusak_ringan_pct: 20,
    perlu_ganti_pct: 23,
    tidak_ada_pct: 19,
    score_pct: 58,
  },
  {
    asset: "Sticker Rak",
    baik_pct: 71,
    rusak_ringan_pct: 12,
    perlu_ganti_pct: 9,
    tidak_ada_pct: 8,
    score_pct: 83,
  },
];

function scoreColor(s: number) {
  if (s >= 80) return "text-[#1D9E75]";
  if (s >= 65) return "text-[#E07B00]";
  return "text-[#D0342C]";
}

export function KepatuhanPosm() {
  const [rows, setRows] = useState<PosmComplianceRow[]>(MOCK);

  useEffect(() => {
    let cancelled = false;
    getPosmCompliance()
      .then((res) => {
        if (cancelled) return;
        const body = res.data as unknown as
          | { data?: PosmComplianceRow[] }
          | PosmComplianceRow[];
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

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0F0F0]">
        <h2 className="text-[15px] font-semibold text-[#1A1A1A]">
          Kepatuhan POSM TACO
        </h2>
        <p className="text-[13px] text-[#717171] mt-0.5">
          Dari Audit POSM semua kunjungan minggu ini · Kondisi: Baik / Rusak
          Ringan / Perlu Ganti / Tidak Ada
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F7F7F7] text-[12px] font-semibold text-[#ADADAD] uppercase tracking-wide">
              <th className="text-left px-5 py-3">Aset POSM</th>
              <th className="text-right px-4 py-3">Baik</th>
              <th className="text-right px-4 py-3">Rusak Ringan</th>
              <th className="text-right px-4 py-3">Perlu Ganti</th>
              <th className="text-right px-4 py-3">Tidak Ada</th>
              <th className="text-right px-5 py-3">Skor Kepatuhan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.asset}
                className="border-b border-[#F0F0F0] last:border-0 hover:bg-[#FAFAFA]"
              >
                <td className="px-5 py-3.5 text-[14px] font-medium text-[#1A1A1A]">
                  {r.asset}
                </td>
                <td className="px-4 py-3.5 text-[14px] text-right text-[#1D9E75] font-semibold">
                  {r.baik_pct}%
                </td>
                <td className="px-4 py-3.5 text-[14px] text-right text-[#1A1A1A]">
                  {r.rusak_ringan_pct}%
                </td>
                <td className="px-4 py-3.5 text-[14px] text-right text-[#E07B00]">
                  {r.perlu_ganti_pct}%
                </td>
                <td className="px-4 py-3.5 text-[14px] text-right text-[#D0342C]">
                  {r.tidak_ada_pct}%
                </td>
                <td
                  className={`px-5 py-3.5 text-[14px] text-right font-bold ${scoreColor(
                    r.score_pct
                  )}`}
                >
                  {r.score_pct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
