"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../_components/Modal";
import { SearchIcon } from "../../_components/icons";
import type { VisitScheduleFrequency } from "@/lib/visit-schedules";

export interface ScheduleStore {
  id: string;
  name: string;
  code?: string;
  /** Sales rep already scheduling this store, if any (for disabled hint). */
  assigned_rep_name?: string;
}

export interface ScheduleFormState {
  id?: string;
  store_id: string;
  frequency: VisitScheduleFrequency;
  once_date: string;
  weekly_days: number[];
  monthly_day: number;
  monthly_last_day: boolean;
  start_date: string;
  end_date: string;
  no_end_date: boolean;
  active: boolean;
  notes: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const emptyForm = (): ScheduleFormState => ({
  store_id: "",
  frequency: "weekly",
  once_date: todayIso(),
  weekly_days: [1, 3, 5], // ISO: Mon/Wed/Fri default
  monthly_day: 1,
  monthly_last_day: false,
  start_date: todayIso(),
  end_date: "",
  no_end_date: true,
  active: true,
  notes: "",
});

// ISO 8601 weekday: 1=Mon..7=Sun. Matches BE convention exactly
// (see /api/visit-schedules — weekly_days: [1,4] = Mon/Thu).
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Sen" },
  { value: 2, label: "Sel" },
  { value: 3, label: "Rab" },
  { value: 4, label: "Kam" },
  { value: 5, label: "Jum" },
  { value: 6, label: "Sab" },
  { value: 7, label: "Min" },
];

const FREQ_OPTIONS: { value: VisitScheduleFrequency; label: string }[] = [
  { value: "once", label: "Sekali" },
  { value: "daily", label: "Setiap Hari" },
  { value: "weekly", label: "Mingguan" },
  { value: "monthly", label: "Bulanan" },
];

