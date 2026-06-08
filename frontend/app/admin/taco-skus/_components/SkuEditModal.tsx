"use client";

import { useEffect, useState } from "react";
import {
  Modal,
  FormField,
  FormSelect,
  FormTagInput,
} from "../../_components/Modal";
import { CATALOG_CATEGORIES, PRODUCT_LINES } from "../../_components/constants";
import type { TacoSkuRow } from "./SkuTable";

interface SkuFormState {
  id?: string;
  code: string;
  name: string;
  catalog_category: string;
  product_line: string;
  unit: string;
  min_price: string;
  max_price: string;
  /** "Harga Rata-rata (Rp)" — catalog column. Maps to BE `avg_price`. */
  avg_price: string;
  /** "Sinonim Nama Produk" chips. Maps to BE `product_name_aliases` (text[]). */
  product_name_aliases: string[];
  /** "Sinonim UOM" chips. Maps to BE `unit_aliases` (text[]). */
  unit_aliases: string[];
}

const empty: SkuFormState = {
  code: "",
  name: "",
  catalog_category: "",
  product_line: "",
  unit: "lembar",
  min_price: "",
  max_price: "",
  avg_price: "",
  product_name_aliases: [],
  unit_aliases: [],
};

/** Coerce a BE/mock value (string[] | "a, b, c" | undefined) to chips. */
function toChips(v?: string[] | string | null): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((s) => s && s.trim().length > 0);
  return v
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function SkuEditModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: TacoSkuRow;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void> | void;
}) {
  const [form, setForm] = useState<SkuFormState>(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              id: initial.id,
              code: initial.code ?? "",
              name: initial.name ?? "",
              catalog_category: initial.catalog_category ?? "",
              product_line: (initial.product_line as string) ?? "",
              unit: initial.unit ?? "lembar",
              min_price: initial.min_price?.toString() ?? "",
              max_price: initial.max_price?.toString() ?? "",
              avg_price: (
                initial.avg_price ??
                initial.average_price ??
                initial.standard_price ??
                ""
              ).toString(),
              product_name_aliases: toChips(
                initial.product_name_aliases ?? initial.synonyms,
              ),
              unit_aliases: toChips(
                initial.unit_aliases ?? initial.unit_synonyms,
              ),
            }
          : empty,
      );
      setBusy(false);
    }
  }, [open, initial]);

  if (!open) return null;

  const canSave =
    form.code.trim().length > 0 && form.name.trim().length > 0 && !busy;

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSave({
        code: form.code.trim(),
        name: form.name.trim(),
        catalog_category: form.catalog_category || null,
        product_line: form.product_line || null,
        unit: form.unit,
        min_price: form.min_price ? Number(form.min_price) : null,
        max_price: form.max_price ? Number(form.max_price) : null,
        // BE canonical column name. `standard_price` is kept in lockstep so
        // legacy consumers still see the right number until they migrate.
        avg_price: form.avg_price ? Number(form.avg_price) : null,
        standard_price: form.avg_price ? Number(form.avg_price) : null,
        // BE canonical text[] columns.
        product_name_aliases: form.product_name_aliases,
        unit_aliases: form.unit_aliases,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial?.id ? `Edit SKU — ${initial.name}` : "Tambah SKU TACO"}
      onClose={onClose}
      onSave={handleSave}
      busy={busy}
      saveDisabled={!canSave}
      size="wide"
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Kode SKU"
          value={form.code}
          onChange={(v) => setForm({ ...form, code: v })}
        />
        <FormField
          label="UOM"
          value={form.unit}
          onChange={(v) => setForm({ ...form, unit: v })}
        />
        <div className="col-span-2">
          <FormField
            label="Nama Produk"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
          />
        </div>
        <div className="col-span-2">
          <FormTagInput
            label="Sinonim Nama Produk"
            values={form.product_name_aliases}
            onChange={(v) => setForm({ ...form, product_name_aliases: v })}
            placeholder="Ketik sinonim, lalu tekan Enter"
            hint="Sinonim membantu OCR mengenali produk dari teks invoice. Contoh: FDB-8301-E, FDB8301E, Wall Panel Linen Beige, 8301"
          />
        </div>
        <div className="col-span-2">
          <FormTagInput
            label="Sinonim UOM"
            values={form.unit_aliases}
            onChange={(v) => setForm({ ...form, unit_aliases: v })}
            placeholder="Ketik sinonim UOM, lalu tekan Enter"
            hint="Contoh: lembar, panel, lbr, pcs"
          />
        </div>
        <FormSelect
          label="Kategori Katalog"
          value={form.catalog_category}
          onChange={(v) => setForm({ ...form, catalog_category: v })}
          options={CATALOG_CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
        <FormSelect
          label="Lini Produk"
          value={form.product_line}
          onChange={(v) => setForm({ ...form, product_line: v })}
          options={PRODUCT_LINES.map((p) => ({ value: p.slug, label: p.label }))}
        />
        <FormField
          label="Harga Min (Rp)"
          type="number"
          prefix="Rp"
          value={form.min_price}
          onChange={(v) => setForm({ ...form, min_price: v })}
        />
        <FormField
          label="Harga Rata-rata (Rp)"
          type="number"
          prefix="Rp"
          value={form.avg_price}
          onChange={(v) => setForm({ ...form, avg_price: v })}
        />
        <FormField
          label="Harga Max (Rp)"
          type="number"
          prefix="Rp"
          value={form.max_price}
          onChange={(v) => setForm({ ...form, max_price: v })}
        />
      </div>
    </Modal>
  );
}
