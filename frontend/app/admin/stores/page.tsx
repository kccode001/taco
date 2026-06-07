"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createStore,
  deleteStore,
  getStores,
  getTerritories,
  getUsers,
  updateStore,
} from "@/lib/api";
import { CrudShell } from "../_components/CrudShell";
import { SEED_WILAYAH } from "../_components/constants";
import { StoresTable, type StoreRow } from "./_components/StoresTable";
import {
  StoreEditModal,
  type StoreFormState,
} from "./_components/StoreEditModal";

const MOCK_STORES: StoreRow[] = [
  { id: "s-1", code: "TK-001", name: "Toko Bangunan Maju Jaya", address: "Jl. Raya BSD No. 45, Tangerang", type: "toko", territory_id: "wil-1", territory_name: "Tangerang Selatan", assigned_rep_id: "rep-1", assigned_rep_name: "Budi Santoso", active: true },
  { id: "s-2", code: "TK-002", name: "UD Sumber Makmur", address: "Jl. Pahlawan No. 12, Tangerang", type: "toko", territory_id: "wil-1", territory_name: "Tangerang Selatan", assigned_rep_id: "rep-1", assigned_rep_name: "Budi Santoso", active: true },
  { id: "s-3", code: "TK-003", name: "CV Bangun Mandiri", address: "Jl. Industri No. 88, Bekasi", type: "distributor", territory_id: "wil-2", territory_name: "Bekasi", assigned_rep_id: "rep-2", assigned_rep_name: "Sari Wulandari", active: true },
  { id: "s-5", code: "TK-005", name: "Workshop Kayu Sejati", address: "Jl. Mangga Dua No. 4, Jakbar", type: "workshop", territory_id: "wil-3", territory_name: "Jakarta Barat", active: true },
  { id: "s-7", code: "TK-007", name: "Toko Material Jaya Abadi", address: "Jl. Serpong Raya No. 22", type: "toko", territory_id: "wil-1", territory_name: "Tangerang Selatan", assigned_rep_id: "rep-1", assigned_rep_name: "Budi Santoso", active: true },
  { id: "s-10", code: "TK-010", name: "UD Karya Maju Sejahtera", address: "Jl. Cikarang Utama, Bekasi", type: "distributor", territory_id: "wil-2", territory_name: "Bekasi", active: true },
];

export default function StoresPage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [territories, setTerritories] = useState<{ id: string; name: string }[]>([]);
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; row?: StoreRow }>({ open: false });

  const refetch = useCallback(async () => {
    try {
      const [s, t, u] = await Promise.all([
        getStores(),
        getTerritories(),
        getUsers({ role: "rep" }),
      ]);
      const storeData =
        ((s.data as { data?: StoreRow[] })?.data ?? (s.data as StoreRow[])) ?? [];
      const territoryData =
        ((t.data as { data?: { id: string; name: string }[] })?.data ??
          (t.data as { id: string; name: string }[])) ?? [];
      const repData =
        ((u.data as { data?: { id: string; name: string }[] })?.data ??
          (u.data as { id: string; name: string }[])) ?? [];
      setStores(storeData.length ? storeData : MOCK_STORES);
      setTerritories(
        territoryData.length
          ? territoryData
          : SEED_WILAYAH.map((w, i) => ({ id: `wil-${i + 1}`, name: w.name }))
      );
      setReps(repData.length ? repData : [
        { id: "rep-1", name: "Budi Santoso" },
        { id: "rep-2", name: "Sari Wulandari" },
      ]);
    } catch {
      setStores(MOCK_STORES);
      setTerritories(SEED_WILAYAH.map((w, i) => ({ id: `wil-${i + 1}`, name: w.name })));
      setReps([
        { id: "rep-1", name: "Budi Santoso" },
        { id: "rep-2", name: "Sari Wulandari" },
      ]);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const filtered = stores.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      (s.territory_name?.toLowerCase().includes(q) ?? false)
    );
  });

  const handleSave = async (form: StoreFormState) => {
    const payload = {
      code: form.code,
      name: form.name,
      address: form.address,
      type: form.type,
      territory_id: form.territory_id || null,
      assigned_rep_id: form.assigned_rep_id || null,
      active: form.active,
    };
    try {
      if (modal.row?.id) await updateStore(modal.row.id, payload);
      else await createStore(payload);
      await refetch();
    } catch {
      const territory = territories.find((t) => t.id === form.territory_id);
      const rep = reps.find((r) => r.id === form.assigned_rep_id);
      if (modal.row?.id) {
        setStores((p) =>
          p.map((r) =>
            r.id === modal.row?.id
              ? { ...r, ...payload, territory_name: territory?.name, assigned_rep_name: rep?.name }
              : r
          )
        );
      } else {
        setStores((p) => [
          ...p,
          {
            id: `s-${Date.now()}`,
            ...payload,
            territory_name: territory?.name,
            assigned_rep_name: rep?.name,
          },
        ]);
      }
    }
    setModal({ open: false });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus toko ini?")) return;
    try {
      await deleteStore(id);
      await refetch();
    } catch {
      setStores((p) => p.filter((r) => r.id !== id));
    }
  };

  const unassigned = stores.filter((s) => !s.assigned_rep_id).length;

  return (
    <>
      <CrudShell
        title="Toko"
        description={`${stores.length} toko dalam katalog${unassigned ? ` · ${unassigned} perlu assign rep` : ""}`}
        addLabel="+ Tambah Toko"
        onAdd={() => setModal({ open: true })}
        searchPlaceholder="Cari kode atau nama toko…"
        searchValue={search}
        onSearchChange={setSearch}
      >
        <StoresTable
          rows={filtered}
          onEdit={(row) => setModal({ open: true, row })}
          onDelete={handleDelete}
        />
      </CrudShell>

      <StoreEditModal
        open={modal.open}
        initial={modal.row}
        territories={territories}
        reps={reps}
        onClose={() => setModal({ open: false })}
        onSave={handleSave}
      />
    </>
  );
}
