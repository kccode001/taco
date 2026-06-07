"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  CrudShell,
  EmptyRow,
  RowActions,
  TableHeader,
} from "./CrudShell";
import { Modal, FormField, FormCheckbox } from "./Modal";

/** Reusable single-table CRUD shell for simple admin dictionaries:
 *  Visit Objectives, Visit Contexts, Wilayah.
 *  Each row has: name, optional code, optional sort_order, active. */
export interface DictionaryRow {
  id: string;
  name: string;
  code?: string;
  sort_order?: number;
  active?: boolean;
  system?: boolean;
}

interface DictionaryFormState {
  id?: string;
  name: string;
  code: string;
  sort_order: string;
  active: boolean;
}

const empty: DictionaryFormState = {
  name: "",
  code: "",
  sort_order: "",
  active: true,
};

interface CrudHandlers {
  list: () => Promise<{ data: unknown }>;
  create: (payload: Record<string, unknown>) => Promise<unknown>;
  update?: (id: string, payload: Record<string, unknown>) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

export function DictionaryCrudPage({
  title,
  description,
  addLabel,
  showCode,
  seed,
  handlers,
}: {
  title: string;
  description: string;
  addLabel: string;
  showCode?: boolean;
  seed: DictionaryRow[];
  handlers: CrudHandlers;
}) {
  const [items, setItems] = useState<DictionaryRow[]>([]);
  const [modal, setModal] = useState<{ open: boolean; row?: DictionaryRow }>({
    open: false,
  });
  const [form, setForm] = useState<DictionaryFormState>(empty);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await handlers.list();
      const data =
        ((res.data as { data?: DictionaryRow[] })?.data ??
          (res.data as DictionaryRow[])) ?? [];
      setItems(data.length ? data : seed);
    } catch {
      setItems(seed);
    }
  }, [handlers, seed]);

  useEffect(() => { refetch(); }, [refetch]);

  const openEdit = (row?: DictionaryRow) => {
    setForm(
      row
        ? {
            id: row.id,
            name: row.name,
            code: row.code ?? "",
            sort_order: row.sort_order?.toString() ?? "",
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
      code: form.code || null,
      sort_order: form.sort_order ? Number(form.sort_order) : null,
      active: form.active,
    };
    try {
      if (modal.row?.id) {
        if (handlers.update) {
          await handlers.update(modal.row.id, payload);
        } else {
          // No update endpoint — fall through to optimistic local update.
          throw new Error("no update endpoint");
        }
      } else {
        await handlers.create(payload);
      }
      await refetch();
    } catch {
      if (modal.row?.id) {
        setItems((p) =>
          p.map((r) =>
            r.id === modal.row?.id
              ? ({ ...r, ...payload } as DictionaryRow)
              : r
          )
        );
      } else {
        setItems((p) => [
          ...p,
          { id: `d-${Date.now()}`, ...payload } as DictionaryRow,
        ]);
      }
    } finally {
      setBusy(false);
      setModal({ open: false });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus entri ini?")) return;
    try {
      await handlers.remove(id);
      await refetch();
    } catch {
      setItems((p) => p.filter((r) => r.id !== id));
    }
  };

  const cols = showCode
    ? ["Nama", "Kode", "Urutan", "Status", "Aksi"]
    : ["Nama", "Urutan", "Status", "Aksi"];

  return (
    <>
      <CrudShell
        title={title}
        description={`${items.length} entri · ${description}`}
        addLabel={addLabel}
        onAdd={() => openEdit()}
      >
        <table className="w-full">
          <TableHeader cols={cols} />
          <tbody>
            {items.length === 0 ? (
              <EmptyRow colSpan={cols.length} label="Belum ada entri." />
            ) : (
              items.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
                >
                  <td className="px-4 py-3.5 text-[14px] font-medium text-taco-text">
                    {r.name}
                  </td>
                  {showCode && (
                    <td className="px-4 py-3.5 font-mono text-[12px] text-taco-muted">
                      {r.code || "—"}
                    </td>
                  )}
                  <td className="px-4 py-3.5 text-[13px] text-taco-sub">
                    {r.sort_order ?? "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge tone={r.active === false ? "muted" : "ok"}>
                      {r.active === false ? "Nonaktif" : "Aktif"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5">
                    <RowActions
                      onEdit={() => openEdit(r)}
                      onDelete={r.system ? undefined : () => remove(r.id)}
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
          title={
            modal.row?.id
              ? `Edit — ${modal.row.name}`
              : `Tambah ${title.split(" ")[0]}`
          }
          onClose={() => setModal({ open: false })}
          onSave={save}
          busy={busy}
        >
          <FormField
            label="Nama"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
          />
          {showCode && (
            <FormField
              label="Kode (opsional)"
              value={form.code}
              onChange={(v) => setForm({ ...form, code: v })}
              placeholder="contoh: TGR-SEL"
            />
          )}
          <FormField
            label="Urutan Tampil (opsional)"
            type="number"
            value={form.sort_order}
            onChange={(v) => setForm({ ...form, sort_order: v })}
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
