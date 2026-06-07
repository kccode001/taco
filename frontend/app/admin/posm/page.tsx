"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPosm,
  deletePosm,
  getPosm,
  updatePosm,
} from "@/lib/api";
import { Badge, CrudShell, EmptyRow, RowActions, TableHeader } from "../_components/CrudShell";
import {
  Modal,
  FormField,
  FormSelect,
  FormCheckbox,
} from "../_components/Modal";
import { POSM_OWNERS } from "../_components/constants";

interface PosmRow {
  id: string;
  name: string;
  owner: "taco" | "kompetitor";
  description?: string | null;
  photo_required?: boolean;
  active?: boolean;
}

interface FormState {
  id?: string;
  name: string;
  owner: "taco" | "kompetitor";
  description: string;
  photo_required: boolean;
  active: boolean;
}

const empty: FormState = {
  name: "",
  owner: "taco",
  description: "",
  photo_required: true,
  active: true,
};

const MOCK: PosmRow[] = [
  { id: "p-1", name: "Standing Banner TACO", owner: "taco", description: "Banner roll-up TACO di entrance toko", photo_required: true, active: true },
  { id: "p-2", name: "Shelf Strip TACO", owner: "taco", description: "Strip rak warna TACO", photo_required: true, active: true },
  { id: "p-3", name: "Price Tag TACO", owner: "taco", description: "Tag harga TACO printed", photo_required: true, active: true },
  { id: "p-4", name: "Banner Krono", owner: "kompetitor", description: "Banner roll-up brand Krono", photo_required: true, active: true },
  { id: "p-5", name: "POSM Pergo Display", owner: "kompetitor", description: "Display showcase Pergo", photo_required: true, active: true },
];

export default function PosmPage() {
  const [items, setItems] = useState<PosmRow[]>([]);
  const [modal, setModal] = useState<{ open: boolean; row?: PosmRow }>({ open: false });
  const [form, setForm] = useState<FormState>(empty);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await getPosm();
      const data = ((res.data as { data?: PosmRow[] })?.data ?? (res.data as PosmRow[])) ?? [];
      setItems(data.length ? data : MOCK);
    } catch {
      setItems(MOCK);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const openEdit = (row?: PosmRow) => {
    setForm(
      row
        ? {
            id: row.id,
            name: row.name,
            owner: row.owner,
            description: row.description ?? "",
            photo_required: row.photo_required !== false,
            active: row.active !== false,
          }
        : empty
    );
    setModal({ open: true, row });
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      name: form.name,
      owner: form.owner,
      description: form.description || null,
      photo_required: form.photo_required,
      active: form.active,
    };
    try {
      if (modal.row?.id) await updatePosm(modal.row.id, payload);
      else await createPosm(payload);
      await refetch();
    } catch {
      if (modal.row?.id) {
        setItems((p) =>
          p.map((r) => (r.id === modal.row?.id ? { ...r, ...payload } : r))
        );
      } else {
        setItems((p) => [...p, { id: `p-${Date.now()}`, ...payload }]);
      }
    } finally {
      setBusy(false);
      setModal({ open: false });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus aset POSM ini?")) return;
    try {
      await deletePosm(id);
      await refetch();
    } catch {
      setItems((p) => p.filter((r) => r.id !== id));
    }
  };

  return (
    <>
      <CrudShell
        title="POSM / Aset"
        description={`${items.length} aset · Drives slot foto di S7 (D4 audit POSM)`}
        addLabel="+ Tambah Aset"
        onAdd={() => openEdit()}
      >
        <table className="w-full">
          <TableHeader cols={["Nama Aset", "Pemilik", "Deskripsi", "Foto Wajib", "Status", "Aksi"]} />
          <tbody>
            {items.length === 0 ? (
              <EmptyRow colSpan={6} label="Belum ada aset POSM." />
            ) : (
              items.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
                >
                  <td className="px-4 py-3.5 text-[14px] font-medium text-taco-text">
                    {p.name}
                  </td>
                  <td className="px-4 py-3.5">
                    {/* AUDIT-009 §06 fix: TACO vs Kompetitor owner badge */}
                    <Badge tone={p.owner === "taco" ? "info" : "neutral"}>
                      {p.owner === "taco" ? "TACO" : "Kompetitor"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-taco-sub max-w-[320px]">
                    <div className="truncate">{p.description || "—"}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge tone={p.photo_required ? "ok" : "muted"}>
                      {p.photo_required ? "Wajib" : "Opsional"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge tone={p.active === false ? "muted" : "ok"}>
                      {p.active === false ? "Nonaktif" : "Aktif"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5">
                    <RowActions onEdit={() => openEdit(p)} onDelete={() => remove(p.id)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CrudShell>

      {modal.open && (
        <Modal
          title={modal.row?.id ? `Edit Aset — ${modal.row.name}` : "Tambah Aset POSM"}
          onClose={() => setModal({ open: false })}
          onSave={save}
          busy={busy}
        >
          <FormField
            label="Nama Aset"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
          />
          <FormSelect
            label="Pemilik"
            value={form.owner}
            onChange={(v) => setForm({ ...form, owner: v as FormState["owner"] })}
            options={POSM_OWNERS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <FormField
            label="Deskripsi"
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
            placeholder="Detail singkat untuk panduan rep"
          />
          <FormCheckbox
            label="Foto wajib di S7"
            checked={form.photo_required}
            onChange={(v) => setForm({ ...form, photo_required: v })}
          />
          <FormCheckbox
            label="Aktif"
            checked={form.active}
            onChange={(v) => setForm({ ...form, active: v })}
          />
        </Modal>
      )}
    </>
  );
}
