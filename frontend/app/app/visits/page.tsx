"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import {
  fetchPlannedToday,
  fetchPlannedUpcoming,
  fetchVisitHistory,
  getVisits,
  getStores,
  type PlannedVisit,
  type VisitHistoryItem,
  type VisitFrequency,
  type ScheduleStatus,
} from "@/lib/api";
import type { Store } from "@/lib/types";
import { MobileBottomNav } from "@/components/mobile";

type Tab = "rencana" | "riwayat";
const FREQUENCIES: VisitFrequency[] = ["Sekali", "Harian", "Mingguan", "Bulanan"];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((da.getTime() - db.getTime()) / 86_400_000);
}

function bucketLabel(date: string): string {
  const today = isoDate(new Date());
  const d = diffDays(date, today);
  if (d <= 0) return "Hari Ini";
  if (d <= 6) return "Minggu Ini";
  return "Berikutnya";
}

function statusLabel(s: ScheduleStatus): string {
  if (s === "visited") return "Sudah Dikunjungi";
  if (s === "missed") return "Terlewat";
  return "Belum Dikunjungi";
}

function statusStyle(s: ScheduleStatus): string {
  if (s === "visited") return "bg-emerald-50 text-taco-success";
  if (s === "missed") return "bg-red-50 text-taco-error";
  return "bg-taco-page text-taco-sub";
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function synthesisePlanned(stores: Store[]): PlannedVisit[] {
  const today = new Date();
  return stores.slice(0, 12).map((s, i) => {
    const off = i < 3 ? 0 : i < 7 ? 1 + (i % 4) : 8 + (i % 15);
    const d = new Date(today);
    d.setDate(today.getDate() + off);
    return {
      schedule_id: `sched-${off}-${s.id}`,
      store: {
        id: s.id,
        name: s.name,
        address: s.address,
        territory_name: s.territory_name,
      },
      frequency: FREQUENCIES[i % FREQUENCIES.length],
      scheduled_for: isoDate(d),
      status: (off === 0 && i === 0 ? "visited" : "planned") as ScheduleStatus,
    };
  });
}

function VisitsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const initialTab: Tab = searchParams?.get("tab") === "riwayat" ? "riwayat" : "rencana";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [planned, setPlanned] = useState<PlannedVisit[]>([]);
  const [history, setHistory] = useState<VisitHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [todayRes, upcomingRes, histRes, visitsRes, storesRes] =
      await Promise.allSettled([
        fetchPlannedToday(),
        fetchPlannedUpcoming(),
        fetchVisitHistory({ limit: "30" }),
        getVisits({ limit: "30" }),
        getStores(),
      ]);

    let stores: Store[] = [];
    if (storesRes.status === "fulfilled") {
      const d = storesRes.value.data as { data?: Store[] } | Store[];
      stores = (d as { data?: Store[] }).data ?? (d as Store[]) ?? [];
    }

    // ── Planned (today + upcoming, dedup by schedule_id+date) ──
    const today: PlannedVisit[] =
      todayRes.status === "fulfilled" ? todayRes.value : [];
    const upcoming: PlannedVisit[] =
      upcomingRes.status === "fulfilled" ? upcomingRes.value : [];

    const seen = new Set<string>();
    let combined: PlannedVisit[] = [];
    for (const p of [...today, ...upcoming]) {
      const key = `${p.schedule_id}|${p.scheduled_for}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(p);
    }
    if (combined.length === 0) {
      combined = synthesisePlanned(stores);
    }
    setPlanned(combined);

    // ── History ────────────────────────────────────────────
    let hist: VisitHistoryItem[] =
      histRes.status === "fulfilled" ? histRes.value : [];
    // Fall back to /api/visits (existing) if history endpoint empty
    if (hist.length === 0 && visitsRes.status === "fulfilled") {
      type RawVisit = {
        id: string;
        store_id: string;
        store?: { name?: string; territory?: { name?: string } };
        visit_date?: string;
        submitted_at?: string | null;
        status: "draft" | "submitted";
      };
      const raw = visitsRes.value.data as { data?: RawVisit[] } | RawVisit[];
      const list: RawVisit[] =
        (raw as { data?: RawVisit[] }).data ?? (raw as RawVisit[]) ?? [];
      hist = list.map((v) => ({
        visit_id: v.id,
        store_id: v.store_id,
        store_name: v.store?.name ?? "Toko",
        territory_name: v.store?.territory?.name,
        visit_date: v.visit_date,
        submitted_at: v.submitted_at ?? undefined,
        status: v.status,
      }));
    }
    setHistory(hist);
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

  const grouped = useMemo(() => {
    const out: Record<string, PlannedVisit[]> = {
      "Hari Ini": [],
      "Minggu Ini": [],
      Berikutnya: [],
    };
    // Dedup by store within each bucket so a daily schedule doesn't
    // produce 30 identical rows in "Berikutnya". We keep the earliest
    // upcoming occurrence for that store in the bucket.
    const seen: Record<string, Set<string>> = {
      "Hari Ini": new Set(),
      "Minggu Ini": new Set(),
      Berikutnya: new Set(),
    };
    const sorted = [...planned].sort((a, b) =>
      a.scheduled_for.localeCompare(b.scheduled_for)
    );
    for (const p of sorted) {
      const bucket = bucketLabel(p.scheduled_for);
      if (seen[bucket].has(p.store.id)) continue;
      seen[bucket].add(p.store.id);
      out[bucket].push(p);
    }
    return out;
  }, [planned]);

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[92px]">
        {/* Header */}
        <div className="bg-white border-b border-taco-divider sticky top-0 z-10">
          <div className="px-5 pt-4 pb-3">
            <div className="text-[20px] font-semibold text-taco-text">
              Kunjungan
            </div>
            <div className="text-[14px] text-taco-sub mt-0.5">
              Rencana & riwayat kunjungan kamu.
            </div>
          </div>

          {/* Tab pill */}
          <div className="px-5 pb-3">
            <div className="bg-taco-page rounded-xl p-1 flex">
              {(["rencana", "riwayat"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={[
                    "flex-1 min-h-[44px] text-[14px] font-semibold rounded-lg transition-colors",
                    tab === t
                      ? "bg-white text-taco-text shadow-sm"
                      : "text-taco-sub",
                  ].join(" ")}
                  aria-selected={tab === t}
                >
                  {t === "rencana" ? "Rencana" : "Riwayat"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="px-4 pt-6 text-center text-[14px] text-taco-muted">
            Memuat…
          </div>
        ) : tab === "rencana" ? (
          <div className="px-4 pt-3 pb-4">
            {planned.length === 0 ? (
              <div className="bg-white border border-taco-border rounded-xl p-6 text-center text-[15px] text-taco-sub">
                Belum ada rencana kunjungan.
              </div>
            ) : (
              (["Hari Ini", "Minggu Ini", "Berikutnya"] as const).map(
                (group) =>
                  grouped[group].length === 0 ? null : (
                    <div key={group} className="mb-5">
                      <div className="px-1 mb-2 flex items-center justify-between">
                        <h3 className="text-[15px] font-semibold text-taco-text">
                          {group}
                        </h3>
                        <span className="text-[13px] text-taco-sub">
                          {grouped[group].length} toko
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {grouped[group].map((p) => (
                          <button
                            key={p.schedule_id}
                            type="button"
                            onClick={() =>
                              router.push(`/app/stores/${p.store.id}`)
                            }
                            className="w-full bg-white border border-taco-border rounded-xl px-4 py-3.5 text-left active:bg-taco-page min-h-[72px]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="text-[16px] font-medium text-taco-text truncate">
                                  {p.store.name}
                                </div>
                                {p.store.address && (
                                  <div className="text-[13px] text-taco-sub mt-0.5 truncate">
                                    {p.store.address}
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  <span className="text-[12px] font-medium px-2 py-0.5 rounded-full bg-taco-page text-taco-sub border border-taco-border">
                                    {p.frequency}
                                  </span>
                                  <span
                                    className={`text-[12px] font-medium px-2 py-0.5 rounded-full ${statusStyle(p.status)}`}
                                  >
                                    {statusLabel(p.status)}
                                  </span>
                                  <span className="text-[12px] text-taco-muted ml-auto">
                                    {fmtDate(p.scheduled_for)}
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
                    </div>
                  )
              )
            )}
          </div>
        ) : (
          <div className="px-4 pt-3 pb-4">
            {history.length === 0 ? (
              <div className="bg-white border border-taco-border rounded-xl p-6 text-center text-[15px] text-taco-sub">
                Belum ada riwayat kunjungan.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {history.map((h) => (
                  <button
                    key={h.visit_id}
                    type="button"
                    onClick={() => router.push(`/app/visit/${h.visit_id}`)}
                    className="w-full bg-white border border-taco-border rounded-xl px-4 py-3.5 text-left active:bg-taco-page min-h-[72px]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[16px] font-medium text-taco-text truncate">
                          {h.store_name}
                        </div>
                        {h.territory_name && (
                          <div className="text-[13px] text-taco-sub mt-0.5 truncate">
                            {h.territory_name}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span
                            className={[
                              "text-[12px] font-medium px-2 py-0.5 rounded-full",
                              h.status === "submitted"
                                ? "bg-emerald-50 text-taco-success"
                                : "bg-amber-50 text-taco-warning",
                            ].join(" ")}
                          >
                            {h.status === "submitted" ? "Terkirim" : "Draft"}
                          </span>
                          <span className="text-[12px] text-taco-muted ml-auto">
                            {fmtDate(h.submitted_at ?? h.visit_date)}
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
          </div>
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
}

function Fallback() {
  return (
    <div className="min-h-screen bg-taco-page flex items-center justify-center">
      <div className="w-11 h-11 rounded-full border-2 border-taco-border border-t-taco-text taco-spin" />
    </div>
  );
}

export default function VisitsPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <VisitsInner />
    </Suspense>
  );
}
