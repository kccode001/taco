"use client";

import { useEffect, useState } from "react";
import { getProjectOpportunities, ProjectOpportunity } from "@/lib/api";
import { PROJECT_TYPES, ProjectType } from "./categories";

const MOCK: ProjectOpportunity[] = [
  {
    area: "BSD — Tangerang Selatan",
    tipe: "Perumahan",
    skala: "Besar",
    description: "Komplek Griya Lestari 200 unit, target finishing Agustus",
    reporters: ["Budi S.", "Sari W."],
    signal_count: 3,
  },
  {
    area: "Bekasi Timur",
    tipe: "Komersial",
    skala: "Sedang",
    description: "Ruko 3 lantai Jl. Industri — kebutuhan HPL dan Vinyl",
    reporters: ["Sari W."],
    signal_count: 2,
  },
  {
    area: "Depok — Sawangan",
    tipe: "Renovasi",
    skala: "Kecil",
    description: "Kluster Sawangan Indah ~30 unit renovasi",
    reporters: ["Dewi R."],
    signal_count: 1,
  },
  {
    area: "Jakarta Selatan — Kebayoran",
    tipe: "Apartemen",
    skala: "Sedang",
    description: "Apartemen Senopati 80 unit, fase interior Oktober",
    reporters: ["Agus P."],
    signal_count: 2,
  },
  {
    area: "Tangerang — Pasar Lama",
    tipe: "Lainnya",
    skala: "Kecil",
    description: "Renovasi pasar tradisional — kebutuhan plywood & edging",
    reporters: ["Budi S."],
    signal_count: 1,
  },
];

const TIPE_STYLES: Record<ProjectType, string> = {
  Perumahan: "bg-[#EEF3FF] text-[#3B7DD8]",
  Apartemen: "bg-[#F0F4FF] text-[#4C6EF5]",
  Komersial: "bg-[#E6F7F2] text-[#1D9E75]",
  Renovasi: "bg-[#FFF3E6] text-[#E07B00]",
  Lainnya: "bg-[#F7F7F7] text-[#717171] border border-[#E5E5E5]",
};

const SKALA_STYLES: Record<ProjectOpportunity["skala"], string> = {
  Besar: "bg-[#FEE2E2] text-[#D0342C]",
  Sedang: "bg-[#FFF3E6] text-[#E07B00]",
  Kecil: "bg-[#F7F7F7] text-[#717171] border border-[#E5E5E5]",
};

export function PeluangProyekTable() {
  const [rows, setRows] = useState<ProjectOpportunity[]>(MOCK);

  useEffect(() => {
    let cancelled = false;
    getProjectOpportunities()
      .then((res) => {
        if (cancelled) return;
        const body = res.data as unknown as
          | { data?: ProjectOpportunity[] }
          | ProjectOpportunity[];
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
          Peluang Proyek Regional
        </h2>
        <p className="text-[13px] text-[#717171] mt-0.5">
          Dari sinyal &quot;Ada Proyek&quot; kunjungan hari ini · Diurutkan berdasarkan skala
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F7F7F7] text-[12px] font-semibold text-[#ADADAD] uppercase tracking-wide">
              <th className="text-left px-5 py-3">Area</th>
              <th className="text-left px-4 py-3">Tipe Proyek</th>
              <th className="text-left px-4 py-3">Skala</th>
              <th className="text-left px-4 py-3">Keterangan</th>
              <th className="text-left px-4 py-3">Dilaporkan Oleh</th>
              <th className="text-right px-5 py-3">Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.area + i}
                className="border-b border-[#F0F0F0] last:border-0 hover:bg-[#FAFAFA]"
              >
                <td className="px-5 py-3.5 text-[14px] font-medium text-[#1A1A1A]">
                  {r.area}
                </td>
                <td className="px-4 py-3.5">
                  <span
                    className={`text-[12px] font-semibold px-2 py-0.5 rounded ${TIPE_STYLES[r.tipe]}`}
                  >
                    {r.tipe}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span
                    className={`text-[12px] font-semibold px-2 py-0.5 rounded ${SKALA_STYLES[r.skala]}`}
                  >
                    {r.skala}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-[13px] text-[#1A1A1A] max-w-[260px]">
                  {r.description}
                </td>
                <td className="px-4 py-3.5 text-[13px] text-[#717171]">
                  {r.reporters.join(", ")}
                </td>
                <td className="px-5 py-3.5 text-[14px] text-right font-bold text-[#1A1A1A]">
                  {r.signal_count} sinyal
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 text-[12px] text-[#ADADAD] border-t border-[#F0F0F0]">
          Tipe proyek: {PROJECT_TYPES.join(" · ")}
        </div>
      </div>
    </div>
  );
}
