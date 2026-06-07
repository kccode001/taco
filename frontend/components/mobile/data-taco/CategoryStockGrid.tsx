"use client";

import { cn } from "@/lib/utils";

export type StockLevel = "min" | "ok" | "big";

export const STOCK_CATEGORIES = [
  "TACO LAMINATE",
  "TACO HPL",
  "ECO HPL",
  "TACO SHEET",
  "TACO EDGING",
  "TACO HARDWARE",
  "TACO VINYL",
  "TACO PLYWOOD",
  "Lainnya",
] as const;

export type StockCategory = (typeof STOCK_CATEGORIES)[number];

interface CategoryStockGridProps {
  value: Partial<Record<StockCategory, StockLevel>>;
  onChange: (value: Partial<Record<StockCategory, StockLevel>>) => void;
}

const LEVELS: {
  key: StockLevel;
  label: string;
  onCls: string;
}[] = [
  {
    key: "min",
    label: "Sangat Minimum",
    onCls: "border-red-500 bg-red-100 text-red-700",
  },
  {
    key: "ok",
    label: "Stock Cukup",
    onCls: "border-emerald-600 bg-emerald-50 text-emerald-700",
  },
  {
    key: "big",
    label: "Sangat Besar",
    onCls: "border-blue-500 bg-blue-50 text-blue-700",
  },
];

export function CategoryStockGrid({ value, onChange }: CategoryStockGridProps) {
  const set = (cat: StockCategory, level: StockLevel) => {
    const next = { ...value };
    if (next[cat] === level) {
      delete next[cat];
    } else {
      next[cat] = level;
    }
    onChange(next);
  };

  return (
    <div>
      <div className="text-[16px] font-semibold text-taco-text mb-1">
        Level stok per kategori
      </div>
      <div className="text-[14px] text-taco-sub mb-3.5">
        Estimasi stok toko saat ini
      </div>
      <div>
        {STOCK_CATEGORIES.map((cat, idx) => (
          <div
            key={cat}
            className={cn(
              "flex flex-col items-start gap-2 py-3.5",
              idx !== STOCK_CATEGORIES.length - 1 && "border-b border-taco-divider"
            )}
          >
            <span className="text-[15px] font-semibold text-taco-text">{cat}</span>
            <div className="flex gap-1.5 w-full">
              {LEVELS.map((l) => {
                const on = value[cat] === l.key;
                return (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => set(cat, l.key)}
                    className={cn(
                      "flex-1 h-11 px-1 rounded-[8px] text-[12px] font-semibold border-[1.5px] min-w-0 text-center leading-tight",
                      on
                        ? l.onCls
                        : "border-taco-border bg-white text-taco-sub"
                    )}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
