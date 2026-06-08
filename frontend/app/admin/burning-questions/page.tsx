"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createBurningQuestion,
  deleteBurningQuestion,
  getBurningQuestions,
  getStores,
  getTerritories,
  updateBurningQuestion,
} from "@/lib/api";
import { Badge, CrudShell, RowActions } from "../_components/CrudShell";
import {
  Modal,
  FormField,
  FormSelect,
  FormTextarea,
  FormCheckbox,
} from "../_components/Modal";
import { BURNING_Q_SCOPE, SEED_WILAYAH } from "../_components/constants";

interface QRow {
  id: string;
  text: string;
  scope_type: "company" | "region" | "store";
  scope_id?: string | null;
  scope_label?: string;
  priority?: number;
  period_start?: string;
  period_end?: string;
  active?: boolean;
}

interface FormState {
  id?: string;
  text: string;
  scope_type: "company" | "region" | "store";
  scope_id: string;
  priority: string;
  period_start: string;
  period_end: string;
  active: boolean;
}

const empty: FormState = {
  text: "",
  scope_type: "company",
  scope_id: "",
  priority: "1",
  period_start: "",
  period_end: "",
  active: true,
};

const MOCK: QRow[] = [
  { id: "q-1", text: "Apakah ada perubahan distributor utama di toko ini dalam 30 hari terakhir?", scope_type: "company", priority: 1, period_start: "2026-06-01", period_end: "2026-06-30", active: true },
  { id: "q-2", text: "Produk TACO apa yang paling sering ditanyakan customer bulan ini?", scope_type: "company", priority: 2, period_start: "2026-06-01", period_end: "2026-06-30", active: true },
  { id: "q-3", text: "Apakah ada produk kompetitor baru yang masuk ke toko dalam 2 minggu terakhir?", scope_type: "region", scope_label: "Tangerang Selatan", priority: 3, period_start: "2026-06-01", period_end: "2026-06-30", active: true },
];

