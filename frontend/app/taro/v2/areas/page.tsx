"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CrudShell,
  TableHeader,
  EmptyRow,
  RowActions,
  Badge,
} from "../../../admin/_components/CrudShell";
import { Modal, FormField, FormSelect } from "../../../admin/_components/Modal";
import {
  getAreas,
  getStoresV2,
  getRegionsV2,
  createArea,
  updateArea,
  deleteArea,
  unwrapList,
} from "@/lib/v2/api";
import type { AreaV2, RegionBU } from "@/lib/v2/types";
import { MOCK_AREAS } from "../_components/mockData";
import { useToast } from "../_components/useToast";

export default function AreasV2Page() {
  const [areas, setAreas] = useState<AreaV2[]>([]);
  const [bus, setBus] = useState<RegionBU[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; row?: AreaV2 }>({
    open: false,
  });
  const [form, setForm] = useState<{
    name: string;
    code: string;
    parent_id: string;
  }>({ name: "", code: "", parent_id: "" });
  const [busy, setBusy] = useState(false);
  const { show, node: toastNode } = useToast();

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAreas();
      let data = unwrapList<AreaV2>(res.data);
      // Derive store counts client-side from the stores list (best-effort).
      try {
        const stores = unwrapList<{ area_id: string }>(
          (await getStoresV2()).data
        );
        if (stores.length) {
          const counts = stores.reduce<Record<string, number>>((m, s) => {
            if (s.area_id) m[s.area_id] = (m[s.area_id] ?? 0) + 1;
            return m;
          }, {});
          data = data.map((a) => ({
            ...a,
            store_count: a.store_count ?? counts[a.id] ?? 0,
          }));
        }
      } catch {
        /* leave store_count as-is */
      }
      setAreas(data);
      setUsingMock(false);
    } catch {
      setAreas(MOCK_AREAS);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load BUs for the parent picker (only needed on create modal open).
  const loadBus = useCallback(async () => {
    if (bus.length > 0) return;
    try {
      const res = await getRegionsV2({ type: "bu" });
      setBus(unwrapList<RegionBU>(res.data));
    } catch {
      /* BU picker unavailable — create still works without parent */
    }
  }, [bus.length]);

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
    setForm({ name: "", code: "", parent_id: "" });
    loadBus();
    setModal({ open: true });
  };
  const openEdit = (row: AreaV2) => {
    setForm({ name: row.name, code: row.code ?? "", parent_id: "" });
    setModal({ open: true, row });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      if (modal.row?.id) {
        // Edit: only name + code
        await updateArea(modal.row.id, {
          name: form.name.trim(),
          code: form.code.trim() || undefined,
        });
      } else {
        // Create: name + code + optional parent BU
        await createArea({
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          parent_id: form.parent_id || undefined,
        });
      }
      await refetch();
      show(modal.row ? "Area diperbarui" : "Area ditambahkan");
      setModal({ open: false });
    } catch {
      show("Gagal menyimpan area", "err");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (row: AreaV2) => {
    if (
      !confirm(
        `Hapus area "${row.name}"? Toko dan invoice di area ini akan terpengaruh.`
      )
    )
      return;
    try {
      await deleteArea(row.id);
      await refetch();
      show("Area dinonaktifkan");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Gagal menghapus area";
      show(msg, "err");
    }
  };

  return (
    <>
      <CrudShell
        title="Area"
        description="Wilayah penjualan ASM. Dipakai tim Taro saat memilih toko ketika mengunggah invoice."
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
          <TableHeader
            cols={["Nama Area", "Kode", "Jumlah Toko", "Dibuat", ""]}
          />
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
                      <span className="font-mono text-[11px]">{a.code}</span>
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
            placeholder="cth. ASM Bekasi"
          />
          <FormField
            label="Kode (opsional)"
            value={form.code}
            onChange={(v) => setForm((f) => ({ ...f, code: v }))}
            placeholder="cth. C-BU1-ASM-BEKASI"
            hint="Kode unik untuk area. Diisi otomatis jika dikosongkan."
          />
          {!modal.row && bus.length > 0 && (
            <FormSelect
              label="Parent BU (opsional)"
              value={form.parent_id}
              onChange={(v) => setForm((f) => ({ ...f, parent_id: v }))}
              options={bus.map((b) => ({ value: b.id, label: b.display_path }))}
              hint="Pilih BU induk untuk menempatkan area dalam hierarki wilayah."
            />
          )}
        </Modal>
      )}

      {toastNode}
    </>
  );
}
