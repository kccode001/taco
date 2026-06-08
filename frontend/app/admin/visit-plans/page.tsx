"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getStores } from "@/lib/api";
import {
  adaptVisitScheduleRep,
  createVisitSchedule,
  deleteVisitSchedule,
  getVisitSchedulesBySalesStaff,
  updateVisitSchedule,
  type VisitSchedule,
  type VisitScheduleRep,
  type VisitScheduleRepRaw,
} from "@/lib/visit-schedules";
import { SearchIcon, ChevronDownIcon, PlusIcon } from "../_components/icons";
import { RepScheduleTable } from "./_components/RepScheduleTable";
import {
  ScheduleModal,
  emptyForm,
  type ScheduleFormState,
  type ScheduleStore,
} from "./_components/ScheduleModal";

// ──────────────────────────────────────────────────────────────────────────
// Mock fallback — used when BE module hasn't shipped yet. Field shape
// matches VisitScheduleRep + VisitSchedule from lib/api.ts so the wire-up
// to real endpoints is drop-in once Core lands /api/visit-schedules.
// ──────────────────────────────────────────────────────────────────────────

const MOCK_STORES: ScheduleStore[] = [
  { id: "s-1", code: "TK-001", name: "Toko Bangunan Maju Jaya" },
  { id: "s-2", code: "TK-002", name: "UD Sumber Makmur" },
  { id: "s-3", code: "TK-003", name: "CV Bangun Mandiri" },
  { id: "s-4", code: "TK-004", name: "Toko Material Sentosa" },
  { id: "s-5", code: "TK-005", name: "Toko Bangun Griya" },
  { id: "s-7", code: "TK-007", name: "Toko Material Jaya Abadi" },
  { id: "s-10", code: "TK-010", name: "UD Karya Maju Sejahtera" },
  { id: "s-12", code: "TK-012", name: "Toko Besi Sentosa" },
  { id: "s-15", code: "TK-015", name: "Toko Bangunan Mitra Karya" },
  { id: "s-18", code: "TK-018", name: "Material Indah Jaya" },
];

const MOCK_REPS: VisitScheduleRep[] = [
  {
    sales_staff_id: "rep-1",
    name: "Budi Santoso",
    phone: "0812-3456-7890",
    email: "budi@taco.id",
    territory_name: "Tangerang Selatan",
    schedules: [
      {
        id: "sch-1",
        sales_staff_id: "rep-1",
        store_id: "s-1",
        store_name: "Toko Bangunan Maju Jaya",
        store_code: "TK-001",
        frequency: "weekly",
        weekly_days: [1, 3, 5],
        start_date: "2026-06-01",
        end_date: null,
        active: true,
      },
      {
        id: "sch-2",
        sales_staff_id: "rep-1",
        store_id: "s-2",
        store_name: "UD Sumber Makmur",
        store_code: "TK-002",
        frequency: "monthly",
        monthly_day: 15,
        start_date: "2026-05-01",
        end_date: null,
        active: true,
      },
      {
        id: "sch-3",
        sales_staff_id: "rep-1",
        store_id: "s-7",
        store_name: "Toko Material Jaya Abadi",
        store_code: "TK-007",
        frequency: "once",
        once_date: "2026-06-12",
        start_date: "2026-06-01",
        end_date: "2026-06-30",
        active: true,
      },
    ],
  },
  {
    sales_staff_id: "rep-2",
    name: "Sari Wulandari",
    phone: "0813-2233-4455",
    email: "sari@taco.id",
    territory_name: "Bekasi",
    schedules: [
      {
        id: "sch-4",
        sales_staff_id: "rep-2",
        store_id: "s-3",
        store_name: "CV Bangun Mandiri",
        store_code: "TK-003",
        frequency: "daily",
        start_date: "2026-06-01",
        end_date: null,
        active: true,
      },
      {
        id: "sch-5",
        sales_staff_id: "rep-2",
        store_id: "s-10",
        store_name: "UD Karya Maju Sejahtera",
        store_code: "TK-010",
        frequency: "monthly",
        monthly_last_day: true,
        start_date: "2026-04-01",
        end_date: null,
        active: false,
      },
    ],
  },
  {
    sales_staff_id: "rep-3",
    name: "Rudi Hartono",
    phone: "0857-9988-7766",
    email: "rudi@taco.id",
    territory_name: "Jakarta Barat",
    schedules: [
      {
        id: "sch-6",
        sales_staff_id: "rep-3",
        store_id: "s-5",
        store_name: "Toko Bangun Griya",
        store_code: "TK-005",
        frequency: "weekly",
        weekly_days: [2, 4],
        start_date: "2026-06-01",
        end_date: null,
        active: true,
      },
    ],
  },
  {
    sales_staff_id: "rep-4",
    name: "Agus Prasetyo",
    phone: "0819-1122-3344",
    email: "agus@taco.id",
    territory_name: "Jakarta Selatan",
    schedules: [],
  },
];

