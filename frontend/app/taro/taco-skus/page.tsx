"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTacoSku,
  deleteTacoSku,
  getTacoSkus,
  updateTacoSku,
} from "@/lib/api";
import { CrudShell } from "../../admin/_components/CrudShell";
import {
  CATALOG_CATEGORIES,
  PRODUCT_LINES,
} from "../../admin/_components/constants";
import { UploadIcon } from "../../admin/_components/icons";
import {
  SkuTable,
  type TacoSkuRow,
} from "../../admin/taco-skus/_components/SkuTable";
import { SkuEditModal } from "../../admin/taco-skus/_components/SkuEditModal";
import { CsvImportModal } from "../../admin/taco-skus/_components/CsvImportModal";

/** Mock fallback when the BE isn't reachable. Same seed used by /admin. */
const MOCK_SKUS: TacoSkuRow[] = [
  { id: "1", code: "TH-001-12-MAP", name: "TACO HPL Maple Solid 12mm", catalog_category: "Laminates", product_line: "taco_hpl", unit: "lembar", min_price: 215000, max_price: 245000, average_price: 230000, synonyms: ["HPL Maple", "TC Maple 12", "Maple Solid"], unit_synonyms: ["lbr", "sheet"], embedded: true },
  { id: "2", code: "TI-008-3-WAL", name: "TIero HPL Walnut Premium 3mm", catalog_category: "Laminates", product_line: "tiero", unit: "lembar", min_price: 380000, max_price: 420000, average_price: 400000, synonyms: ["TIero Walnut", "Walnut PRM", "WLN Premium"], unit_synonyms: ["lbr"], embedded: true },
  { id: "3", code: "ES-002-3-NTR", name: "ECO HPL Natural Oak 3mm", catalog_category: "Laminates", product_line: "eco_hpl", unit: "lembar", min_price: 165000, max_price: 185000, average_price: 175000, synonyms: ["ECO Oak", "Nat Oak 3mm"], embedded: true },
  { id: "4", code: "TS-101-1220", name: "TACO Sheet Beech 1220mm", catalog_category: "Laminates", product_line: "taco_sheet", unit: "lembar", min_price: 295000, max_price: 320000, average_price: 308000, synonyms: ["TC Sheet Beech"], embedded: true },
  { id: "5", code: "TE-2MM-W", name: "TACO Edging ABS 2mm Walnut", catalog_category: "Laminates", product_line: "taco_edging", unit: "meter", min_price: 14000, max_price: 17500, average_price: 15500, synonyms: ["TC Edging 2mm", "Edging WLN"], unit_synonyms: ["m"], embedded: true },
  { id: "6", code: "HW-HNG-01", name: "TACO Hardware Hinge SoftClose", catalog_category: "Hardware", product_line: "taco_hardware", unit: "pcs", min_price: 28000, max_price: 35000, average_price: 31500, synonyms: ["Engsel SoftClose"], embedded: true },
  { id: "7", code: "TV-LUX-405", name: "Vinyl Luxury Plank 4mm Oak", catalog_category: "Flooring", product_line: "vinyl", unit: "m²", min_price: 95000, max_price: 115000, average_price: 105000, synonyms: ["Vinyl Lux Plank", "LVP Oak 4mm"], embedded: true },
  { id: "8", code: "FD-MDF-9MM", name: "FIDECO MDF 9mm 1220x2440", catalog_category: "FIDECO", product_line: "fideco", unit: "lembar", min_price: 145000, max_price: 165000, average_price: 155000, synonyms: ["MDF Fideco", "Fideco 9mm"], embedding_status: "pending" },
];

function isEmbedded(s: TacoSkuRow): boolean {
  if (s.embedding_status) return s.embedding_status === "done";
  return !!s.embedded;
}

