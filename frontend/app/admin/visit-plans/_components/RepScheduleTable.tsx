"use client";

import { Badge, EmptyRow, TableHeader } from "../../_components/CrudShell";
import { PencilIcon, TrashIcon } from "../../_components/icons";
import type { VisitSchedule } from "@/lib/visit-schedules";

const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// ISO weekday index: 1=Mon..7=Sun. Slot 0 unused; slot 8 (=0 % 8) catches
// any legacy 0=Sun emissions defensively.
const WEEKDAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTH_ID[d.getMonth()]} ${d.getFullYear()}`;
};

const frequencyLabel: Record<VisitSchedule["frequency"], string> = {
  once: "Sekali",
  daily: "Setiap Hari",
  weekly: "Mingguan",
  monthly: "Bulanan",
};

const frequencyTone: Record<VisitSchedule["frequency"], React.ComponentProps<typeof Badge>["tone"]> = {
  once: "neutral",
  daily: "info",
  weekly: "ok",
  monthly: "warn", // purple-ish via custom — fallback warn for now
};

function PatternCell({ s }: { s: VisitSchedule }) {
  if (s.frequency === "once") return <span>{fmtDate(s.once_date)}</span>;
  if (s.frequency === "daily") return <span className="text-taco-muted">—</span>;
  if (s.frequency === "weekly") {
    const days = (s.weekly_days ?? []).slice().sort((a, b) => a - b);
    if (days.length === 0) return <span className="text-taco-muted">—</span>;
    return (
      <span>
        {days.map((d) => WEEKDAY_SHORT[d] ?? "?").join(", ")}
      </span>
    );
  }
  if (s.frequency === "monthly") {
    if (s.monthly_last_day) return <span>Hari terakhir</span>;
    if (s.monthly_day) return <span>Tanggal {s.monthly_day}</span>;
    return <span className="text-taco-muted">—</span>;
  }
  return <span className="text-taco-muted">—</span>;
}

/** Frequency badge with explicit color per spec (purple for monthly etc).
 *  Bypasses the shared Badge palette for monthly because purple is unique. */
function FrequencyBadge({ frequency }: { frequency: VisitSchedule["frequency"] }) {
  const label = frequencyLabel[frequency];
  if (frequency === "monthly") {
    return (
      <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-[#F3E8FF] text-[#6B21A8]">
        {label}
      </span>
    );
  }
  if (frequency === "once") {
    return (
      <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-taco-page border border-taco-border text-taco-sub">
        {label}
      </span>
    );
  }
  return <Badge tone={frequencyTone[frequency]}>{label}</Badge>;
}

export function RepScheduleTable({
  schedules,
  onEdit,
  onDelete,
}: {
  schedules: VisitSchedule[];
  onEdit: (s: VisitSchedule) => void;
  onDelete: (s: VisitSchedule) => void;
}) {
  return (
    <table className="w-full">
      <TableHeader
        cols={["Toko", "Frekuensi", "Pola", "Mulai", "Berakhir", "Status", "Aksi"]}
      />
      <tbody>
        {schedules.length === 0 ? (
          <EmptyRow colSpan={7} label="Belum ada jadwal untuk rep ini." />
        ) : (
          schedules.map((s) => (
            <tr
              key={s.id}
              className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
            >
              <td className="px-4 py-3">
                <div className="text-[13px] font-medium text-taco-text">
                  {s.store_name ?? "—"}
                </div>
                {s.store_code && (
                  <div className="text-[11px] text-taco-muted">{s.store_code}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <FrequencyBadge frequency={s.frequency} />
              </td>
              <td className="px-4 py-3 text-[13px] text-taco-sub">
                <PatternCell s={s} />
              </td>
              <td className="px-4 py-3 text-[13px] text-taco-sub">
                {fmtDate(s.start_date)}
              </td>
              <td className="px-4 py-3 text-[13px] text-taco-sub">
                {fmtDate(s.end_date)}
              </td>
              <td className="px-4 py-3">
                <Badge tone={s.active ? "ok" : "muted"}>
                  {s.active ? "Aktif" : "Nonaktif"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onEdit(s)}
                    className="h-[28px] w-[28px] inline-flex items-center justify-center border border-taco-border rounded-md text-taco-sub hover:text-taco-text hover:border-taco-text"
                    aria-label="Edit"
                    title="Edit"
                  >
                    <PencilIcon size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(s)}
                    className="h-[28px] w-[28px] inline-flex items-center justify-center border border-taco-border rounded-md text-taco-sub hover:text-taco-error hover:border-taco-error"
                    aria-label="Hapus"
                    title="Hapus"
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
