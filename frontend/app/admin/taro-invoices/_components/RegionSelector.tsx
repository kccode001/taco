"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RegionArea } from "@/lib/api";
import { ChevronDownIcon, SearchIcon, CheckIcon } from "../../_components/icons";

/** Searchable dropdown that lists every leaf-level ASM area as full hierarchy
 *  paths ("C - BU1 - ASM Cirebon"). Renders the seeded fallback when the BE
 *  hasn't shipped /api/regions/areas yet — caller passes the merged list in. */
export function RegionSelector({
  value,
  onChange,
  areas,
  loading,
  required = true,
}: {
  value: string | null;
  onChange: (id: string, area: RegionArea) => void;
  areas: RegionArea[];
  loading?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = areas.find((a) => a.id === value) ?? null;

  // Group filtered areas by their first hierarchy segment (e.g. "C - BU1")
  // to give the dropdown visual rhythm without losing the flat list shape.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? areas.filter(
          (a) =>
            a.display_path.toLowerCase().includes(q) ||
            a.code.toLowerCase().includes(q) ||
            a.name.toLowerCase().includes(q)
        )
      : areas;
    const map = new Map<string, RegionArea[]>();
    for (const a of filtered) {
      const parts = a.display_path.split(" - ");
      const groupKey = parts.slice(0, 2).join(" - ");
      const arr = map.get(groupKey) ?? [];
      arr.push(a);
      map.set(groupKey, arr);
    }
    return Array.from(map.entries());
  }, [areas, query]);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      // Focus the search input when the menu opens.
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
    }
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-[13px] font-semibold text-taco-text mb-1.5">
        Pilih wilayah ASM untuk invoice ini
        {required && <span className="text-taco-error ml-0.5">*</span>}
      </label>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full max-w-[480px] h-[44px] px-3.5 inline-flex items-center justify-between gap-2 border rounded-lg bg-white text-left transition-colors ${
          open
            ? "border-taco-text"
            : selected
            ? "border-taco-border hover:border-taco-text"
            : "border-taco-border hover:border-taco-sub"
        }`}
      >
        <span
          className={`truncate text-[13px] ${
            selected ? "text-taco-text font-medium" : "text-taco-muted"
          }`}
        >
          {selected ? selected.display_path : loading ? "Memuat wilayah…" : "Pilih wilayah…"}
        </span>
        <span className="text-taco-muted flex-shrink-0">
          <ChevronDownIcon size={16} />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full max-w-[480px] bg-white border border-taco-border rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-taco-divider relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-taco-muted">
              <SearchIcon size={13} />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari wilayah… (mis. Cirebon, Surabaya)"
              className="w-full h-[34px] pl-7 pr-2 text-[13px] text-taco-text bg-taco-page rounded-md outline-none border border-transparent focus:border-taco-text"
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1">
            {grouped.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-taco-muted">
                Tidak ada wilayah yang cocok dengan &ldquo;{query}&rdquo;.
              </div>
            ) : (
              grouped.map(([groupKey, items]) => (
                <div key={groupKey} className="py-1">
                  <div className="px-3 py-1 text-[10px] font-semibold tracking-wider uppercase text-taco-muted">
                    {groupKey}
                  </div>
                  {items.map((a) => {
                    const isSelected = a.id === value;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          onChange(a.id, a);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-[13px] transition-colors min-h-[40px] ${
                          isSelected
                            ? "bg-taco-page text-taco-text font-semibold"
                            : "text-taco-text hover:bg-taco-page"
                        }`}
                      >
                        <span className="truncate">{a.display_path}</span>
                        {isSelected && (
                          <span className="text-taco-success flex-shrink-0">
                            <CheckIcon size={14} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className="px-3 py-2 border-t border-taco-divider text-[11px] text-taco-muted">
            {areas.length} wilayah ASM tersedia.
          </div>
        </div>
      )}
    </div>
  );
}
