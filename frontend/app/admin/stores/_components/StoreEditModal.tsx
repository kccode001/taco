"use client";

import { useEffect, useState } from "react";
import {
  Modal,
  FormField,
  FormSelect,
} from "../../_components/Modal";
import { STORE_TYPES, type StoreTypeSlug } from "../../_components/constants";
import type { StoreRow } from "./StoresTable";

export interface StoreFormState {
  id?: string;
  code: string;
  name: string;
  address: string;
  type: StoreTypeSlug;
  territory_id: string;
  assigned_rep_id: string;
  active: boolean;
}

const empty: StoreFormState = {
  code: "",
  name: "",
  address: "",
  type: "toko",
  territory_id: "",
  assigned_rep_id: "",
  active: true,
};

export function StoreEditModal({
  open,
  initial,
  territories,
  reps,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: StoreRow;
  territories: { id: string; name: string }[];
  reps: { id: string; name: string }[];
  onClose: () => void;
  onSave: (form: StoreFormState) => Promise<void> | void;
}) {
  const [form, setForm] = useState<StoreFormState>(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              id: initial.id,
              code: initial.code ?? "",
              name: initial.name ?? "",
              address: initial.address ?? "",
              type: (initial.type ?? "toko") as StoreTypeSlug,
              territory_id: initial.territory_id ?? "",
              assigned_rep_id: initial.assigned_rep_id ?? "",
              active: initial.active !== false,
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
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial?.id ? `Edit Toko — ${initial.name}` : "Tambah Toko"}
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Simpan Perubahan"
      busy={busy}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Kode Toko"
          value={form.code}
          onChange={(v) => setForm({ ...form, code: v })}
        />
        <FormSelect
          label="Tipe"
          value={form.type}
          onChange={(v) => setForm({ ...form, type: v as StoreTypeSlug })}
          options={STORE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        />
        <div className="col-span-2">
          <FormField
            label="Nama Toko"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
          />
        </div>
        <div className="col-span-2">
          <FormField
            label="Alamat"
            value={form.address}
            onChange={(v) => setForm({ ...form, address: v })}
          />
        </div>
        <FormSelect
          label="Wilayah"
          hint="Sumber: katalog Wilayah"
          value={form.territory_id}
          onChange={(v) => setForm({ ...form, territory_id: v })}
          options={territories.map((t) => ({ value: t.id, label: t.name }))}
        />
        <FormSelect
          label="Sales Rep Ditugaskan"
          value={form.assigned_rep_id}
          onChange={(v) => setForm({ ...form, assigned_rep_id: v })}
          options={reps.map((r) => ({ value: r.id, label: r.name }))}
        />
        <FormSelect
          label="Status"
          value={form.active ? "active" : "inactive"}
          onChange={(v) => setForm({ ...form, active: v === "active" })}
          options={[
            { value: "active", label: "Aktif" },
            { value: "inactive", label: "Nonaktif" },
          ]}
        />
      </div>
    </Modal>
  );
}
