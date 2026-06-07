"use client";

import { useEffect, useState } from "react";
import {
  Modal,
  FormField,
  FormSelect,
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
}

const empty: SkuFormState = {
  code: "",
  name: "",
  catalog_category: "",
  product_line: "",
  unit: "lembar",
  min_price: "",
  max_price: "",
};

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
            }
          : empty
      );
      setBusy(false);
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave({
        code: form.code,
        name: form.name,
        catalog_category: form.catalog_category || null,
        product_line: form.product_line || null,
        unit: form.unit,
        min_price: form.min_price ? Number(form.min_price) : null,
        max_price: form.max_price ? Number(form.max_price) : null,
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
          label="Harga Min (IDR)"
          type="number"
          value={form.min_price}
          onChange={(v) => setForm({ ...form, min_price: v })}
        />
        <FormField
          label="Harga Max (IDR)"
          type="number"
          value={form.max_price}
          onChange={(v) => setForm({ ...form, max_price: v })}
        />
      </div>
    </Modal>
  );
}
