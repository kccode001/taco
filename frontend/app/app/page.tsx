"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import {
  fetchPlannedToday,
  fetchPlannedWeek,
  getStores,
  type PlannedVisit,
  type WeekDayBucket,
  type VisitFrequency,
  type ScheduleStatus,
} from "@/lib/api";
import type { Store } from "@/lib/types";
import { MobileBottomNav } from "@/components/mobile";

// ─────────────────────────────────────────────────────────────────────────────
// Fallback generation — when BE visit-schedules endpoints aren't shipped yet
// (404), we synthesise a plausible plan from the rep's assigned stores so the
// demo still works end-to-end. Once Core wires the endpoints, real data takes
// over automatically.
// ─────────────────────────────────────────────────────────────────────────────

const FREQUENCIES: VisitFrequency[] = ["Sekali", "Harian", "Mingguan", "Bulanan"];
const WEEKDAYS_ID = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function synthesiseTodayPlans(stores: Store[]): PlannedVisit[] {
  return stores.slice(0, Math.min(4, stores.length)).map((s, i) => ({
    schedule_id: `sched-today-${s.id}`,
    store: {
      id: s.id,
      name: s.name,
      address: s.address,
      territory_name: s.territory_name,
    },
    frequency: FREQUENCIES[i % FREQUENCIES.length],
    scheduled_for: isoDate(new Date()),
    status: (i === 0 ? "visited" : i === 3 ? "missed" : "planned") as ScheduleStatus,
  }));
}

function synthesiseWeekBuckets(stores: Store[]): WeekDayBucket[] {
  const monday = startOfWeek(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    // Distribute stores cyclically across weekdays
    const slice = stores.filter((_, idx) => idx % 7 === i).slice(0, 4);
    const items: PlannedVisit[] = slice.map((s, j) => ({
      schedule_id: `sched-${isoDate(day)}-${s.id}`,
      store: {
        id: s.id,
        name: s.name,
        address: s.address,
        territory_name: s.territory_name,
      },
      frequency: FREQUENCIES[j % FREQUENCIES.length],
      scheduled_for: isoDate(day),
      status: i < new Date().getDay() - 1 ? "visited" : "planned",
    }));
    return {
      date: isoDate(day),
      weekday_short: WEEKDAYS_ID[i],
      count: items.length,
      visited_count: items.filter((it) => it.status === "visited").length,
      items,
    };
  });
}

function statusLabel(s: ScheduleStatus): string {
  switch (s) {
    case "visited":
      return "Sudah Dikunjungi";
    case "missed":
      return "Terlewat";
    default:
      return "Belum Dikunjungi";
  }
}

function statusStyle(s: ScheduleStatus): string {
  switch (s) {
    case "visited":
      return "bg-emerald-50 text-taco-success";
    case "missed":
      return "bg-red-50 text-taco-error";
    default:
      return "bg-taco-page text-taco-sub";
  }
}

