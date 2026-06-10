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
  getStoresV2,
  createStoreV2,
  updateStoreV2,
  deleteStoreV2,
  getAreas,
  unwrapList,
} from "@/lib/v2/api";
import type { StoreV2, AreaV2 } from "@/lib/v2/types";
import { MOCK_STORES, MOCK_AREAS } from "../_components/mockData";
import { useToast } from "../_components/useToast";

export default function StoresV2Page() {
  const [stores, setStores] = useState<StoreV2[]>([]);
  const [areas, setAreas] = useState<AreaV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [modal, setModal] = useState<{ open: boolean; row?: StoreV2 }>({
    open: false,
  });
  const [form, setForm] = useState<{ name: string; area_id: string }>({
    name: "",
    area_id: "",
  });
  const [busy, setBusy] = useState(false);
  const { show, node: toastNode } = useToast();

  const areaName = useCallback(
    (id: string) => areas.find((a) => a.id === id)?.name ?? "—",
    [areas]
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, aRes] = await Promise.all([getStoresV2(), getAreas()]);
      setStores(unwrapList<StoreV2>(sRes.data));
      setAreas(unwrapList<AreaV2>(aRes.data));
      setUsingMock(false);
    } catch {
      setStores(MOCK_STORES);
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
    return stores.filter((s) => {
      if (areaFilter && s.area_id !== areaFilter) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stores, search, areaFilter]);

  const openCreate = () => {
    setForm({ name: "", area_id: areaFilter || "" });
    setModal({ open: true });
  };
  const openEdit = (row: StoreV2) => {
    setForm({ name: row.name, area_id: row.area_id });
    setModal({ open: true, row });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.area_id) return;
    setBusy(true);
    const payload = { name: form.name.trim(), area_id: form.area_id };
    try {
      if (modal.row?.id) await updateStoreV2(modal.row.id, payload);
      else await createStoreV2(payload);
      await refetch();
      show(modal.row ? "Toko diperbarui" : "Toko ditambahkan");
    } catch {
      const area_name = areaName(form.area_id);
      if (modal.row?.id) {
        setStores((p) =>
          p.map((r) =>
            r.id === modal.row!.id ? { ...r, ...payload, area_name } : r
          )
        );
      } else {
        setStores((p) => [
          { id: `new-${Date.now()}`, area_name, ...payload },
          ...p,
        ]);
      }
      show(usingMock ? "Disimpan (mode demo)" : "Tersimpan lokal — BE belum siap");
    } finally {
      setBusy(false);
      setModal({ open: false });
    }
  };

  const handleDelete = async (row: StoreV2) => {
    if (!confirm(`Hapus toko "${row.name}"?`)) return;
    try {
      await deleteStoreV2(row.id);
      await refetch();
      show("Toko dihapus");
    } catch {
      setStores((p) => p.filter((r) => r.id !== row.id));
      show("Dihapus lokal — BE belum siap");
    }
  };

  const areaOptions = areas.map((a) => ({ value: a.id, label: a.name }));

  return (
    <>
      <CrudShell
        title="Toko"
        description="Daftar toko per area. Tim Taro memilih toko ini saat mengunggah invoice; toko baru yang diketik di PWA juga muncul di sini."
        addLabel="+ Tambah Toko"
        onAdd={openCreate}
        searchPlaceholder="Cari nama toko…"
        searchValue={search}
        onSearchChange={setSearch}
        extraActions={
          usingMock ? (
            <Badge tone="warn">Data demo — BE belum siap</Badge>
          ) : undefined
        }
      >
        <div className="px-4 py-3 border-b border-taco-divider flex items-center gap-4 flex-wrap bg-taco-page">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider">
              Area
            </span>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="h-[32px] text-[13px] border border-taco-border rounded-lg px-2.5 text-taco-text bg-white outline-none"
            >
              <option value="">Semua Area</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {areaFilter && (
            <button
              onClick={() => setAreaFilter("")}
              className="text-[12px] text-taco-sub hover:text-taco-text underline underline-offset-2"
            >
              Reset filter
            </button>
          )}
          <div className="ml-auto text-[12px] text-taco-muted">
            {filtered.length} / {stores.length} toko
          </div>
        </div>

        <table className="w-full">
          <TableHeader cols={["Nama Toko", "Area", "Ditambah Oleh", "Dibuat", ""]} />
          <tbody>
            {loading ? (
              <EmptyRow colSpan={5} label="Memuat toko…" />
            ) : filtered.length === 0 ? (
              <EmptyRow
                colSpan={5}
                label={
                  search || areaFilter
                    ? "Tidak ada toko yang cocok."
                    : "Belum ada toko. Klik + Tambah Toko untuk membuat."
                }
              />
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-taco-divider last:border-0 hover:bg-taco-page/60"
                >
                  <td className="px-4 py-3 text-[13px] font-medium text-taco-text">
                    {s.name}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub">
                    {s.area_name ?? areaName(s.area_id)}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub">
                    {s.created_by ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-muted">
                    {s.created_at?.slice(0, 10) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RowActions
                      onEdit={() => openEdit(s)}
                      onDelete={() => handleDelete(s)}
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
          title={modal.row ? "Edit Toko" : "Tambah Toko"}
          onClose={() => (busy ? null : setModal({ open: false }))}
          onSave={handleSave}
          busy={busy}
          saveDisabled={!form.name.trim() || !form.area_id}
        >
          <FormField
            label="Nama Toko"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="cth. Toko Bangunan Jaya Abadi"
          />
          <FormSelect
            label="Area"
            value={form.area_id}
            onChange={(v) => setForm((f) => ({ ...f, area_id: v }))}
            options={areaOptions}
            hint={
              areaOptions.length === 0
                ? "Belum ada area — tambah area dulu di tab Area."
                : undefined
            }
          />
        </Modal>
      )}

      {toastNode}
    </>
  );
}
