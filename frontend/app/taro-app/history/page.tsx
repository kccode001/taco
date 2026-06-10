"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getTaroInvoices, type TaroInvoiceSummary } from "@/lib/api";
import { TopBar } from "../_components/TopBar";
import { BottomNav } from "../_components/BottomNav";
import { useTaroGuard } from "../_components/useTaroGuard";
import {
  statusLabel,
  statusTone,
  timeAgo,
} from "../_components/mockUploads";
import { SearchIcon, StoreIcon } from "../_components/icons";

type StatusFilter = "all" | "done" | "processing" | "needs_review" | "failed";

type Row = TaroInvoiceSummary;

function rowStore(u: Row): string {
  return (
    (u as TaroInvoiceSummary & { store_name?: string }).store_name ?? u.short_id
  );
}

const TONE_BG: Record<"ok" | "warn" | "err" | "info" | "muted", string> = {
  ok: "bg-emerald-50 text-taco-success",
  warn: "bg-amber-50 text-taco-warning",
  err: "bg-red-50 text-taco-error",
  info: "bg-blue-50 text-taco-info",
  muted: "bg-taco-page text-taco-sub border border-taco-border",
};
const TONE_DOT: Record<"ok" | "warn" | "err" | "info" | "muted", string> = {
  ok: "bg-taco-success",
  warn: "bg-taco-warning",
  err: "bg-taco-error",
  info: "bg-taco-info",
  muted: "bg-taco-muted",
};

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "done", label: "Selesai" },
  { key: "needs_review", label: "Perlu Review" },
  { key: "processing", label: "Proses" },
  { key: "failed", label: "Gagal" },
];

export default function TaroHistoryPage() {
  const router = useRouter();
  const { ready } = useTaroGuard();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTaroInvoices({ limit: "100" });
      const data =
        ((res.data as { data?: TaroInvoiceSummary[] })?.data ??
          (res.data as TaroInvoiceSummary[])) ?? [];
      setRows(data);
    } catch (err) {
      setRows([]);
      const message = (err as { message?: string })?.message ?? "Tidak bisa memuat data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${rowStore(r)} ${r.short_id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[96px]">
        <TopBar title="Riwayat Upload" />

        {/* Search */}
        <div className="bg-white border-b border-taco-divider px-4 py-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted">
              <SearchIcon size={16} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama toko atau ID invoice…"
              className="w-full h-[44px] pl-10 pr-3 border border-taco-border rounded-xl text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
            />
          </div>
        </div>

        {/* Filter pills */}
        <div className="bg-white border-b border-taco-divider px-4 py-3 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 min-w-max">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={[
                    "h-[36px] px-3 rounded-full text-[13px] font-medium border whitespace-nowrap",
                    active
                      ? "bg-taco-text text-white border-taco-text"
                      : "bg-white text-taco-sub border-taco-border",
                  ].join(" ")}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <section className="px-4 pt-3 flex-1">
          {loading ? (
            <div className="bg-white border border-taco-border rounded-xl p-6 text-center text-[14px] text-taco-muted">
              Memuat…
            </div>
          ) : error ? (
            <div className="bg-white border border-taco-border rounded-xl p-6 text-center">
              <div className="text-[14px] text-taco-error">
                Gagal memuat: {error}
              </div>
              <button
                type="button"
                onClick={() => load()}
                className="mt-3 text-[13px] text-taco-accent font-medium"
              >
                Coba lagi
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-taco-border rounded-xl p-6 text-center text-[14px] text-taco-muted">
              Tidak ada upload yang cocok.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((u) => {
                const tone = statusTone(u.status);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => router.push(`/taro-app/upload/${u.id}`)}
                    className="w-full bg-white border border-taco-border rounded-xl px-4 py-3 text-left active:bg-taco-page min-h-[80px]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-taco-page border border-taco-divider flex items-center justify-center text-taco-sub flex-shrink-0">
                        <StoreIcon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-taco-text truncate">
                          {rowStore(u)}
                        </div>
                        <div className="text-[12px] text-taco-sub mt-0.5 truncate">
                          {u.short_id} · {u.region_display ?? "—"}
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${TONE_BG[tone]}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`}
                            />
                            {statusLabel(u.status)}
                          </span>
                          {(u.status === "done" ||
                            u.status === "needs_review") && (
                            <span className="text-[11px] text-taco-sub">
                              {u.line_count} baris ·{" "}
                              {Math.round(u.avg_confidence * 100)}%
                            </span>
                          )}
                          <span className="text-[11px] text-taco-muted ml-auto">
                            {timeAgo(u.uploaded_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
