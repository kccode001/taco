"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createUser,
  deleteUser,
  getStores,
  getTerritories,
  getUsers,
  updateUser,
} from "@/lib/api";
import { CrudShell } from "../_components/CrudShell";
import { SEED_WILAYAH } from "../_components/constants";
import {
  StaffEditModal,
  type StaffFormState,
} from "./_components/StaffEditModal";
import {
  SalesStaffTable,
  type StaffRow,
} from "./_components/SalesStaffTable";
import type { ChecklistStore } from "./_components/StoreAssignmentChecklist";

interface Territory { id: string; name: string }

/** Mock fallbacks — used when BE isn't reachable so the page is still
 *  demoable. Real data comes from /api/users, /api/territories, /api/stores. */
const MOCK_STAFF: StaffRow[] = [
  {
    id: "rep-1", name: "Budi Santoso", phone: "0812-3456-7890", email: "budi@taco.id",
    territory_id: "wil-1", territory_name: "Tangerang Selatan",
    assigned_store_ids: ["s-1", "s-2", "s-7"],
    assigned_store_names: ["Maju Jaya", "Sumber Makmur", "Material Jaya"],
    active: true,
  },
  {
    id: "rep-2", name: "Sari Wulandari", phone: "0813-2233-4455", email: "sari@taco.id",
    territory_id: "wil-2", territory_name: "Bekasi",
    assigned_store_ids: ["s-3", "s-10"],
    assigned_store_names: ["Bangun Mandiri", "Karya Maju"],
    active: true,
  },
  {
    id: "rep-3", name: "Rudi Hartono", phone: "0857-9988-7766", email: "rudi@taco.id",
    territory_id: "wil-3", territory_name: "Jakarta Barat",
    assigned_store_ids: ["s-5"],
    assigned_store_names: ["Bangun Griya"],
    active: true,
  },
  {
    id: "rep-4", name: "Agus Prasetyo", phone: "0819-1122-3344", email: "agus@taco.id",
    territory_id: "wil-4", territory_name: "Jakarta Selatan",
    assigned_store_ids: [], assigned_store_names: [], active: false,
  },
];

const MOCK_STORES: ChecklistStore[] = [
  { id: "s-1", code: "TK-001", name: "Toko Bangunan Maju Jaya", territory_name: "Tangerang Selatan" },
  { id: "s-2", code: "TK-002", name: "UD Sumber Makmur", territory_name: "Tangerang Selatan" },
  { id: "s-3", code: "TK-003", name: "CV Bangun Mandiri", territory_name: "Bekasi" },
  { id: "s-5", code: "TK-005", name: "Toko Bangun Griya", territory_name: "Jakarta Barat" },
  { id: "s-7", code: "TK-007", name: "Toko Material Jaya Abadi", territory_name: "Tangerang Selatan" },
  { id: "s-10", code: "TK-010", name: "UD Karya Maju Sejahtera", territory_name: "Bekasi" },
  { id: "s-12", code: "TK-012", name: "Toko Besi Sentosa", territory_name: "Bekasi" },
];

export default function SalesStaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [stores, setStores] = useState<ChecklistStore[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; row?: StaffRow }>({ open: false });

  const refetch = useCallback(async () => {
    try {
      const [u, t, s] = await Promise.all([
        getUsers({ role: "rep" }),
        getTerritories(),
        getStores(),
      ]);
      const staffData = ((u.data as { data?: StaffRow[] })?.data ?? (u.data as StaffRow[])) ?? [];
      const territoryData = ((t.data as { data?: Territory[] })?.data ?? (t.data as Territory[])) ?? [];
      const storeData = ((s.data as { data?: ChecklistStore[] })?.data ?? (s.data as ChecklistStore[])) ?? [];
      setStaff(staffData.length ? staffData : MOCK_STAFF);
      setTerritories(
        territoryData.length
          ? territoryData
          : SEED_WILAYAH.map((w, i) => ({ id: `wil-${i + 1}`, name: w.name }))
      );
      setStores(storeData.length ? storeData : MOCK_STORES);
    } catch {
      setStaff(MOCK_STAFF);
      setTerritories(SEED_WILAYAH.map((w, i) => ({ id: `wil-${i + 1}`, name: w.name })));
      setStores(MOCK_STORES);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const filtered = staff.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.territory_name?.toLowerCase().includes(q) ?? false) ||
      (s.phone?.toLowerCase().includes(q) ?? false)
    );
  });

  const openNew = () => setModal({ open: true });
  const openEdit = (row: StaffRow) => setModal({ open: true, row });

  const initialFor = (row?: StaffRow): StaffFormState | undefined =>
    row && {
      id: row.id,
      name: row.name,
      email: row.email ?? "",
      phone: row.phone ?? "",
      territory_id: row.territory_id ?? "",
      active: row.active !== false,
      assigned_store_ids: row.assigned_store_ids ?? [],
    };

  const handleSave = async (form: StaffFormState) => {
    const payload = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      territory_id: form.territory_id || null,
      active: form.active,
      assigned_store_ids: form.assigned_store_ids,
      role: "rep",
    };
    try {
      if (modal.row?.id) await updateUser(modal.row.id, payload);
      else await createUser(payload);
      await refetch();
    } catch {
      // optimistic mock update
      const storeNames = form.assigned_store_ids
        .map((id) => stores.find((x) => x.id === id)?.name)
        .filter(Boolean) as string[];
      const territory = territories.find((t) => t.id === form.territory_id);
      if (modal.row?.id) {
        setStaff((p) =>
          p.map((r) =>
            r.id === modal.row?.id
              ? {
                  ...r,
                  name: form.name,
                  email: form.email,
                  phone: form.phone,
                  territory_id: form.territory_id,
                  territory_name: territory?.name,
                  active: form.active,
                  assigned_store_ids: form.assigned_store_ids,
                  assigned_store_names: storeNames,
                }
              : r
          )
        );
      } else {
        setStaff((p) => [
          ...p,
          {
            id: `rep-${Date.now()}`,
            name: form.name,
            email: form.email,
            phone: form.phone,
            territory_id: form.territory_id,
            territory_name: territory?.name,
            assigned_store_ids: form.assigned_store_ids,
            assigned_store_names: storeNames,
            active: form.active,
          },
        ]);
      }
    }
    setModal({ open: false });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus rep ini?")) return;
    try {
      await deleteUser(id);
      await refetch();
    } catch {
      setStaff((p) => p.filter((r) => r.id !== id));
    }
  };

  return (
    <>
      <CrudShell
        title="Sales Staff"
        description={`${filtered.length} rep · Kelola profil dan penugasan toko`}
        addLabel="+ Tambah Rep"
        onAdd={openNew}
        searchPlaceholder="Cari nama atau wilayah…"
        searchValue={search}
        onSearchChange={setSearch}
      >
        <SalesStaffTable rows={filtered} onEdit={openEdit} onDelete={handleDelete} />
      </CrudShell>

      <StaffEditModal
        open={modal.open}
        initial={initialFor(modal.row)}
        territories={territories}
        stores={stores}
        onClose={() => setModal({ open: false })}
        onSave={handleSave}
      />
    </>
  );
}
