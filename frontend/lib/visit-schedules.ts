// ──────────────────────────────────────────────────────────────────────────
// Visit Schedules (Rencana Kunjungan) — admin
//
// Per-rep visit cadence: one schedule per (sales_staff_id, store_id) pair.
// Frequency: once | daily | weekly | monthly.
// BE landed 2026-06-08 (Core commit 865af843). The page also keeps a mock
// fallback so it stays demoable when the BE is unreachable. 409 from
// POST/PATCH means the store is already scheduled with another rep.
//
// Field-name mismatches between BE and UI live ONLY in this module:
//   - BE one_time_date ↔ UI once_date
//   - BE monthly_day:-1 ↔ UI monthly_last_day boolean
//   - BE nested sales_staff{id,name,email} ↔ UI flattened rep row
// ──────────────────────────────────────────────────────────────────────────

import { api } from "./api";

export type VisitScheduleFrequency = "once" | "daily" | "weekly" | "monthly";

/** Raw schedule row as returned by Core's /api/visit-schedules.
 *  Field names match BE exactly — adapters below normalize into the
 *  page-friendly VisitSchedule. */
export interface VisitScheduleRaw {
  id: string;
  sales_staff_id: string;
  sales_staff?: { id: string; name: string; email?: string };
  store_id: string;
  store?: {
    id: string;
    code?: string;
    name: string;
    region?: string;
    territory_id?: string;
  };
  frequency: VisitScheduleFrequency;
  /** ISO date when frequency === "once" */
  one_time_date?: string | null;
  /** ISO weekday(s): 1=Mon..7=Sun (we also accept 0=Sun for safety) */
  weekly_days?: number[] | null;
  /** 1-31 = day of month, -1 = last day of month (BE convention) */
  monthly_day?: number | null;
  start_date: string;
  end_date?: string | null;
  active: boolean;
  notes?: string | null;
}

/** Page-friendly schedule used everywhere in the UI. Normalizes BE's
 *  `monthly_day === -1` into an explicit `monthly_last_day` flag and
 *  renames `one_time_date` → `once_date` to match the UX language. */
export interface VisitSchedule {
  id: string;
  sales_staff_id: string;
  store_id: string;
  store_name?: string;
  store_code?: string;
  store_region?: string;
  frequency: VisitScheduleFrequency;
  /** ISO date — required when frequency === "once" */
  once_date?: string | null;
  /** ISO weekday: 1=Mon..7=Sun (matches BE; UI also handles 0=Sun) */
  weekly_days?: number[] | null;
  /** 1-31 — null when monthly_last_day is true */
  monthly_day?: number | null;
  /** Derived from BE's monthly_day === -1 */
  monthly_last_day?: boolean | null;
  start_date: string;
  end_date?: string | null;
  active: boolean;
  notes?: string | null;
}

export interface VisitScheduleRepRaw {
  sales_staff: { id: string; name: string; email?: string };
  schedules: VisitScheduleRaw[];
  store_count?: number;
}

export interface VisitScheduleRep {
  sales_staff_id: string;
  name: string;
  phone?: string;
  email?: string;
  territory_name?: string;
  schedules: VisitSchedule[];
}

export function adaptVisitSchedule(raw: VisitScheduleRaw): VisitSchedule {
  return {
    id: raw.id,
    sales_staff_id: raw.sales_staff_id,
    store_id: raw.store_id,
    store_name: raw.store?.name,
    store_code: raw.store?.code,
    store_region: raw.store?.region,
    frequency: raw.frequency,
    once_date: raw.one_time_date ?? null,
    weekly_days: raw.weekly_days ?? null,
    monthly_day:
      raw.monthly_day != null && raw.monthly_day > 0 ? raw.monthly_day : null,
    monthly_last_day: raw.monthly_day === -1,
    start_date: raw.start_date,
    end_date: raw.end_date ?? null,
    active: raw.active,
    notes: raw.notes ?? null,
  };
}

export function adaptVisitScheduleRep(
  raw: VisitScheduleRepRaw
): VisitScheduleRep {
  // Derive territory_name from the first scheduled store's region (rough
  // proxy; BE could embed territory directly later — adapter is the one place
  // to swap that in).
  const firstStore = raw.schedules?.[0]?.store;
  return {
    sales_staff_id: raw.sales_staff.id,
    name: raw.sales_staff.name,
    email: raw.sales_staff.email,
    territory_name: firstStore?.region,
    schedules: (raw.schedules ?? []).map(adaptVisitSchedule),
  };
}

export const getVisitSchedulesBySalesStaff = () =>
  api.get<VisitScheduleRepRaw[] | { data?: VisitScheduleRepRaw[] }>(
    "/visit-schedules/by-sales-staff"
  );

export const getVisitSchedulesAdmin = (params?: Record<string, string>) =>
  api.get<VisitScheduleRaw[] | { data?: VisitScheduleRaw[] }>(
    "/visit-schedules",
    { params }
  );

export const createVisitSchedule = (data: Record<string, unknown>) =>
  api.post<VisitScheduleRaw>("/visit-schedules", data);

export const updateVisitSchedule = (
  id: string,
  data: Record<string, unknown>
) => api.patch<VisitScheduleRaw>(`/visit-schedules/${id}`, data);

export const deleteVisitSchedule = (id: string) =>
  api.delete(`/visit-schedules/${id}`);
