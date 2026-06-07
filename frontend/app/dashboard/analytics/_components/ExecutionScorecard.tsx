"use client";

import { useEffect, useState } from "react";
import { getDataQuality, DataQualityBreakdown } from "@/lib/api";

const MOCK_DQ: DataQualityBreakdown = {
  owner_pic_pct: 82,
  owner_pic_count: 203,
  self_est_pct: 14,
  self_est_count: 35,
  tidak_tahu_pct: 3,
  tidak_tahu_count: 7,
  lainnya_pct: 1,
  lainnya_count: 2,
};

const SCORECARD_TILES = [
  {
    label: "Kunjungan Selesai",
    value: "247",
    sub: "Target: 300 · 82%",
  },
  {
    label: "Coverage Toko",
    value: "83%",
    sub: "dari 240 toko aktif",
  },
  {
    label: "Invoice Dikumpulkan",
    value: "412",
    sub: "dari 47 rep · avg 8,7/rep",
  },
  {
    label: "Burning Q Completion Rate",
    value: "74%",
    sub: "26% kunjungan tanpa invoice",
  },
  {
    label: "Rata-rata Waktu Kunjungan",
    value: "38",
    valueSuffix: "min",
    sub: "Target 45 min",
  },
  {
    label: "Rep Mencapai Target",
    value: "14",
    sub: "dari 22 total rep",
  },
];

type Period = "week" | "month";

export function ExecutionScorecard() {
  const [period, setPeriod] = useState<Period>("week");
  const [dq, setDq] = useState<DataQualityBreakdown>(MOCK_DQ);

  useEffect(() => {
    let cancelled = false;
    getDataQuality()
      .then((res) => {
        if (cancelled) return;
        if (res.data && typeof res.data === "object" && "owner_pic_pct" in res.data) {
          setDq(res.data as DataQualityBreakdown);
        } else {
          setDq(MOCK_DQ);
        }
      })
      .catch(() => {
        if (!cancelled) setDq(MOCK_DQ);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0F0F0] flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold text-[#1A1A1A]">
            Execution Scorecard
          </h2>
          <p className="text-[13px] text-[#717171] mt-0.5">
            Ringkasan eksekusi tim
          </p>
        </div>
        <div className="flex gap-2">
          {(["week", "month"] as Period[]).map((p) => {
            const active = period === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={
                  "h-[32px] px-3.5 rounded-full text-[13px] font-medium border transition-colors " +
                  (active
                    ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                    : "bg-white text-[#717171] border-[#E5E5E5] hover:text-[#1A1A1A]")
                }
              >
                {p === "week" ? "Minggu Ini" : "Bulan Ini"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-5">
        {SCORECARD_TILES.map((tile) => (
          <div
            key={tile.label}
            className="bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg p-4"
          >
            <div className="text-[13px] text-[#717171] mb-1.5">
              {tile.label}
            </div>
            <div className="text-[24px] font-bold text-[#1A1A1A] leading-none">
              {tile.value}
              {tile.valueSuffix && (
                <span className="text-[16px] font-normal ml-0.5">
                  {tile.valueSuffix}
                </span>
              )}
            </div>
            <div className="text-[12px] text-[#ADADAD] mt-1">{tile.sub}</div>
          </div>
        ))}
      </div>

      {/* Kualitas Data mini-panel — AUDIT-009 §05 fix 5 */}
      <div className="px-5 pb-5">
        <div className="bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-[13px] font-semibold text-[#1A1A1A]">
              Kualitas Data — Sumber Harga &amp; SKU
            </div>
            <span className="text-[11px] text-[#ADADAD]">
              Dari Sumber Data semua kunjungan minggu ini
            </span>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <DqTile
              label="Owner / PIC"
              pct={dq.owner_pic_pct}
              count={dq.owner_pic_count}
              tone="success"
            />
            <DqTile
              label="Self estimation"
              pct={dq.self_est_pct}
              count={dq.self_est_count}
              tone="warning"
            />
            <DqTile
              label="Tidak tahu"
              pct={dq.tidak_tahu_pct}
              count={dq.tidak_tahu_count}
              tone="error"
            />
            <DqTile
              label="Lainnya"
              pct={dq.lainnya_pct}
              count={dq.lainnya_count}
              tone="muted"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DqTile({
  label,
  pct,
  count,
  tone,
}: {
  label: string;
  pct: number;
  count: number;
  tone: "success" | "warning" | "error" | "muted";
}) {
  const colors = {
    success: "text-[#1D9E75]",
    warning: "text-[#E07B00]",
    error: "text-[#D0342C]",
    muted: "text-[#ADADAD]",
  } as const;
  return (
    <div className="flex-1 min-w-[140px] p-3 bg-white rounded-lg border border-[#E5E5E5]">
      <div className="text-[11px] text-[#ADADAD]">{label}</div>
      <div className={`text-[18px] font-bold ${colors[tone]}`}>{pct}%</div>
      <div className="text-[11px] text-[#ADADAD]">{count} kunjungan</div>
    </div>
  );
}
