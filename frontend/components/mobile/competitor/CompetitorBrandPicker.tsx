"use client";

import { cn } from "@/lib/utils";

export const COMPETITOR_BRANDS = [
  "Krono",
  "Kronospan",
  "Pergo",
  "Egger",
  "Unilin",
  "Armstrong",
  "Teka",
  "Greenply",
  "Meranti",
  "Lainnya",
] as const;

export type CompetitorBrand = (typeof COMPETITOR_BRANDS)[number];

interface CompetitorBrandPickerProps {
  open: boolean;
  takenBrands?: string[];
  onPick: (brand: CompetitorBrand) => void;
  onCancel: () => void;
  label?: string;
  emphasis?: "default" | "compact";
}

export function CompetitorBrandPicker({
  open,
  takenBrands = [],
  onPick,
  onCancel,
  label = "Pilih brand kompetitor",
  emphasis = "default",
}: CompetitorBrandPickerProps) {
  if (!open) return null;
  const taken = new Set(takenBrands);
  return (
    <div className="px-3.5 mt-3">
      <div className="bg-white border border-taco-border rounded-2xl p-4">
        <div className="text-[14px] font-semibold text-taco-text mb-3">
          {label}
        </div>
        <div className="flex flex-wrap gap-2">
          {COMPETITOR_BRANDS.map((b) => {
            const isTaken = taken.has(b);
            return (
              <button
                key={b}
                type="button"
                onClick={() => onPick(b)}
                disabled={emphasis === "default" ? isTaken : false}
                className={cn(
                  "h-11 px-4 rounded-full text-[14px] font-medium border-[1.5px] min-w-[44px]",
                  isTaken
                    ? "border-taco-success bg-emerald-50 text-taco-success"
                    : "border-taco-border bg-white text-taco-text active:bg-taco-page"
                )}
              >
                {b}
                {isTaken && " ✓"}
              </button>
            );
          })}
        </div>
        <div className="text-[12px] text-taco-muted mt-3 leading-relaxed">
          Brand dikelola admin — hubungi admin untuk tambah brand baru
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 h-11 w-full text-[14px] text-taco-sub bg-transparent"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
