"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CrudShell,
  TableHeader,
  EmptyRow,
  RowActions,
  Badge,
} from "../../../admin/_components/CrudShell";
import { Modal, FormField } from "../../../admin/_components/Modal";
import {
  getAreas,
  createArea,
  updateArea,
  deleteArea,
  unwrapList,
} from "@/lib/v2/api";
import type { AreaV2 } from "@/lib/v2/types";
import { MOCK_AREAS } from "../_components/mockData";
import { useToast } from "../_components/useToast";

export default function AreasV2Page() {
  const [areas, setAreas] = useState<AreaV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; row?: AreaV2 }>({
    open: false,
  });
  const [form, setForm] = useState<{ name: string; code: string }>({
    name: "",
    code: "",
  });
  const [busy, setBusy] = useState(false);
  const { show, node: toastNode } = useToast();

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAreas();
      const data = unwrapList<AreaV2>(res.data);
      // Live endpoint up but empty is still "live" — only fall back to mock on error.
      setAreas(data);
      setUsingMock(false);
    } catch {
      setAreas(MOCK_AREAS);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return areas;
    return areas.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.code ?? "").toLowerCase().includes(q)
    );
  }, [areas, search]);

  const openCreate = () => {
    setForm({ name: "", code: "" });
    setModal({ open: true });
  };
  const openEdit = (row: AreaV2) => {
    setForm({ name: row.name, code: row.code ?? "" });
    setModal({ open: true, row });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || undefined,
    };
    try {
      if (modal.row?.id) await updateArea(modal.row.id, payload);
      else await createArea(payload);
      await refetch();
      show(modal.row ? "Area diperbarui" : "Area ditambahkan");
    } catch {
      // Optimistic local update so the scaffold is usable pre-BE.
      if (modal.row?.id) {
        setAreas((p) =>
          p.map((r) => (r.id === modal.row!.id ? { ...r, ...payload } : r))
        );
      } else {
        setAreas((p) => [
          { id: `new-${Date.now()}`, store_count: 0, ...payload },
          ...p,
        ]);
      }
      show(usingMock ? "Disimpan (mode demo)" : "Tersimpan lokal — BE belum siap", "ok");
    } finally {
      setBusy(false);
      setModal({ open: false });
    }
  };

  const handleDelete = async (row: AreaV2) => {
    if (
      !confirm(
        `Hapus area "${row.name}"? Toko di area ini bisa kehilangan referensi.`
      )
    )
      return;
    try {
      await deleteArea(row.id);
      await refetch();
      show("Area dihapus");
    } catch {
      setAreas((p) => p.filter((r) => r.id !== row.id));
      show("Dihapus lokal — BE belum siap", "ok");
    }
  };

  return (
    <>
      <CrudShell
        title="Area"
        description="Wilayah penjualan. Dipakai tim Taro saat memilih toko ketika mengunggah invoice."
        addLabel="+ Tambah Area"
        onAdd={openCreate}
        searchPlaceholder="Cari area atau kode…"
        searchValue={search}
        onSearchChange={setSearch}
        extraActions={
          usingMock ? (
            <Badge tone="warn">Data demo — BE belum siap</Badge>
          ) : undefined
        }
      >
        <table className="w-full">
          <TableHeader cols={["Nama Area", "Kode", "Jumlah Toko", "Dibuat", ""]} />
          <tbody>
            {loading ? (
              <EmptyRow colSpan={5} label="Memuat area…" />
            ) : filtered.length === 0 ? (
              <EmptyRow
                colSpan={5}
                label={
                  search
                    ? "Tidak ada area yang cocok."
                    : "Belum ada area. Klik + Tambah Area untuk membuat."
                }
              />
            ) : (
              filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-taco-divider last:border-0 hover:bg-taco-page/60"
                >
                  <td className="px-4 py-3 text-[13px] font-medium text-taco-text">
                    {a.name}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub">
                    {a.code ? (
                      <span className="font-mono">{a.code}</span>
                    ) : (
                      <span className="text-taco-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub">
                    {a.store_count ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-muted">
                    {a.created_at?.slice(0, 10) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RowActions
                      onEdit={() => openEdit(a)}
                      onDelete={() => handleDelete(a)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CrudShell>

      {modal.open && (
        <Modal
          title={modal.row ? "Edit Area" : "Tambah Area"}
          onClose={() => (busy ? null : setModal({ open: false }))}
          onSave={handleSave}
          busy={busy}
          saveDisabled={!form.name.trim()}
        >
          <FormField
            label="Nama Area"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="cth. Bandung"
          />
          <FormField
            label="Kode (opsional)"
            value={form.code}
            onChange={(v) => setForm((f) => ({ ...f, code: v }))}
            placeholder="cth. BDG"
            hint="Kode singkat untuk tampilan ringkas."
          />
        </Modal>
      )}

      {toastNode}
    </>
  );
}