function frequencyStyle(): string {
  return "bg-taco-page text-taco-sub border border-taco-border";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const [today, setToday] = useState<PlannedVisit[]>([]);
  const [week, setWeek] = useState<WeekDayBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Fetch in parallel; tolerate per-endpoint failure.
    const [todayRes, weekRes, storesRes] = await Promise.allSettled([
      fetchPlannedToday(),
      fetchPlannedWeek(),
      getStores(),
    ]);

    let stores: Store[] = [];
    if (storesRes.status === "fulfilled") {
      const d = storesRes.value.data as { data?: Store[] } | Store[];
      stores = (d as { data?: Store[] }).data ?? (d as Store[]) ?? [];
    }

    if (todayRes.status === "fulfilled") {
      setToday(todayRes.value);
    } else {
      setToday(synthesiseTodayPlans(stores));
    }

    if (weekRes.status === "fulfilled" && weekRes.value.length > 0) {
      setWeek(weekRes.value);
    } else {
      setWeek(synthesiseWeekBuckets(stores));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || user.role !== "rep") {
      router.replace("/auth/login");
      return;
    }
    load();
  }, [hasHydrated, user, router, load]);

  const weekSummary = useMemo(() => {
    const total = week.reduce((acc, d) => acc + d.count, 0);
    const visited = week.reduce((acc, d) => acc + d.visited_count, 0);
    return { total, visited };
  }, [week]);

  const today_count = today.length;
  const today_label = `${today_count} toko`;

  const handleStartVisit = (storeId: string) => {
    router.push(`/app/stores/${storeId}`);
  };

  const expanded = week.find((d) => d.date === expandedDay);

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[92px]">
        {/* App header */}
        <div className="bg-white border-b border-taco-divider sticky top-0 z-10">
          <div className="flex items-center justify-between px-5 pt-4 pb-3.5">
            <img
              src="https://manage.taco.co.id/asset-images/logo.svg"
              alt="TACO"
              className="h-[26px]"
            />
            <button
              type="button"
              onClick={() => router.push("/app/profile")}
              aria-label="Profil"
              className="w-9 h-9 rounded-full bg-taco-page border border-taco-border flex items-center justify-center text-[14px] font-semibold text-taco-sub"
            >
              {user?.name?.[0]?.toUpperCase() ?? "R"}
            </button>
          </div>
          <div className="px-5 pb-4">
            <div className="text-[20px] font-semibold text-taco-text leading-tight">
              Halo, {user?.name?.split(" ")[0] ?? "Sales"}
            </div>
            <div className="text-[14px] text-taco-sub mt-1">
              Berikut rencana kerja kamu hari ini.
            </div>
          </div>
        </div>

        {/* Section 1 — Rencana Hari Ini */}
        <section className="px-4 pt-4">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <h2 className="text-[17px] font-semibold text-taco-text">
              Rencana Hari Ini
            </h2>
            <span className="text-[14px] text-taco-sub">{today_label}</span>
          </div>

          {loading ? (
            <div className="bg-white border border-taco-border rounded-xl p-6 text-center text-[14px] text-taco-muted">
              Memuat rencana…
            </div>
          ) : today_count === 0 ? (
            <div className="bg-white border border-taco-border rounded-xl p-6 text-center">
              <div className="text-[15px] text-taco-sub leading-relaxed">
                Tidak ada rencana hari ini.
                <br />
                Lanjut bekerja dari daftar toko.
              </div>
              <button
                type="button"
                onClick={() => router.push("/app/stores")}
                className="mt-4 inline-flex items-center justify-center min-h-[44px] px-5 text-[14px] font-medium text-taco-text border border-taco-border rounded-lg"
              >
                Buka Daftar Toko
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {today.map((p) => (
                <button
                  key={p.schedule_id}
                  type="button"
                  onClick={() => handleStartVisit(p.store.id)}
                  className="w-full bg-white border border-taco-border rounded-xl px-4 py-3.5 text-left active:bg-taco-page min-h-[72px]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[17px] font-medium text-taco-text truncate">
                        {p.store.name}
                      </div>
                      {p.store.address && (
                        <div className="text-[14px] text-taco-sub mt-0.5 truncate">
                          {p.store.address}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span
                          className={`text-[12px] font-medium px-2 py-0.5 rounded-full ${frequencyStyle()}`}
                        >
                          {p.frequency}
                        </span>
                        <span
                          className={`text-[12px] font-medium px-2 py-0.5 rounded-full ${statusStyle(p.status)}`}
                        >
                          {statusLabel(p.status)}
                        </span>
                      </div>
                    </div>
                    <span className="text-taco-muted text-[20px] leading-none font-light pt-1">
                      ›
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Section 2 — Minggu Ini */}
        <section className="px-4 pt-5">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <h2 className="text-[17px] font-semibold text-taco-text">
              Minggu Ini
            </h2>
            <span className="text-[14px] text-taco-sub">
              {weekSummary.total} toko · {weekSummary.visited} sudah
            </span>
          </div>

          <div className="bg-white border border-taco-border rounded-xl p-3">
            <div className="grid grid-cols-7 gap-1.5">
              {week.map((d) => {
                const isToday = d.date === isoDate(new Date());
                const isExpanded = d.date === expandedDay;
                const empty = d.count === 0;
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() =>
                      setExpandedDay(isExpanded ? null : d.date)
                    }
                    aria-label={`${d.weekday_short} ${d.count} toko`}
                    className={[
                      "min-h-[64px] rounded-lg flex flex-col items-center justify-center gap-1 transition-colors",
                      isExpanded
                        ? "bg-taco-accent text-white"
                        : isToday
                        ? "bg-taco-accent-tint text-taco-text"
                        : "bg-taco-page text-taco-text",
                      empty && !isExpanded ? "opacity-60" : "",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "text-[11px] font-medium leading-none",
                        isExpanded ? "text-white/90" : "text-taco-sub",
                      ].join(" ")}
                    >
                      {d.weekday_short}
                    </span>
                    <span className="text-[18px] font-semibold leading-none">
                      {d.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {expanded && (
              <div className="mt-3 pt-3 border-t border-taco-divider">
                <div className="text-[13px] text-taco-sub mb-2">
                  {expanded.weekday_short} · {expanded.count} toko
                </div>
                {expanded.items.length === 0 ? (
                  <div className="text-[14px] text-taco-muted py-2">
                    Tidak ada rencana di hari ini.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {expanded.items.map((it) => (
                      <button
                        key={it.schedule_id}
                        type="button"
                        onClick={() => handleStartVisit(it.store.id)}
                        className="w-full text-left bg-taco-page rounded-lg px-3 py-2.5 min-h-[52px] active:bg-taco-divider"
                      >
                        <div className="text-[15px] font-medium text-taco-text truncate">
                          {it.store.name}
                        </div>
                        <div className="text-[13px] text-taco-sub mt-0.5">
                          {it.frequency} · {statusLabel(it.status)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Quick shortcut to full stores list */}
        <div className="px-4 pt-5">
          <button
            type="button"
            onClick={() => router.push("/app/stores")}
            className="w-full bg-white border border-taco-border rounded-xl px-4 py-3.5 min-h-[60px] text-left flex items-center justify-between"
          >
            <div>
              <div className="text-[15px] font-medium text-taco-text">
                Semua Toko Saya
              </div>
              <div className="text-[13px] text-taco-sub mt-0.5">
                Cari & buka kunjungan bebas
              </div>
            </div>
            <span className="text-taco-muted text-[20px] leading-none font-light">
              ›
            </span>
          </button>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  );
}
