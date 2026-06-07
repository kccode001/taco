"use client";

import { cn } from "@/lib/utils";

export interface CompetitorListItem {
  id: string;
  brand: string;
  sku_count: number;
  promo_count: number;
  posm_count: number;
  complete?: boolean;
}

interface CompetitorListCardProps {
  item: CompetitorListItem;
  onOpen: () => void;
}

export function CompetitorListCard({ item, onOpen }: CompetitorListCardProps) {
  const complete = !!item.complete;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full bg-white border border-taco-border rounded-[12px] p-4 mb-2.5 flex items-center gap-3 text-left active:bg-taco-page min-h-[72px]"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-semibold text-taco-text mb-1 truncate">
          {item.brand}
        </div>
        <div className="text-[12px] text-taco-sub leading-snug">
          SKU: {item.sku_count} produk · Promo: {item.promo_count} · POSM:{" "}
          {item.posm_count} aset
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={cn(
            "text-[11px] font-semibold px-2.5 py-1 rounded-full",
            complete
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          )}
        >
          {complete ? "Selesai" : "Perlu dilengkapi"}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ADADAD" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </button>
  );
}
