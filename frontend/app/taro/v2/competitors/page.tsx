"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CrudShell,
  TableHeader,
  EmptyRow,
  RowActions,
  Badge,
} from "@/app/admin/_components/CrudShell";
import { Modal } from "@/app/admin/_components/Modal";
import {
  getCompetitorBrands,
  createCompetitorBrand,
  updateCompetitorBrand,
  deleteCompetitorBrand,
  type CompetitorBrand,
} from "@/lib/api";
import { useToast } from "@/app/taro/v2/_components/useToast";

function unwrapBrands(data: unknown): CompetitorBrand[] {
  if (Array.isArray(data)) return data as CompetitorBrand[];
  const d = (data as { data?: CompetitorBrand[] })?.data;
  return Array.isArray(d) ? d : [];
}

type FormState = { name: string; country: string };

export default function CompetitorsV2Page() {
  const [brands, setBrands] = useState<CompetitorBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; row?: CompetitorBrand }>({ open: false });
  const [form, setForm] = useState<FormState>({ name: "", country: "" });
  const [busy, setBusy] = useState(false);
  const { show, node: toastNode } = useToast();

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCompetitorBrands();
      setBrands(unwrapBrands(res.data));
    } catch {
      setBrands([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) =>
      b.name.toLowerCase().includes(q) ||
      (b.country ?? "").toLowerCase().includes(q)
    );
  }, [brands, search]);

  const openCreate = () => {
    setForm({ name: "", country: "" });
    setModal({ open: true });
  };

  const openEdit = (row: CompetitorBrand) => {
    setForm({ name: row.name, country: row.country ?? "" });
    setModal({ open: true, row });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { name: form.name.trim() };
      if (form.country.trim()) payload.country = form.country.trim();
      if (modal.row) {
        await updateCompetitorBrand(modal.row.id, payload);
        show("Merek berhasil diperbarui.");
      } else {
        await createCompetitorBrand(payload);
        show("Merek berhasil ditambahkan.");
      }
      setModal({ open: false });
      await refetch();
    } catch {
      show("Gagal menyimpan merek.", "err");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (row: CompetitorBrand) => {
    if (!window.confirm(`Nonaktifkan merek "${row.name}"?`)) return;
    setBusy(true);
    try {
      await deleteCompetitorBrand(row.id);
      show("Merek dinonaktifkan.");
      await refetch();
    } catch {
      show("Gagal menonaktifkan merek.", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {toastNode}
      <CrudShell
        title="Merek Kompetitor"
        description="Daftar merek kompetitor yang digunakan dalam resolusi invoice."
        addLabel="+ Tambah Merek"
        onAdd={openCreate}
        searchPlaceholder="Cari nama atau asal negara…"
        searchValue={search}
        onSearchChange={setSearch}
      >
        {loading ? (
          <div className="px-4 py-8 text-center text-[13px] text-taco-muted">Memuat…</div>
        ) : (
          <table className="w-full">
            <TableHeader cols={["Nama Merek", "Negara", "Status", ""]} />
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={4} label="Belum ada merek kompetitor." />
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} className="border-b border-taco-divider last:border-0 hover:bg-taco-page">
                    <td className="px-4 py-3 text-[13px] font-medium text-taco-text">{b.name}</td>
                    <td className="px-4 py-3 text-[13px] text-taco-sub">{b.country ?? <span className="text-taco-muted italic">—</span>}</td>
                    <td className="px-4 py-3">
                      <Badge tone={b.is_active !== false ? "ok" : "muted"}>
                        {b.is_active !== false ? "Aktif" : "Tidak Aktif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <RowActions
                        onEdit={() => openEdit(b)}
                        onDelete={() => handleDelete(b)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </CrudShell>

      {modal.open && (
        <Modal
          title={modal.row ? "Edit Merek Kompetitor" : "Tambah Merek Kompetitor"}
          onClose={() => !busy && setModal({ open: false })}
          onSave={handleSave}
          busy={busy}
          saveLabel={modal.row ? "Simpan" : "Tambah"}
        >
          <div>
            <label className="block text-[13px] font-medium text-taco-text mb-1.5">
              Nama Merek <span className="text-taco-error">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Contoh: Armstrong, Egger, Pergo…"
              className="w-full h-[44px] px-3 border border-taco-border rounded-xl text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-taco-text mb-1.5">Asal Negara</label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              placeholder="Contoh: Malaysia, China, USA…"
              className="w-full h-[44px] px-3 border border-taco-border rounded-xl text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
            />
          </div>
        </Modal>
      )}
    </>
  );
}