// Form → BE payload. BE expects `one_time_date` (not `once_date`) and
// encodes "last day of month" as `monthly_day: -1` (not a separate flag).
// Mapping confirmed against live curl on /api/visit-schedules:by-sales-staff
// on 2026-06-08.
function formToPayload(
  form: ScheduleFormState,
  salesStaffId: string
): Record<string, unknown> {
  const monthlyDay =
    form.frequency === "monthly"
      ? form.monthly_last_day
        ? -1
        : form.monthly_day
      : null;
  return {
    sales_staff_id: salesStaffId,
    store_id: form.store_id,
    frequency: form.frequency,
    start_date: form.start_date,
    end_date: form.no_end_date ? null : form.end_date || null,
    active: form.active,
    notes: form.notes || null,
    one_time_date: form.frequency === "once" ? form.once_date : null,
    weekly_days: form.frequency === "weekly" ? form.weekly_days : null,
    monthly_day: monthlyDay,
  };
}

function scheduleToForm(s: VisitSchedule): ScheduleFormState {
  return {
    id: s.id,
    store_id: s.store_id,
    frequency: s.frequency,
    once_date: s.once_date ?? new Date().toISOString().slice(0, 10),
    weekly_days: s.weekly_days ?? [],
    monthly_day: s.monthly_day ?? 1,
    monthly_last_day: !!s.monthly_last_day,
    start_date: s.start_date,
    end_date: s.end_date ?? "",
    no_end_date: !s.end_date,
    active: s.active,
    notes: "",
  };
}

function Avatar({ name }: { name?: string | null }) {
  const initials = (name ?? "")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-taco-page border border-taco-border flex items-center justify-center text-[13px] font-semibold text-taco-sub flex-shrink-0">
      {initials || "?"}
    </div>
  );
}