export default function TacoSkusPage() {
  const [skus, setSkus] = useState<TacoSkuRow[]>([]);
  const [search, setSearch] = useState("");
  const [productLine, setProductLine] = useState<string>("");
  const [catalogCategory, setCatalogCategory] = useState<string>("");
  const [modal, setModal] = useState<{ open: boolean; row?: TacoSkuRow }>({ open: false });
  const [csvOpen, setCsvOpen] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      if (productLine) params.product_line = productLine;
      if (catalogCategory) params.catalog_category = catalogCategory;
      const res = await getTacoSkus(params);
      const data =
        ((res.data as { data?: TacoSkuRow[] })?.data ?? (res.data as TacoSkuRow[])) ?? [];
      setSkus(data.length ? data : MOCK_SKUS);
    } catch {
      setSkus(MOCK_SKUS);
    }
  }, [search, productLine, catalogCategory]);

  useEffect(() => {
    const t = setTimeout(refetch, 250);
    return () => clearTimeout(t);
  }, [refetch]);

  const filtered = useMemo(() => {
    return skus.filter((s) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const syns = Array.isArray(s.synonyms)
          ? s.synonyms
          : typeof s.synonyms === "string"
            ? s.synonyms.split(/[,\n]/g)
            : [];
        const synMatch = syns.some((syn) => syn.trim().toLowerCase().includes(q));
        if (
          !s.name.toLowerCase().includes(q) &&
          !s.code.toLowerCase().includes(q) &&
          !synMatch
        )
          return false;
      }
      if (productLine && s.product_line !== productLine) return false;
      if (catalogCategory && s.catalog_category !== catalogCategory) return false;
      return true;
    });
  }, [skus, search, productLine, catalogCategory]);

  // RAG / embedding status across the loaded catalog.
  const ragStats = useMemo(() => {
    const total = skus.length;
    const embedded = skus.filter(isEmbedded).length;
    const pct = total > 0 ? Math.round((embedded / total) * 100) : 0;
    return { total, embedded, pct };
  }, [skus]);

  const handleSave = async (payload: Record<string, unknown>) => {
    try {
      if (modal.row?.id) await updateTacoSku(modal.row.id, payload);
      else await createTacoSku(payload);
      await refetch();
    } catch {
      if (modal.row?.id) {
        setSkus((p) =>
          p.map((r) =>
            r.id === modal.row?.id ? ({ ...r, ...payload } as TacoSkuRow) : r
          )
        );
      } else {
        setSkus((p) => [
          { id: `new-${Date.now()}`, ...payload } as TacoSkuRow,
          ...p,
        ]);
      }
    }
    setModal({ open: false });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus SKU ini?")) return;
    try {
      await deleteTacoSku(id);
      await refetch();
    } catch {
      setSkus((p) => p.filter((r) => r.id !== id));
    }
  };

  return (
    <>
      <CrudShell
        title="Katalog SKU TACO"
        description={`${skus.length} SKU · Drives OCR matching dan voice extraction`}
        addLabel="+ Tambah SKU"
        onAdd={() => setModal({ open: true })}
        searchPlaceholder="Cari kode, nama, atau sinonim…"
        searchValue={search}
        onSearchChange={setSearch}
        extraActions={
          <>
            <div
              className="inline-flex items-center gap-2 h-[36px] px-3 border border-taco-border rounded-lg bg-white text-[12px]"
              title="RAG embedding coverage"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  ragStats.pct >= 80
                    ? "bg-taco-success"
                    : ragStats.pct >= 50
                      ? "bg-taco-warning"
                      : "bg-taco-error"
                }`}
              />
              <span className="text-taco-sub">RAG</span>
              <span className="text-taco-text font-semibold">
                {ragStats.embedded}/{ragStats.total}
              </span>
              <span className="text-taco-muted">
                ({ragStats.pct}%)
              </span>
            </div>
            <button
              onClick={() => setCsvOpen(true)}
              className="flex items-center gap-1.5 h-[36px] px-3 border border-taco-border rounded-lg text-[13px] font-medium text-taco-sub hover:text-taco-text hover:border-taco-text bg-white"
            >
              <UploadIcon size={13} />
              Impor CSV
            </button>
          </>
        }
      >
        <div className="px-4 py-3 border-b border-taco-divider flex items-center gap-4 flex-wrap bg-taco-page">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider">
              Lini Produk
            </span>
            <select
              value={productLine}
              onChange={(e) => setProductLine(e.target.value)}
              className="h-[32px] text-[13px] border border-taco-border rounded-lg px-2.5 text-taco-text bg-white outline-none"
            >
              <option value="">Semua (8 lini)</option>
              {PRODUCT_LINES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider">
              Kategori Katalog
            </span>
            <select
              value={catalogCategory}
              onChange={(e) => setCatalogCategory(e.target.value)}
              className="h-[32px] text-[13px] border border-taco-border rounded-lg px-2.5 text-taco-text bg-white outline-none"
            >
              <option value="">Semua (4 kategori)</option>
              {CATALOG_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {(productLine || catalogCategory) && (
            <button
              onClick={() => {
                setProductLine("");
                setCatalogCategory("");
              }}
              className="text-[12px] text-taco-sub hover:text-taco-text underline underline-offset-2"
            >
              Reset filter
            </button>
          )}
          <div className="ml-auto text-[12px] text-taco-muted">
            {filtered.length} / {skus.length} SKU
          </div>
        </div>

        <SkuTable
          rows={filtered}
          onEdit={(row) => setModal({ open: true, row })}
          onDelete={handleDelete}
        />
      </CrudShell>

      <SkuEditModal
        open={modal.open}
        initial={modal.row}
        onClose={() => setModal({ open: false })}
        onSave={handleSave}
      />
      <CsvImportModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onComplete={refetch}
      />
    </>
  );
}
