import {
  VisitSchedule,
  VisitScheduleFrequency,
} from '../database/entities/visit-schedule.entity';

export interface PlannedVisit {
  schedule_id: string;
  sales_staff_id: string;
  store_id: string;
  frequency: VisitScheduleFrequency;
  scheduled_for: string; // YYYY-MM-DD
}

/**
 * Format a Date as YYYY-MM-DD in LOCAL time. Using UTC slices would shift
 * the day for non-UTC timezones, which is wrong for "today's plan".
 */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(iso: string): Date {
  // iso may be 'YYYY-MM-DD' (from Postgres `date`) or a full ISO string.
  // We only want the day part interpreted in local time.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function lastDayOfMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

/**
 * Pure function — walk each date in [from, to] (inclusive) and emit one
 * PlannedVisit per (schedule, date) the schedule fires on. Filters by
 * `active`, `start_date`, and `end_date`. Safe to unit-test.
 */
export function resolveSchedulesForRange(
  schedules: VisitSchedule[],
  from: Date,
  to: Date,
): PlannedVisit[] {
  const out: PlannedVisit[] = [];

  // Normalize range to local midnight.
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  for (const s of schedules) {
    if (!s.active) continue;

    const sStart = parseLocalDate(s.start_date);
    const sEnd = s.end_date ? parseLocalDate(s.end_date) : null;

    const cursor = new Date(start);
    while (cursor <= end) {
      const dStr = formatLocalDate(cursor);

      const inWindow =
        cursor >= sStart && (sEnd === null || cursor <= sEnd);

      if (inWindow && fires(s, cursor)) {
        out.push({
          schedule_id: s.id,
          sales_staff_id: s.sales_staff_id,
          store_id: s.store_id,
          frequency: s.frequency,
          scheduled_for: dStr,
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return out;
}

function fires(s: VisitSchedule, date: Date): boolean {
  switch (s.frequency) {
    case VisitScheduleFrequency.ONCE:
      return !!s.one_time_date && formatLocalDate(date) === s.one_time_date.slice(0, 10);
    case VisitScheduleFrequency.DAILY:
      return true;
    case VisitScheduleFrequency.WEEKLY:
      return Array.isArray(s.weekly_days) && s.weekly_days.includes(date.getDay());
    case VisitScheduleFrequency.MONTHLY: {
      if (s.monthly_day == null) return false;
      if (s.monthly_day === -1) {
        return date.getDate() === lastDayOfMonth(date.getFullYear(), date.getMonth());
      }
      return date.getDate() === s.monthly_day;
    }
    default:
      return false;
  }
}

/**
 * Local-time start (Mon 00:00) and end (Sun 23:59:59.999) of the ISO-style
 * week containing `ref`. Treats Monday as the first day per the brief.
 */
export function weekRange(ref: Date): { start: Date; end: Date } {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = d.getDay(); // 0=Sun..6=Sat
  const daysFromMonday = (dow + 6) % 7; // Sun=>6, Mon=>0, Tue=>1, ...
  const start = new Date(d);
  start.setDate(d.getDate() - daysFromMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
