"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteCompetitorSku,
  getCompetitorSkus,
  promoteCompetitorSku,
  updateCompetitorSku,
} from "@/lib/api";
import { CrudShell } from "../_components/CrudShell";
import { cn } from "@/lib/utils";
import { LibraryTable, type CompetitorSkuRow } from "./_components/LibraryTable";
import { PendingReviewTable } from "./_components/PendingReviewTable";

const MOCK: CompetitorSkuRow[] = [
  { id: "c-1", raw_name: "Krono Original 8mm AC4", canonical_name: "Krono Original 8mm AC4", competitor_brand: "Krono", mapped_sku_name: "TACO HPL Classic 8mm", flagged_for_review: false, detected_in: 14 },
  { id: "c-2", raw_name: "Pergo Sensation Oak", canonical_name: "Pergo Sensation Oak", competitor_brand: "Pergo", mapped_sku_name: "TACO Premium Oak", flagged_for_review: false, detected_in: 9 },
  { id: "c-3", raw_name: "Egger Pro Walnut H1146", canonical_name: "Egger Pro Walnut", competitor_brand: "Egger", mapped_sku_name: "TACO HPL Walnut", flagged_for_review: false, detected_in: 6 },
  { id: "c-4", raw_name: "Unilin LeafLk2 Strip", canonical_name: undefined, competitor_brand: "Unilin", flagged_for_review: true, flag_reason: "Teks tidak jelas", detected_in: 2 },
  { id: "c-5", raw_name: "Brand-xyz-9912", canonical_name: undefined, competitor_brand: undefined, flagged_for_review: true, flag_reason: "Brand tidak dikenal", detected_in: 1 },
];

export default function CompetitorSkusPage() {
  const [skus, setSkus] = useState<CompetitorSkuRow[]>([]);
  const [tab, setTab] = useState<"library" | "review">("review");
  const [search, setSearch] = useState("");

  const refetch = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (tab === "review") params.flagged = "true";
      if (search.trim()) params.search = search.trim();
      const res = await getCompetitorSkus(params);
      const data =
        ((res.data as { data?: CompetitorSkuRow[] })?.data ??
          (res.data as CompetitorSkuRow[])) ?? [];
      setSkus(data.length ? data : MOCK);
    } catch {
      setSkus(MOCK);
    }
  }, [tab, search]);

  useEffect(() => {
    const t = setTimeout(refetch, 250);
    return () => clearTimeout(t);
  }, [refetch]);

  const filtered = skus.filter((s) =>
    tab === "review" ? s.flagged_for_review : !s.flagged_for_review
  );

  const markNew = async (row: CompetitorSkuRow) => {
    try {
      await promoteCompetitorSku(row.id);
      await refetch();
    } catch {
      setSkus((p) =>
        p.map((r) =>
          r.id === row.id
            ? { ...r, flagged_for_review: false, canonical_name: r.canonical_name ?? r.raw_name }
            : r
        )
      );
    }
  };

  const ignore = async (row: CompetitorSkuRow) => {
    try {
      await updateCompetitorSku(row.id, { ignored: true });
      await refetch();
    } catch {
      setSkus((p) => p.filter((r) => r.id !== row.id));
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus entry SKU kompetitor ini?")) return;
    try {
      await deleteCompetitorSku(id);
      await refetch();
    } catch {
      setSkus((p) => p.filter((r) => r.id !== id));
    }
  };

  const map = () => {
    alert("Pemetaan ke TACO SKU akan tersedia di build berikutnya.");
  };

  const reviewCount = skus.filter((s) => s.flagged_for_review).length;
  const libraryCount = skus.filter((s) => !s.flagged_for_review).length;

  return (
    <CrudShell
      title="SKU Kompetitor"
      description="Peta SKU kompetitor dari OCR · Konfirmasi / petakan / tandai sebagai SKU baru"
      addLabel="+ Tambah Manual"
      onAdd={() =>
        alert("Tambah manual akan tersedia di build berikutnya — pustaka kompetitor saat ini dipopulasi dari OCR.")
      }
      searchPlaceholder="Cari nama atau brand…"
      searchValue={search}
      onSearchChange={setSearch}
    >
      <div className="px-4 py-3 border-b border-taco-divider flex gap-2 bg-taco-page">
        {(
          [
            { key: "review", label: "Perlu Review", count: reviewCount },
            { key: "library", label: "Pustaka", count: libraryCount },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "h-[32px] px-3 rounded-lg text-[13px] font-medium transition-colors",
              tab === t.key
                ? "bg-taco-text text-white"
                : "bg-white border border-taco-border text-taco-sub hover:text-taco-text"
            )}
          >
            {t.label}
            <span
              className={cn(
                "ml-1.5 text-[11px]",
                tab === t.key ? "text-white/70" : "text-taco-muted"
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {tab === "review" ? (
        <PendingReviewTable
          rows={filtered}
          onMap={map}
          onMarkNew={markNew}
          onIgnore={ignore}
        />
      ) : (
        <LibraryTable rows={filtered} onMap={map} onDelete={remove} />
      )}
    </CrudShell>
  );
}
