"use client";

import { useEffect, useState } from "react";
import {
  Modal,
  FormField,
  FormSelect,
} from "../../_components/Modal";
import {
  StoreAssignmentChecklist,
  type ChecklistStore,
} from "./StoreAssignmentChecklist";

export interface StaffFormState {
  id?: string;
  name: string;
  email: string;
  phone: string;
  territory_id: string;
  active: boolean;
  assigned_store_ids: string[];
}

export interface StaffEditModalProps {
  open: boolean;
  initial?: StaffFormState;
  territories: { id: string; name: string }[];
  stores: ChecklistStore[];
  onClose: () => void;
  onSave: (form: StaffFormState) => Promise<void> | void;
}

const empty: StaffFormState = {
  name: "",
  email: "",
  phone: "",
  territory_id: "",
  active: true,
  assigned_store_ids: [],
};

export function StaffEditModal({
  open,
  initial,
  territories,
  stores,
  onClose,
  onSave,
}: StaffEditModalProps) {
  const [form, setForm] = useState<StaffFormState>(initial ?? empty);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initial?.assigned_store_ids ?? [])
  );

  useEffect(() => {
    if (open) {
      setForm(initial ?? empty);
      setSelected(new Set(initial?.assigned_store_ids ?? []));
      setBusy(false);
    }
  }, [open, initial]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave({
        ...form,
        assigned_store_ids: Array.from(selected),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial?.id ? `Edit Sales Rep — ${initial.name}` : "Tambah Sales Rep"}
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Simpan Perubahan"
      size="wide"
      busy={busy}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Nama Lengkap"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
        />
        <FormField
          label="Email"
          type="email"
          value={form.email}
          onChange={(v) => setForm({ ...form, email: v })}
        />
        <FormField
          label="Nomor Telepon"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
        />
        <FormSelect
          label="Wilayah / Teritori"
          hint="Sumber: katalog Wilayah"
          value={form.territory_id}
          onChange={(v) => setForm({ ...form, territory_id: v })}
          options={territories.map((t) => ({ value: t.id, label: t.name }))}
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

      <div className="pt-2 border-t border-taco-divider">
        <label className="block text-[13px] font-medium text-taco-text mb-1.5">
          Toko yang Ditugaskan
        </label>
        <StoreAssignmentChecklist
          stores={stores}
          selectedIds={selected}
          onToggle={toggle}
        />
      </div>
    </Modal>
  );
}
