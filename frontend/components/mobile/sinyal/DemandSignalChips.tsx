"use client";

import { cn } from "@/lib/utils";

export const DEMAND_CATEGORIES = [
  "Laminate",
  "Vinyl",
  "HPL",
  "Sheet",
  "Edging",
  "Hardware",
  "Plywood",
  "Lainnya",
] as const;

export type DemandCategory = (typeof DEMAND_CATEGORIES)[number];

interface DemandSignalChipsProps {
  value: DemandCategory[];
  onChange: (value: DemandCategory[]) => void;
  detail: string;
  onDetailChange: (s: string) => void;
}

export function DemandSignalChips({
  value,
  onChange,
  detail,
  onDetailChange,
}: DemandSignalChipsProps) {
  const toggle = (d: DemandCategory) => {
    onChange(value.includes(d) ? value.filter((v) => v !== d) : [...value, d]);
  };
  return (
    <div>
      <div className="text-[15px] font-semibold text-taco-text mb-2.5">
        Produk yang banyak ditanya customer
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {DEMAND_CATEGORIES.map((d) => {
          const on = value.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              className={cn(
                "h-11 px-4 rounded-full text-[14px] font-medium border-[1.5px]",
                on
                  ? "border-taco-text bg-taco-text text-white"
                  : "border-taco-border bg-white text-taco-text"
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
      <textarea
        value={detail}
        onChange={(e) => onDetailChange(e.target.value)}
        placeholder="Detail — produk spesifik, ukuran, warna, dsb…"
        className="w-full min-h-[64px] border-[1.5px] border-taco-border rounded-[10px] px-3.5 py-3 text-[15px] text-taco-text bg-white outline-none resize-y focus:border-taco-sub"
      />
    </div>
  );
}
