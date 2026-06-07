"use client";

import { cn } from "@/lib/utils";

interface FilterOption {
  id: string;
  label: string;
}

interface TerritoryFilterPillsProps {
  options: FilterOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  allLabel?: string;
}

export function TerritoryFilterPills({
  options,
  value,
  onChange,
  className,
  allLabel = "Semua",
}: TerritoryFilterPillsProps) {
  const items: FilterOption[] = [{ id: "", label: allLabel }, ...options];
  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto no-scrollbar bg-white px-5 pt-2.5 pb-3 border-b border-taco-divider",
        className
      )}
    >
      {items.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id || "all"}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "inline-flex items-center h-[44px] px-4 rounded-full text-[14px] font-medium whitespace-nowrap border-[1.5px] flex-shrink-0",
              active
                ? "bg-taco-text text-white border-taco-text"
                : "bg-white text-taco-sub border-taco-border"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