export function ScheduleModal({
  open,
  initial,
  stores,
  currentRepStoreIds,
  /** External error to surface on the Toko field (e.g. server 409 fallback). */
  storeError,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: ScheduleFormState;
  stores: ScheduleStore[];
  currentRepStoreIds: string[];
  storeError?: string | null;
  onClose: () => void;
  onSave: (form: ScheduleFormState) => Promise<void> | void;
}) {
  const [form, setForm] = useState<ScheduleFormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [localStoreError, setLocalStoreError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initial ?? emptyForm());
      setStoreSearch("");
      setLocalStoreError(null);
    }
  }, [open, initial]);

  useEffect(() => {
    setLocalStoreError(storeError ?? null);
  }, [storeError]);

  const selectedStore = stores.find((s) => s.id === form.store_id);

  const filteredStores = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    return stores
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          (s.code?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 50);
  }, [stores, storeSearch]);

  const update = <K extends keyof ScheduleFormState>(
    key: K,
    value: ScheduleFormState[K]
  ) => setForm((p) => ({ ...p, [key]: value }));

  const toggleWeekday = (day: number) => {
    setForm((p) => ({
      ...p,
      weekly_days: p.weekly_days.includes(day)
        ? p.weekly_days.filter((d) => d !== day)
        : [...p.weekly_days, day].sort(),
    }));
  };

  const valid = useMemo(() => {
    if (!form.store_id) return false;
    if (!form.start_date) return false;
    if (form.frequency === "once" && !form.once_date) return false;
    if (form.frequency === "weekly" && form.weekly_days.length === 0) return false;
    if (form.frequency === "monthly" && !form.monthly_last_day && !form.monthly_day) {
      return false;
    }
    if (!form.no_end_date && form.end_date && form.end_date < form.start_date) {
      return false;
    }
    return true;
  }, [form]);

  const handleSave = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  // Already-scheduled stores (other rep) — disabled in the dropdown.
  // Stores the current rep already has stay available iff we're editing
  // that exact schedule (form.id matches).
  const blockedFor = (storeId: string): string | null => {
    const meta = stores.find((s) => s.id === storeId);
    if (meta?.assigned_rep_name) {
      return `Sudah dijadwalkan oleh ${meta.assigned_rep_name}`;
    }
    if (currentRepStoreIds.includes(storeId) && storeId !== initial?.store_id) {
      return "Sudah ada jadwal untuk rep ini";
    }
    return null;
  };

  // Custom footer: dark Save (not orange) so the page keeps to ONE orange
  // element rule — orange lives on the page-level "+ Tambah Jadwal" CTA.
  const customFooter = (
    <>
      <button
        onClick={onClose}
        className="flex-1 h-[44px] border border-taco-border rounded-lg text-[14px] font-medium text-taco-sub hover:text-taco-text"
      >
        Batal
      </button>
      <button
        onClick={handleSave}
        disabled={busy || !valid}
        className="flex-1 h-[44px] bg-taco-text text-white rounded-lg text-[14px] font-semibold hover:bg-black transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? "Menyimpan…" : "Simpan"}
      </button>
    </>
  );

  return (
    <Modal
      title={initial?.id ? "Edit Jadwal Kunjungan" : "Tambah Jadwal Kunjungan"}
      onClose={onClose}
      onSave={handleSave}
      busy={busy}
      saveDisabled={!valid}
      size="default"
      footer={customFooter}
    >
      {/* Toko picker */}
      <div>
        <label className="block text-[13px] font-medium text-taco-text mb-1.5">
          Toko
        </label>
        <div className="relative">
          <div
            className={`flex items-center gap-2 h-[44px] px-3 border rounded-lg bg-white cursor-pointer ${
              localStoreError ? "border-taco-error" : "border-taco-border"
            }`}
            onClick={() => setShowStoreDropdown((v) => !v)}
          >
            <SearchIcon size={14} className="text-taco-muted" />
            <input
              type="text"
              value={
                showStoreDropdown
                  ? storeSearch
                  : selectedStore
                  ? `${selectedStore.code ? selectedStore.code + " · " : ""}${selectedStore.name}`
                  : ""
              }
              onChange={(e) => {
                setStoreSearch(e.target.value);
                setShowStoreDropdown(true);
              }}
              onFocus={() => setShowStoreDropdown(true)}
              placeholder="Cari toko…"
              className="flex-1 outline-none text-[14px] text-taco-text bg-transparent"
            />
          </div>
          {showStoreDropdown && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-taco-border rounded-lg shadow-lg max-h-[260px] overflow-y-auto">
              {filteredStores.length === 0 ? (
                <div className="px-3 py-2.5 text-[13px] text-taco-muted">
                  Tidak ada toko ditemukan.
                </div>
              ) : (
                filteredStores.map((s) => {
                  const block = blockedFor(s.id);
                  const isSelected = s.id === form.store_id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!!block}
                      onClick={() => {
                        if (block) return;
                        update("store_id", s.id);
                        setShowStoreDropdown(false);
                        setStoreSearch("");
                        setLocalStoreError(null);
                      }}
                      className={`w-full text-left px-3 py-2 text-[13px] border-b border-taco-divider last:border-0 ${
                        block
                          ? "text-taco-muted cursor-not-allowed bg-taco-page"
                          : isSelected
                          ? "bg-taco-accent-tint text-taco-text"
                          : "text-taco-text hover:bg-taco-page"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {s.code ? `${s.code} · ` : ""}
                            {s.name}
                          </div>
                          {block && (
                            <div className="text-[11px] text-taco-muted">
                              (Sudah ada jadwal)
                            </div>
                          )}
                        </div>
                        {block && (
                          <span className="text-[11px] text-taco-muted whitespace-nowrap">
                            {block}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
        {localStoreError && (
          <div className="text-[12px] text-taco-error mt-1.5">
            {localStoreError}
          </div>
        )}
      </div>

      {/* Frequency pills */}
      <div>
        <label className="block text-[13px] font-medium text-taco-text mb-1.5">
          Frekuensi
        </label>
        <div className="flex gap-2 flex-wrap">
          {FREQ_OPTIONS.map((opt) => {
            const active = form.frequency === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update("frequency", opt.value)}
                className={`h-[36px] px-4 rounded-full text-[13px] font-medium border transition-colors ${
                  active
                    ? "bg-taco-text text-white border-taco-text"
                    : "bg-white text-taco-sub border-taco-border hover:border-taco-text"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conditional frequency-specific fields */}
      {form.frequency === "once" && (
        <div>
          <label className="block text-[13px] font-medium text-taco-text mb-1.5">
            Tanggal kunjungan
          </label>
          <input
            type="date"
            value={form.once_date}
            onChange={(e) => update("once_date", e.target.value)}
            className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
          />
        </div>
      )}

      {form.frequency === "weekly" && (
        <div>
          <label className="block text-[13px] font-medium text-taco-text mb-1.5">
            Hari
          </label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const active = form.weekly_days.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleWeekday(d.value)}
                  className={`h-[36px] min-w-[48px] px-3 rounded-full text-[13px] font-medium border transition-colors ${
                    active
                      ? "bg-taco-text text-white border-taco-text"
                      : "bg-white text-taco-sub border-taco-border hover:border-taco-text"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {form.frequency === "monthly" && (
        <div>
          <label className="block text-[13px] font-medium text-taco-text mb-1.5">
            Tanggal
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                checked={!form.monthly_last_day}
                onChange={() => update("monthly_last_day", false)}
                className="w-[16px] h-[16px] accent-taco-text"
              />
              <span className="text-[14px] text-taco-text">Tanggal</span>
              <input
                type="number"
                min={1}
                max={31}
                value={form.monthly_day}
                onChange={(e) =>
                  update(
                    "monthly_day",
                    Math.max(1, Math.min(31, Number(e.target.value) || 1))
                  )
                }
                disabled={form.monthly_last_day}
                className="w-[80px] h-[36px] border border-taco-border rounded-lg px-2 text-[14px] text-taco-text bg-white outline-none focus:border-taco-text disabled:opacity-50"
              />
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                checked={form.monthly_last_day}
                onChange={() => update("monthly_last_day", true)}
                className="w-[16px] h-[16px] accent-taco-text"
              />
              <span className="text-[14px] text-taco-text">
                Hari terakhir bulan
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[13px] font-medium text-taco-text mb-1.5">
            Tanggal mulai
          </label>
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => update("start_date", e.target.value)}
            className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-taco-text mb-1.5">
            Tanggal berakhir
          </label>
          <input
            type="date"
            value={form.end_date}
            onChange={(e) => update("end_date", e.target.value)}
            disabled={form.no_end_date}
            className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[14px] text-taco-text bg-white outline-none focus:border-taco-text disabled:bg-taco-page disabled:opacity-60"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer -mt-1">
        <input
          type="checkbox"
          checked={form.no_end_date}
          onChange={(e) => {
            update("no_end_date", e.target.checked);
            if (e.target.checked) update("end_date", "");
          }}
          className="w-[16px] h-[16px] accent-taco-text"
        />
        <span className="text-[13px] text-taco-sub">Tanpa tanggal berakhir</span>
      </label>

      {/* Active toggle */}
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => update("active", e.target.checked)}
          className="mt-0.5 w-[18px] h-[18px] accent-taco-text"
        />
        <div>
          <div className="text-[14px] text-taco-text">Aktif</div>
          <div className="text-[12px] text-taco-muted">
            Jadwal dipakai untuk generate kunjungan otomatis.
          </div>
        </div>
      </label>

      {/* Notes */}
      <div>
        <label className="block text-[13px] font-medium text-taco-text mb-1.5">
          Catatan{" "}
          <span className="text-taco-muted font-normal">(opsional)</span>
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={3}
          placeholder="mis. Toko ramai siang hari, lebih baik pagi"
          className="w-full border border-taco-border rounded-lg px-3 py-2.5 text-[14px] text-taco-text bg-white outline-none resize-none focus:border-taco-text"
        />
      </div>
    </Modal>
  );
}
