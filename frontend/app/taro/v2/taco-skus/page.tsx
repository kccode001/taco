"use client";

/** TACO v2 — Product Knowledge (SKU catalog).
 *  The catalog (TacoSku) is shared between v1 and v2 — v2 line-item resolution
 *  maps against these same SKUs — so this view mirrors the v1
 *  `app/taro/taco-skus` page and reuses the shared admin catalog components
 *  (SkuTable / SkuEditModal / CsvImportModal). v1 is FROZEN: this is a
 *  copy-forward under the v2 shell, not an edit of the v1 route. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTacoSku,
  deleteTacoSku,
  getTacoSkus,
  updateTacoSku,
} from "@/lib/api";
import { CrudShell } from "@/app/admin/_components/CrudShell";
import {
  CATALOG_CATEGORIES,
  PRODUCT_LINES,
} from "@/app/admin/_components/constants";
import { UploadIcon } from "@/app/admin/_components/icons";
import {
  SkuTable,
  type TacoSkuRow,
} from "@/app/admin/taco-skus/_components/SkuTable";
import { SkuEditModal } from "@/app/admin/taco-skus/_components/SkuEditModal";
import { CsvImportModal } from "@/app/admin/taco-skus/_components/CsvImportModal";

export default function ProductKnowledgeV2Page() {
  const [skus, setSkus] = useState<TacoSkuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [productLine, setProductLine] = useState<string>("");
  const [catalogCategory, setCatalogCategory] = useState<string>("");
  const [modal, setModal] = useState<{ open: boolean; row?: TacoSkuRow }>({
    open: false,
  });
  const [csvOpen, setCsvOpen] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      if (productLine) params.product_line = productLine;
      if (catalogCategory) params.catalog_category = catalogCategory;
      const res = await getTacoSkus(params);
      const data =
        ((res.data as { data?: TacoSkuRow[] })?.data ??
          (res.data as TacoSkuRow[])) ?? [];
      setSkus(data);
    } catch {
      setSkus([]);
    } finally {
      setLoading(false);
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
        const rawSyns = s.product_name_aliases ?? s.synonyms;
        const syns = Array.isArray(rawSyns)
          ? rawSyns
          : typeof rawSyns === "string"
            ? rawSyns.split(/[,\n]/g)
            : [];
        const synMatch = syns.some((syn) =>
          syn.trim().toLowerCase().includes(q)
        );
        if (
          !s.name.toLowerCase().includes(q) &&
          !s.code.toLowerCase().includes(q) &&
          !synMatch
        )
          return false;
      }
      if (productLine && s.product_line !== productLine) return false;
      if (catalogCategory && s.catalog_category !== catalogCategory)
        return false;
      return true;
    });
  }, [skus, search, productLine, catalogCategory]);

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
        title="Product Knowledge"
        description="Katalog SKU TACO yang dipakai sistem untuk mencocokkan baris invoice. Kelola kode, nama, sinonim, dan harga di sini."
        addLabel="+ Tambah SKU"
        onAdd={() => setModal({ open: true })}
        searchPlaceholder="Cari kode, nama, atau sinonim…"
        searchValue={search}
        onSearchChange={setSearch}
        extraActions={
          <button
            onClick={() => setCsvOpen(true)}
            className="flex items-center gap-1.5 h-[36px] px-3 border border-taco-border rounded-lg text-[13px] font-medium text-taco-sub hover:text-taco-text hover:border-taco-text bg-white"
          >
            <UploadIcon size={13} />
            Impor CSV
          </button>
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
            {loading ? "Memuat…" : `${filtered.length} / ${skus.length} SKU`}
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
