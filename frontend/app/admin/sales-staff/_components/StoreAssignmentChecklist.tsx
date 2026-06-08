"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "../../_components/icons";

export interface ChecklistStore {
  id: string;
  code: string;
  name: string;
  territory_name?: string;
}

/** Multi-select store assignment checklist with search.
 *  Used in the Sales Rep edit modal — picks which of the ~240 stores in the
 *  catalog this rep is assigned to. */
export function StoreAssignmentChecklist({
  stores,
  selectedIds,
  onToggle,
}: {
  stores: ChecklistStore[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return stores;
    const q = query.toLowerCase();
    return stores.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.territory_name?.toLowerCase().includes(q) ?? false)
    );
  }, [query, stores]);

  return (
    <div>
      <div className="text-[12px] text-taco-muted mb-2">
        Pilih satu atau lebih toko dari katalog ({stores.length} toko)
      </div>
      <div className="relative mb-2">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted">
          <SearchIcon size={14} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari kode, nama, atau wilayah toko…"
          className="w-full h-[40px] pl-9 pr-3 border border-taco-border rounded-lg text-[13px] text-taco-text bg-white outline-none focus:border-taco-text"
        />
      </div>
      <div className="border border-taco-border rounded-lg max-h-[260px] overflow-auto divide-y divide-taco-divider">
        {filtered.length === 0 ? (
          <div className="p-4 text-[13px] text-taco-muted text-center">
            Tidak ada toko yang cocok
          </div>
        ) : (
          filtered.map((s) => {
            const checked = selectedIds.has(s.id);
            return (
              <label
                key={s.id}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-taco-page min-h-[44px]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(s.id)}
                  className="w-[16px] h-[16px] accent-taco-text cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-taco-text">
                    <span className="font-mono text-[12px] text-taco-muted mr-2">
                      {s.code}
                    </span>
                    {s.name}
                  </div>
                  {s.territory_name && (
                    <div className="text-[11px] text-taco-muted">
                      {s.territory_name}
                    </div>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>
      <div className="text-[12px] text-taco-muted mt-1.5">
        {selectedIds.size} toko terpilih
      </div>
    </div>
  );
}
