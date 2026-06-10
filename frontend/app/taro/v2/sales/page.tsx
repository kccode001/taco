"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CrudShell,
  TableHeader,
  EmptyRow,
  RowActions,
  Badge,
} from "../../../admin/_components/CrudShell";
import {
  Modal,
  FormField,
  FormSelect,
  FormCheckbox,
} from "../../../admin/_components/Modal";
import {
  getSales,
  createSales,
  updateSales,
  deleteSales,
  getAreas,
  adaptSales,
  unwrapList,
} from "@/lib/v2/api";
import type { SalesAgentV2, AreaV2 } from "@/lib/v2/types";
import { MOCK_SALES, MOCK_AREAS } from "../_components/mockData";
import { useToast } from "../_components/useToast";

interface SalesForm {
  name: string;
  phone: string;
  email: string;
  area_id: string;
  active: boolean;
}

const EMPTY_FORM: SalesForm = {
  name: "",
  phone: "",
  email: "",
  area_id: "",
  active: true,
};

export default function SalesV2Page() {
  const [sales, setSales] = useState<SalesAgentV2[]>([]);
  const [areas, setAreas] = useState<AreaV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; row?: SalesAgentV2 }>({
    open: false,
  });
  const [form, setForm] = useState<SalesForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const { show, node: toastNode } = useToast();

  const areaName = useCallback(
    (id?: string) => (id ? areas.find((a) => a.id === id)?.name : undefined),
    [areas]
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, aRes] = await Promise.all([getSales(), getAreas()]);
      setSales(adaptSales(sRes.data));
      setAreas(unwrapList<AreaV2>(aRes.data));
      setUsingMock(false);
    } catch {
      setSales(MOCK_SALES);
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
    if (!q) return sales;
    return sales.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone ?? "").toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q)
    );
  }, [sales, search]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModal({ open: true });
  };
  const openEdit = (row: SalesAgentV2) => {
    setForm({
      name: row.name,
      phone: row.phone ?? "",
      email: row.email ?? "",
      area_id: row.area_id ?? "",
      active: row.active ?? true,
    });
    setModal({ open: true, row });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      area_id: form.area_id || undefined,
      active: form.active,
    };
    try {
      if (modal.row?.id) await updateSales(modal.row.id, payload);
      else await createSales(payload);
      await refetch();
      show(modal.row ? "Sales diperbarui" : "Sales ditambahkan");
    } catch {
      const area_name = areaName(form.area_id);
      if (modal.row?.id) {
        setSales((p) =>
          p.map((r) =>
            r.id === modal.row!.id ? { ...r, ...payload, area_name } : r
          )
        );
      } else {
        setSales((p) => [
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

  // Soft-deactivate (spec: no hard-delete for Sales — row stays visible as Nonaktif
  // to keep historical sales/invoice ties intact). BE remove() flips is_active=false.
  const handleDeactivate = async (row: SalesAgentV2) => {
    if (!confirm("Nonaktifkan sales ini?")) return;
    try {
      await deleteSales(row.id);
      await refetch();
      show("Sales dinonaktifkan");
    } catch {
      setSales((p) =>
        p.map((r) => (r.id === row.id ? { ...r, active: false } : r))
      );
      show("Dinonaktifkan lokal — BE belum siap");
    }
  };

  // Reactivate a Nonaktif row via the existing update endpoint (undo a misclick
  // without going through the edit form). BE update() maps active→is_active.
  const handleReactivate = async (row: SalesAgentV2) => {
    try {
      await updateSales(row.id, { active: true });
      await refetch();
      show("Sales diaktifkan");
    } catch {
      setSales((p) =>
        p.map((r) => (r.id === row.id ? { ...r, active: true } : r))
      );
      show("Diaktifkan lokal — BE belum siap");
    }
  };

  return (
    <>
      <CrudShell
        title="Sales"
        description="Tim sales / Taro agent. Kelola kontak dan status aktif."
        addLabel="+ Tambah Sales"
        onAdd={openCreate}
        searchPlaceholder="Cari nama, telepon, atau email…"
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
            cols={["Nama", "Telepon", "Email", "Area", "Status", ""]}
          />
          <tbody>
            {loading ? (
              <EmptyRow colSpan={6} label="Memuat sales…" />
            ) : filtered.length === 0 ? (
              <EmptyRow
                colSpan={6}
                label={
                  search
                    ? "Tidak ada sales yang cocok."
                    : "Belum ada sales. Klik + Tambah Sales untuk membuat."
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
                    {s.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub">
                    {s.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub">
                    {s.area_name ?? areaName(s.area_id) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {s.active === false ? (
                      <Badge tone="neutral">Nonaktif</Badge>
                    ) : (
                      <Badge tone="ok">Aktif</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RowActions
                      onEdit={() => openEdit(s)}
                      extra={
                        s.active === false ? (
                          <button
                            onClick={() => handleReactivate(s)}
                            className="h-[28px] px-2.5 border border-taco-border rounded-md text-[12px] text-taco-sub hover:text-taco-text hover:border-taco-text"
                          >
                            Aktifkan
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDeactivate(s)}
                            className="h-[28px] px-2.5 border border-taco-border rounded-md text-[12px] text-taco-sub hover:text-taco-error hover:border-taco-error"
                          >
                            Nonaktifkan
                          </button>
                        )
                      }
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
          title={modal.row ? "Edit Sales" : "Tambah Sales"}
          onClose={() => (busy ? null : setModal({ open: false }))}
          onSave={handleSave}
          busy={busy}
          saveDisabled={!form.name.trim()}
        >
          <FormField
            label="Nama"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="cth. Rudi Hartono"
          />
          <FormField
            label="Telepon (opsional)"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            placeholder="cth. 0812-1111-2222"
          />
          <FormField
            label="Email (opsional)"
            type="email"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            placeholder="cth. rudi@taco.co.id"
          />
          <FormSelect
            label="Area (opsional)"
            value={form.area_id}
            onChange={(v) => setForm((f) => ({ ...f, area_id: v }))}
            options={areas.map((a) => ({ value: a.id, label: a.name }))}
          />
          <FormCheckbox
            label="Aktif"
            checked={form.active}
            onChange={(v) => setForm((f) => ({ ...f, active: v }))}
            hint="Nonaktifkan jika sales sudah tidak bertugas."
          />
        </Modal>
      )}

      {toastNode}
    </>
  );
}
