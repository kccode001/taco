"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createCompetitorBrand,
  deleteCompetitorBrand,
  getCompetitorBrands,
  updateCompetitorBrand,
} from "@/lib/api";
import { CrudShell, TableHeader, EmptyRow, Badge, RowActions } from "../_components/CrudShell";
import {
  Modal,
  FormField,
  FormCheckbox,
} from "../_components/Modal";
import { SEED_COMPETITOR_BRANDS } from "../_components/constants";

interface BrandRow {
  id: string;
  name: string;
  country?: string | null;
  logo_url?: string | null;
  active?: boolean;
  system?: boolean;
}

interface FormState {
  id?: string;
  name: string;
  country: string;
  logo_url: string;
  active: boolean;
}

const emptyForm: FormState = {
  name: "",
  country: "",
  logo_url: "",
  active: true,
};

export default function CompetitorBrandsPage() {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [modal, setModal] = useState<{ open: boolean; row?: BrandRow }>({ open: false });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);

  const seedBrands: BrandRow[] = SEED_COMPETITOR_BRANDS.map((b, i) => ({
    id: `br-${i + 1}`,
    name: b.name,
    country: b.country,
    active: true,
    system: b.name === "Lainnya",
  }));

  const refetch = useCallback(async () => {
    try {
      const res = await getCompetitorBrands();
      const data =
        ((res.data as { data?: BrandRow[] })?.data ?? (res.data as BrandRow[])) ?? [];
      setBrands(data.length ? data : seedBrands);
    } catch {
      setBrands(seedBrands);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const openEdit = (row?: BrandRow) => {
    setForm(
      row
        ? {
            id: row.id,
            name: row.name,
            country: row.country ?? "",
            logo_url: row.logo_url ?? "",
            active: row.active !== false,
          }
        : emptyForm
    );
    setModal({ open: true, row });
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      name: form.name,
      country: form.country || null,
      logo_url: form.logo_url || null,
      active: form.active,
    };
    try {
      if (modal.row?.id) await updateCompetitorBrand(modal.row.id, payload);
      else await createCompetitorBrand(payload);
      await refetch();
    } catch {
      if (modal.row?.id) {
        setBrands((p) =>
          p.map((r) => (r.id === modal.row?.id ? { ...r, ...payload } : r))
        );
      } else {
        setBrands((p) => [...p, { id: `br-${Date.now()}`, ...payload }]);
      }
    } finally {
      setBusy(false);
      setModal({ open: false });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus brand ini?")) return;
    try {
      await deleteCompetitorBrand(id);
      await refetch();
    } catch {
      setBrands((p) => p.filter((r) => r.id !== id));
    }
  };

  return (
    <>
      <CrudShell
        title="Brand Kompetitor"
        description={`${brands.length} brand · Sumber chip brand di S2 Kompetitor (02 E)`}
        addLabel="+ Tambah Brand"
        onAdd={() => openEdit()}
      >
        <table className="w-full">
          <TableHeader cols={["Nama Brand", "Negara Asal", "Status", "Aksi"]} />
          <tbody>
            {brands.length === 0 ? (
              <EmptyRow colSpan={4} label="Belum ada brand." />
            ) : (
              brands.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
                >
                  <td className="px-4 py-3.5 text-[14px] font-medium text-taco-text">
                    {b.name}
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-taco-sub">
                    {b.country || "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    {b.system ? (
                      <Badge tone="info">Sistem</Badge>
                    ) : (
                      <Badge tone={b.active === false ? "muted" : "ok"}>
                        {b.active === false ? "Nonaktif" : "Aktif"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <RowActions
                      onEdit={() => openEdit(b)}
                      onDelete={b.system ? undefined : () => remove(b.id)}
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
          title={modal.row?.id ? `Edit Brand — ${modal.row.name}` : "Tambah Brand Kompetitor"}
          onClose={() => setModal({ open: false })}
          onSave={save}
          busy={busy}
        >
          <FormField
            label="Nama Brand"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
          />
          <FormField
            label="Negara Asal"
            value={form.country}
            onChange={(v) => setForm({ ...form, country: v })}
            placeholder="Indonesia / Germany / Belgium…"
          />
          <FormField
            label="URL Logo (opsional)"
            value={form.logo_url}
            onChange={(v) => setForm({ ...form, logo_url: v })}
            placeholder="https://…"
          />
          <FormCheckbox
            label="Aktif"
            checked={form.active}
            onChange={(v) => setForm({ ...form, active: v })}
            hint="Hanya brand aktif yang muncul sebagai chip di mobile."
          />
        </Modal>
      )}
    </>
  );
}
