"use client";

import { useEffect, useState, useCallback } from "react";
import { getLiveFeed } from "@/lib/api";
import { VisitFeedRow, DeltaTag } from "./types";

interface LiveVisitFeedProps {
  pollIntervalMs?: number;
  onSelectVisit: (visit: VisitFeedRow) => void;
}

const MOCK_FEED: VisitFeedRow[] = [
  {
    id: "v-001",
    rep_name: "Budi S.",
    rep_initials: "BS",
    store_name: "Toko Material Jaya Abadi",
    store_territory: "Tangerang Selatan",
    submitted_at: "2026-06-07T10:14:00+07:00",
    invoice_count: 2,
    delta_tags: ["harga"],
    is_new: true,
  },
  {
    id: "v-002",
    rep_name: "Sari W.",
    rep_initials: "SW",
    store_name: "CV Bangun Mandiri Perkasa",
    store_territory: "Bekasi",
    submitted_at: "2026-06-07T09:58:00+07:00",
    invoice_count: 1,
    delta_tags: [],
  },
  {
    id: "v-003",
    rep_name: "Budi S.",
    rep_initials: "BS",
    store_name: "UD Sumber Makmur",
    store_territory: "Tangerang Selatan",
    submitted_at: "2026-06-07T09:31:00+07:00",
    invoice_count: 0,
    delta_tags: ["stok"],
  },
  {
    id: "v-004",
    rep_name: "Sari W.",
    rep_initials: "SW",
    store_name: "Toko Besi & Material Sentosa",
    store_territory: "Bekasi",
    submitted_at: "2026-06-07T08:52:00+07:00",
    invoice_count: 0,
    delta_tags: [],
  },
  {
    id: "v-005",
    rep_name: "Rudi H.",
    rep_initials: "RH",
    store_name: "PT Bangun Griya Lestari",
    store_territory: "Jakarta Barat",
    submitted_at: "2026-06-07T08:40:00+07:00",
    invoice_count: 1,
    delta_tags: [],
  },
  {
    id: "v-006",
    rep_name: "Dewi R.",
    rep_initials: "DR",
    store_name: "UD Harapan Jaya",
    store_territory: "Depok",
    submitted_at: "2026-06-07T08:22:00+07:00",
    invoice_count: 2,
    delta_tags: ["sinyal"],
  },
];

const DELTA_LABEL: Record<DeltaTag, string> = {
  harga: "△ Harga",
  stok: "△ Stok",
  sinyal: "△ Sinyal",
  kompetitor: "△ Kompetitor",
};

function formatTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function LiveVisitFeed({ pollIntervalMs = 15000, onSelectVisit }: LiveVisitFeedProps) {
  const [feed, setFeed] = useState<VisitFeedRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await getLiveFeed({ limit: "20" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = res.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] | undefined = payload?.data ?? payload;
      if (Array.isArray(list) && list.length > 0) {
        setFeed(
          list.map((v) => ({
            id: v.id,
            rep_name: v.rep_name ?? "—",
            store_name: v.store_name ?? "—",
            store_territory: v.store_territory ?? v.territory_name,
            submitted_at: v.submitted_at ?? v.created_at,
            invoice_count: v.invoice_count ?? 0,
            delta_tags: (v.delta_tags ?? v.changed_sections ?? []) as VisitFeedRow["delta_tags"],
            is_new: v.is_new,
          }))
        );
      } else if (!feed) {
        setFeed(MOCK_FEED);
      }
    } catch {
      if (!feed) setFeed(MOCK_FEED);
    } finally {
      setLoading(false);
    }
  }, [feed]);

  useEffect(() => {
    fetchFeed();
    const t = setInterval(fetchFeed, pollIntervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollIntervalMs]);

  const rows = feed ?? [];

  return (
    <div
      className="bg-white border border-taco-border rounded-xl overflow-hidden"
      data-testid="live-visit-feed"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-taco-divider">
        <h2 className="text-[16px] font-semibold text-taco-text inline-flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full bg-taco-success animate-pulse"
            aria-hidden
          />
          Kunjungan Hari Ini
        </h2>
        <span className="text-[12px] text-taco-sub">
          Live · diperbarui tiap {Math.round(pollIntervalMs / 1000)} detik
        </span>
      </div>

      {loading && !feed ? (
        <div className="text-center py-12 text-taco-sub text-[14px]">Memuat…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-taco-sub text-[14px]">
          Belum ada kunjungan hari ini
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-taco-muted bg-taco-page">
                <th className="text-left px-4 py-2.5 font-semibold">Rep</th>
                <th className="text-left px-4 py-2.5 font-semibold">Toko</th>
                <th className="text-left px-4 py-2.5 font-semibold">Waktu</th>
                <th className="text-left px-4 py-2.5 font-semibold">Delta</th>
                <th className="text-left px-4 py-2.5 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`feed-row-${row.id}`}
                  onClick={() => onSelectVisit(row)}
                  className="border-t border-taco-divider hover:bg-taco-page cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-taco-page border border-taco-border flex items-center justify-center text-[11px] font-semibold text-taco-text">
                        {row.rep_initials ?? initials(row.rep_name)}
                      </div>
                      <span className="text-[13px] text-taco-text">{row.rep_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[14px] font-medium text-taco-text">
                      {row.store_name}
                    </div>
                    {row.store_territory && (
                      <div className="text-[12px] text-taco-sub mt-0.5">
                        {row.store_territory}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub whitespace-nowrap">
                    {formatTime(row.submitted_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(row.invoice_count ?? 0) > 0 && (
                        <span
                          data-testid="invoice-badge"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-taco-info"
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                          {row.invoice_count} inv
                        </span>
                      )}
                      {(row.delta_tags ?? []).map((tag) => (
                        <span
                          key={tag}
                          data-testid={`delta-tag-${tag}`}
                          className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-taco-warning"
                        >
                          {DELTA_LABEL[tag]}
                        </span>
                      ))}
                      {row.is_new && (
                        <span className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-taco-success">
                          Baru
                        </span>
                      )}
                      {(row.delta_tags?.length ?? 0) === 0 &&
                        (row.invoice_count ?? 0) === 0 &&
                        !row.is_new && (
                          <span className="text-[13px] text-taco-muted">—</span>
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-taco-muted whitespace-nowrap">
                    Lihat →
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
