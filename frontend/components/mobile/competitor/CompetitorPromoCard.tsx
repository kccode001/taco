"use client";

import { cn } from "@/lib/utils";

export const COMPETITOR_PROMO_TYPES = [
  "Free Gift",
  "Direct Discount",
  "Bundling",
  "Other",
] as const;
export type CompetitorPromoType = (typeof COMPETITOR_PROMO_TYPES)[number];

export interface CompetitorPromoData {
  tipe: CompetitorPromoType | null;
  deskripsi: string;
  mulai: string;
  selesai: string;
}

export const EMPTY_COMPETITOR_PROMO: CompetitorPromoData = {
  tipe: null,
  deskripsi: "",
  mulai: "",
  selesai: "",
};

interface CompetitorPromoCardProps {
  index: number;
  data: CompetitorPromoData;
  onChange: (data: CompetitorPromoData) => void;
  onRemove: () => void;
}

export function CompetitorPromoCard({
  index,
  data,
  onChange,
  onRemove,
}: CompetitorPromoCardProps) {
  return (
    <div className="bg-white border border-taco-border rounded-[12px] mb-2.5 p-4">
      <div className="text-[11px] font-bold text-taco-muted tracking-wide uppercase mb-2">
        Promo #{index + 1}
      </div>

      <div className="mb-3">
        <span className="text-[12px] font-medium text-taco-sub block mb-1.5">
          Tipe Promo <span className="text-taco-error">*</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {COMPETITOR_PROMO_TYPES.map((t) => {
            const on = data.tipe === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...data, tipe: on ? null : t })}
                className={cn(
                  "h-11 px-4 rounded-full text-[13px] font-semibold border-[1.5px]",
                  on
                    ? "border-taco-text bg-taco-text text-white"
                    : "border-taco-border bg-white text-taco-sub"
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <span className="text-[12px] font-medium text-taco-sub block mb-1">
          Deskripsi (opsional)
        </span>
        <textarea
          value={data.deskripsi}
          onChange={(e) => onChange({ ...data, deskripsi: e.target.value })}
          placeholder="Detail promo…"
          className="w-full min-h-[64px] border-[1.5px] border-taco-border rounded-[8px] px-2.5 py-2 text-[14px] text-taco-text bg-white outline-none focus:border-taco-sub resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <div>
          <span className="text-[12px] font-medium text-taco-sub block mb-1">
            Mulai (opsional)
          </span>
          <input
            type="date"
            value={data.mulai}
            onChange={(e) => onChange({ ...data, mulai: e.target.value })}
            className="h-[52px] w-full border-[1.5px] border-taco-border rounded-[8px] px-2.5 text-[14px] text-taco-text bg-white outline-none focus:border-taco-sub"
          />
        </div>
        <div>
          <span className="text-[12px] font-medium text-taco-sub block mb-1">
            Selesai (opsional)
          </span>
          <input
            type="date"
            value={data.selesai}
            onChange={(e) => onChange({ ...data, selesai: e.target.value })}
            className="h-[52px] w-full border-[1.5px] border-taco-border rounded-[8px] px-2.5 text-[14px] text-taco-text bg-white outline-none focus:border-taco-sub"
          />
        </div>
      </div>

      <div className="text-right">
        <button
          type="button"
          onClick={onRemove}
          className="text-[13px] text-taco-error font-medium h-11 px-2"
        >
          Hapus promo ini
        </button>
      </div>
    </div>
  );
}