export default function VisitPlansPage() {
  const [reps, setReps] = useState<VisitScheduleRep[]>([]);
  const [stores, setStores] = useState<ScheduleStore[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const [modal, setModal] = useState<{
    open: boolean;
    repId?: string;
    initial?: ScheduleFormState;
  }>({ open: false });
  const [storeError, setStoreError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        getVisitSchedulesBySalesStaff().catch(() => null),
        getStores().catch(() => null),
      ]);
      const repRaw = r
        ? ((r.data as { data?: VisitScheduleRepRaw[] })?.data ??
            (r.data as VisitScheduleRepRaw[]))
        : null;
      const storeData = s
        ? ((s.data as { data?: ScheduleStore[] })?.data ??
            (s.data as ScheduleStore[]))
        : null;
      // BE returns the by-sales-staff shape — adapt into the page-friendly
      // shape. If it returned empty/null, fall back to MOCK_REPS so the page
      // still renders for demo.
      const adapted = Array.isArray(repRaw) && repRaw.length
        ? repRaw.map(adaptVisitScheduleRep)
        : null;
      setReps(adapted ?? MOCK_REPS);
      setStores(storeData && storeData.length ? storeData : MOCK_STORES);
    } catch {
      setReps(MOCK_REPS);
      setStores(MOCK_STORES);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const totalSchedules = useMemo(
    () => reps.reduce((acc, r) => acc + r.schedules.length, 0),
    [reps]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reps;
    return reps.filter((r) => {
      if (r.name.toLowerCase().includes(q)) return true;
      if (r.territory_name?.toLowerCase().includes(q)) return true;
      if (r.phone?.toLowerCase().includes(q)) return true;
      return r.schedules.some((s) =>
        (s.store_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [reps, search]);

  const toggleExpand = (repId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(repId)) next.delete(repId);
      else next.add(repId);
      return next;
    });
  };

  const openCreate = (repId: string) => {
    setStoreError(null);
    setModal({ open: true, repId, initial: emptyForm() });
  };

  const openEdit = (repId: string, s: VisitSchedule) => {
    setStoreError(null);
    setModal({ open: true, repId, initial: scheduleToForm(s) });
  };

  const closeModal = () => {
    setModal({ open: false });
    setStoreError(null);
  };

  const handleDelete = async (s: VisitSchedule) => {
    if (!confirm(`Hapus jadwal untuk ${s.store_name ?? "toko ini"}?`)) return;
    try {
      await deleteVisitSchedule(s.id);
      await refetch();
    } catch {
      // Mock fallback — strip locally
      setReps((prev) =>
        prev.map((r) =>
          r.sales_staff_id === s.sales_staff_id
            ? { ...r, schedules: r.schedules.filter((x) => x.id !== s.id) }
            : r
        )
      );
    }
  };

  const handleSave = async (form: ScheduleFormState) => {
    if (!modal.repId) return;
    const repId = modal.repId;
    const payload = formToPayload(form, repId);
    try {
      if (form.id) {
        await updateVisitSchedule(form.id, payload);
      } else {
        await createVisitSchedule(payload);
      }
      await refetch();
      closeModal();
    } catch (err) {
      // 409 → Toko already scheduled with another rep
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setStoreError(
          "Toko ini sudah punya jadwal dengan rep lain. Pilih toko lain atau hapus jadwal yang ada."
        );
        return;
      }
      // BE not landed → optimistic mock update
      const store = stores.find((x) => x.id === form.store_id);
      const newSchedule: VisitSchedule = {
        id: form.id ?? `sch-${Date.now()}`,
        sales_staff_id: repId,
        store_id: form.store_id,
        store_name: store?.name,
        store_code: store?.code,
        frequency: form.frequency,
        once_date: form.frequency === "once" ? form.once_date : null,
        weekly_days: form.frequency === "weekly" ? form.weekly_days : null,
        monthly_day:
          form.frequency === "monthly" && !form.monthly_last_day
            ? form.monthly_day
            : null,
        monthly_last_day:
          form.frequency === "monthly" ? form.monthly_last_day : null,
        start_date: form.start_date,
        end_date: form.no_end_date ? null : form.end_date || null,
        active: form.active,
      };
      setReps((prev) =>
        prev.map((r) => {
          if (r.sales_staff_id !== repId) return r;
          if (form.id) {
            return {
              ...r,
              schedules: r.schedules.map((x) =>
                x.id === form.id ? newSchedule : x
              ),
            };
          }
          return { ...r, schedules: [...r.schedules, newSchedule] };
        })
      );
      // Auto-expand the rep whose schedule was just added
      setExpanded((prev) => new Set(prev).add(repId));
      closeModal();
    }
  };

  // Stores currently used by the active rep (for "(Sudah ada jadwal)" hint
  // inside the modal). Stores assigned to OTHER reps come back from BE
  // via assigned_rep_name on the store object — we don't synthesize that here.
  const currentRepStoreIds = useMemo(() => {
    if (!modal.repId) return [];
    const rep = reps.find((r) => r.sales_staff_id === modal.repId);
    return rep?.schedules.map((s) => s.store_id) ?? [];
  }, [modal.repId, reps]);

  return (
    <>
      {/* Header — same shape as CrudShell but no orange button at the top */}
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[20px] font-bold text-taco-text leading-tight">
              Rencana Kunjungan
            </h1>
            <p className="text-[13px] text-taco-sub mt-1">
              {reps.length} sales rep · {totalSchedules} jadwal aktif · Atur
              kapan tiap toko dikunjungi.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted">
                <SearchIcon size={14} />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari sales rep atau nama toko…"
                className="h-[36px] pl-9 pr-3 border border-taco-border rounded-lg text-[13px] text-taco-text bg-white outline-none w-[280px] focus:border-taco-text"
              />
            </div>
          </div>
        </div>

        {/* Rep cards */}
        <div className="space-y-3">
          {!loaded && (
            <div className="bg-white border border-taco-border rounded-xl px-5 py-10 text-center text-[13px] text-taco-muted">
              Memuat…
            </div>
          )}

          {loaded && filtered.length === 0 && (
            <div className="bg-white border border-taco-border rounded-xl px-5 py-10 text-center text-[13px] text-taco-muted">
              {search ? "Tidak ada hasil cocok." : "Belum ada sales rep terdaftar."}
            </div>
          )}

          {filtered.map((rep) => {
            const isOpen = expanded.has(rep.sales_staff_id);
            const storeCount = new Set(rep.schedules.map((s) => s.store_id))
              .size;
            return (
              <div
                key={rep.sales_staff_id}
                className="bg-white border border-taco-border rounded-xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(rep.sales_staff_id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-taco-page transition-colors"
                  aria-expanded={isOpen}
                >
                  <Avatar name={rep.name} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-taco-text">
                      {rep.name}
                    </div>
                    <div className="text-[12px] text-taco-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {[rep.phone, rep.territory_name]
                        .filter(Boolean)
                        .map((v, i) => (
                          <span key={i}>
                            {i > 0 && <span className="mr-2">·</span>}
                            {v}
                          </span>
                        ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full bg-taco-page border border-taco-border text-taco-sub whitespace-nowrap">
                      {rep.schedules.length} jadwal · {storeCount} toko
                    </span>
                    <span
                      className={`text-taco-muted transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      <ChevronDownIcon size={16} />
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-taco-divider">
                    <RepScheduleTable
                      schedules={rep.schedules}
                      onEdit={(s) => openEdit(rep.sales_staff_id, s)}
                      onDelete={handleDelete}
                    />
                    <div className="flex justify-end px-4 py-3 border-t border-taco-divider bg-taco-page">
                      <button
                        onClick={() => openCreate(rep.sales_staff_id)}
                        className="h-[36px] px-4 bg-taco-accent text-white rounded-lg text-[13px] font-semibold hover:bg-taco-accent-dark transition-colors inline-flex items-center gap-1.5"
                      >
                        <PlusIcon size={14} />
                        Tambah Jadwal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ScheduleModal
        open={modal.open}
        initial={modal.initial}
        stores={stores}
        currentRepStoreIds={currentRepStoreIds}
        storeError={storeError}
        onClose={closeModal}
        onSave={handleSave}
      />
    </>
  );
}