export default function BurningQuestionsPage() {
  const [items, setItems] = useState<QRow[]>([]);
  const [modal, setModal] = useState<{ open: boolean; row?: QRow }>({ open: false });
  const [form, setForm] = useState<FormState>(empty);
  const [territories, setTerritories] = useState<{ id: string; name: string }[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const [q, t, s] = await Promise.all([
        getBurningQuestions(),
        getTerritories(),
        getStores(),
      ]);
      const data =
        ((q.data as { data?: QRow[] })?.data ?? (q.data as QRow[])) ?? [];
      const td =
        ((t.data as { data?: { id: string; name: string }[] })?.data ??
          (t.data as { id: string; name: string }[])) ?? [];
      const sd =
        ((s.data as { data?: { id: string; name: string }[] })?.data ??
          (s.data as { id: string; name: string }[])) ?? [];
      setItems(data.length ? data : MOCK);
      setTerritories(
        td.length ? td : SEED_WILAYAH.map((w, i) => ({ id: `wil-${i + 1}`, name: w.name }))
      );
      setStores(sd.length ? sd : []);
    } catch {
      setItems(MOCK);
      setTerritories(SEED_WILAYAH.map((w, i) => ({ id: `wil-${i + 1}`, name: w.name })));
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const openEdit = (row?: QRow) => {
    setForm(
      row
        ? {
            id: row.id,
            text: row.text,
            scope_type: row.scope_type,
            scope_id: row.scope_id ?? "",
            priority: row.priority?.toString() ?? "1",
            period_start: row.period_start ?? "",
            period_end: row.period_end ?? "",
            active: row.active !== false,
          }
        : empty
    );
    setModal({ open: true, row });
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      text: form.text,
      scope_type: form.scope_type,
      scope_id: form.scope_type === "company" ? null : form.scope_id || null,
      priority: Number(form.priority) || 1,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      active: form.active,
    };
    try {
      if (modal.row?.id) await updateBurningQuestion(modal.row.id, payload);
      else await createBurningQuestion(payload);
      await refetch();
    } catch {
      if (modal.row?.id) {
        setItems((p) =>
          p.map((r) =>
            r.id === modal.row?.id
              ? ({ ...r, ...payload, scope_label: scopeLabelFor(form, territories, stores) } as QRow)
              : r
          )
        );
      } else {
        setItems((p) => [
          ...p,
          {
            id: `q-${Date.now()}`,
            ...payload,
            scope_label: scopeLabelFor(form, territories, stores),
          } as QRow,
        ]);
      }
    } finally {
      setBusy(false);
      setModal({ open: false });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus pertanyaan ini?")) return;
    try {
      await deleteBurningQuestion(id);
      await refetch();
    } catch {
      setItems((p) => p.filter((r) => r.id !== id));
    }
  };

  return (
    <>
      <CrudShell
        title="Pertanyaan Prioritas"
        description={`${items.length} pertanyaan · 3 wajib muncul per kunjungan (F-1)`}
        addLabel="+ Tambah Pertanyaan"
        onAdd={() => openEdit()}
      >
        <div className="divide-y divide-taco-divider">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-taco-muted">
              Belum ada pertanyaan prioritas.
            </div>
          ) : (
            items.map((q) => (
              <div
                key={q.id}
                className="flex items-start gap-3 px-4 py-3.5 hover:bg-taco-page"
              >
                <div className="text-[11px] font-mono text-taco-muted bg-taco-page border border-taco-border rounded-md px-2 py-0.5 mt-0.5 min-w-[28px] text-center">
                  #{q.priority ?? "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] text-taco-text">{q.text}</div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <Badge tone="neutral">
                      {q.scope_type === "company"
                        ? "Seluruh perusahaan"
                        : q.scope_type === "region"
                          ? `Wilayah${q.scope_label ? ` · ${q.scope_label}` : ""}`
                          : `Toko${q.scope_label ? ` · ${q.scope_label}` : ""}`}
                    </Badge>
                    {q.period_start && q.period_end && (
                      <Badge tone="muted">
                        {q.period_start} → {q.period_end}
                      </Badge>
                    )}
                    <Badge tone={q.active === false ? "muted" : "ok"}>
                      {q.active === false ? "Nonaktif" : "Aktif"}
                    </Badge>
                  </div>
                </div>
                <RowActions onEdit={() => openEdit(q)} onDelete={() => remove(q.id)} />
              </div>
            ))
          )}
        </div>
      </CrudShell>

      {modal.open && (
        <Modal
          title={modal.row?.id ? "Edit Pertanyaan" : "Tambah Pertanyaan Prioritas"}
          onClose={() => setModal({ open: false })}
          onSave={save}
          busy={busy}
        >
          <FormTextarea
            label="Teks Pertanyaan"
            value={form.text}
            onChange={(v) => setForm({ ...form, text: v })}
            rows={3}
            placeholder="Contoh: Apakah ada perubahan distributor utama dalam 30 hari terakhir?"
          />
          <div className="grid grid-cols-2 gap-4">
            <FormSelect
              label="Lingkup"
              value={form.scope_type}
              onChange={(v) =>
                setForm({ ...form, scope_type: v as FormState["scope_type"], scope_id: "" })
              }
              options={BURNING_Q_SCOPE.map((s) => ({ value: s.value, label: s.label }))}
            />
            <FormField
              label="Prioritas (1 = paling penting)"
              type="number"
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v })}
            />
          </div>
          {form.scope_type === "region" && (
            <FormSelect
              label="Wilayah"
              value={form.scope_id}
              onChange={(v) => setForm({ ...form, scope_id: v })}
              options={territories.map((t) => ({ value: t.id, label: t.name }))}
            />
          )}
          {form.scope_type === "store" && (
            <FormSelect
              label="Toko"
              value={form.scope_id}
              onChange={(v) => setForm({ ...form, scope_id: v })}
              options={stores.map((s) => ({ value: s.id, label: s.name }))}
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Periode Mulai"
              type="date"
              value={form.period_start}
              onChange={(v) => setForm({ ...form, period_start: v })}
            />
            <FormField
              label="Periode Selesai"
              type="date"
              value={form.period_end}
              onChange={(v) => setForm({ ...form, period_end: v })}
            />
          </div>
          <FormCheckbox
            label="Aktif"
            checked={form.active}
            onChange={(v) => setForm({ ...form, active: v })}
            hint="Hanya pertanyaan aktif yang muncul di F-1."
          />
        </Modal>
      )}
    </>
  );
}

function scopeLabelFor(
  form: FormState,
  territories: { id: string; name: string }[],
  stores: { id: string; name: string }[]
): string | undefined {
  if (form.scope_type === "region")
    return territories.find((t) => t.id === form.scope_id)?.name;
  if (form.scope_type === "store")
    return stores.find((s) => s.id === form.scope_id)?.name;
  return undefined;
}
