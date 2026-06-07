"use client";

import { cn } from "@/lib/utils";

export interface ContextOption {
  id: string;
  label: string;
}

interface VisitContextChipsProps {
  options: ContextOption[];
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
  loading?: boolean;
}

export function VisitContextChips({
  options,
  value,
  onChange,
  label = "Konteks kunjungan",
  loading,
}: VisitContextChipsProps) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div>
      <div className="text-[14px] font-medium text-taco-sub mb-2">{label}</div>
      {loading ? (
        <div className="text-[13px] text-taco-muted py-2">Memuat opsi…</div>
      ) : options.length === 0 ? (
        <div className="text-[13px] text-taco-muted py-2">
          Belum ada konteks dari admin.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = value.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={cn(
                  "h-[44px] px-4 rounded-full text-[14px] font-medium font-sans border-[1.5px]",
                  on
                    ? "border-taco-text bg-taco-text text-white"
                    : "border-taco-border bg-white text-taco-text"
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
