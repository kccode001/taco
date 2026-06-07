"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { SkuCard, EMPTY_SKU_FORM, type SkuFormData } from "./SkuCard";

export const CATEGORIES = [
  { key: "all", label: "Semua" },
  { key: "LAMINATE", label: "Laminate" },
  { key: "HPL", label: "HPL" },
  { key: "ECO_HPL", label: "ECO HPL" },
  { key: "SHEET", label: "Sheet" },
  { key: "EDGING", label: "Edging" },
  { key: "HARDWARE", label: "Hardware" },
  { key: "VINYL", label: "Vinyl" },
  { key: "PLYWOOD", label: "Plywood" },
  { key: "LAINNYA", label: "Lainnya" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export interface SkuItem {
  id: string;
  code: string;
  name: string;
  category: string;
}

interface SkuTableProps {
  skus: SkuItem[];
  values: Record<string, SkuFormData>;
  onValueChange: (id: string, data: SkuFormData) => void;
  preFilledIds?: Set<string>;
  changedIds?: Set<string>;
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  search: string;
  onSearch: (s: string) => void;
  category: CategoryKey;
  onCategory: (c: CategoryKey) => void;
}

export function SkuTable({
  skus,
  values,
  onValueChange,
  preFilledIds,
  changedIds,
  loading,
  onLoadMore,
  hasMore,
  search,
  onSearch,
  category,
  onCategory,
}: SkuTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, SkuItem[]>();
    for (const s of skus) {
      const cat = s.category || "LAINNYA";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return Array.from(map.entries());
  }, [skus]);

  return (
    <div>
      <div className="mb-3">
        <div className="relative mb-2.5">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ADADAD"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Cari SKU TACO…"
            className="w-full h-[48px] border-[1.5px] border-taco-border rounded-[10px] pl-10 pr-3.5 text-[15px] text-taco-text bg-white outline-none focus:border-taco-sub"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORIES.map((c) => {
            const on = c.key === category;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onCategory(c.key)}
                className={cn(
                  "h-9 px-3.5 rounded-full text-[13px] font-medium font-sans whitespace-nowrap shrink-0 border-[1.5px]",
                  on
                    ? "border-taco-text bg-taco-text text-white"
                    : "border-taco-border bg-white text-taco-sub"
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading && skus.length === 0 ? (
        <div className="text-center text-[13px] text-taco-muted py-6">
          Memuat SKU…
        </div>
      ) : skus.length === 0 ? (
        <div className="text-center text-[13px] text-taco-muted py-6">
          Tidak ada SKU.
        </div>
      ) : (
        <>
          {grouped.map(([cat, list]) => (
            <div key={cat}>
              <div className="text-[13px] font-bold text-taco-text uppercase tracking-wide pt-2.5 pb-1.5 border-b border-taco-divider mb-1.5">
                {cat.replace(/_/g, " ")}
              </div>
              {list.map((s) => (
                <SkuCard
                  key={s.id}
                  code={s.code}
                  name={s.name}
                  expanded={expandedId === s.id}
                  onToggle={() =>
                    setExpandedId(expandedId === s.id ? null : s.id)
                  }
                  data={values[s.id] ?? EMPTY_SKU_FORM}
                  onChange={(d) => onValueChange(s.id, d)}
                  preFilled={preFilledIds?.has(s.id)}
                  changed={changedIds?.has(s.id)}
                />
              ))}
            </div>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loading}
              className="w-full h-12 mt-2 rounded-[10px] border-2 border-dashed border-taco-border text-[14px] text-taco-sub"
            >
              {loading ? "Memuat…" : "Muat lebih banyak"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
