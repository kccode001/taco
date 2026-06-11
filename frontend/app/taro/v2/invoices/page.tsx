"use client";

/** TACO v2 — Admin resolve QUEUE (Pair A FE, Tile).
 *  Lists v2 invoices for the admin dashboard, defaulting to the review queue
 *  (status=needs_review), and links each into the detail/resolve page
 *  (`app/taro/v2/invoices/[id]`). v1 FROZEN — new file under the v2 admin shell.
 *
 *  The BE list endpoint (`GET /api/v2/invoices`) returns bare invoice rows
 *  (no area/store relations joined), so we map area_id/store_id → names
 *  client-side off the small Areas/Stores lists (Mosaic's management endpoints).
 *  Falls back to id prefixes if those aren't available. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { V2PageHeader } from "../_components/V2Tabs";
import {
  listV2Invoices,
  type InvoiceV2,
  type InvoiceV2Status,
} from "@/lib/v2/invoices";
import { getAreas, getStoresV2, unwrapList } from "@/lib/v2/api";
import type { AreaV2, StoreV2 } from "@/lib/v2/types";

// Antrian queue filter — exactly three options (KC AC-2). Each maps to Mortar's
// `GET /api/v2/invoices?filter=` status SET: pending = anything still in the
// pipeline / awaiting action, selesai = done, semua = everything.
type QueueFilter = "pending" | "selesai" | "semua";
const FILTER_TABS: { key: QueueFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "selesai", label: "Selesai" },
  { key: "semua", label: "Semua" },
];

const STATUS_META: Record<InvoiceV2Status, { label: string; cls: string }> = {
  validating: { label: "Validasi", cls: "bg-blue-50 text-taco-info border-blue-100" },
  ocr_processing: { label: "Proses OCR", cls: "bg-blue-50 text-taco-info border-blue-100" },
  needs_review: { label: "Perlu Review", cls: "bg-amber-50 text-taco-warning border-amber-100" },
  done: { label: "Selesai", cls: "bg-emerald-50 text-taco-success border-emerald-100" },
  failed: { label: "Gagal", cls: "bg-red-50 text-taco-error border-red-100" },
};

function statusChip(status: InvoiceV2Status, needsReviewCount?: number) {
  // Drive display off the authoritative count: if the BE exposes needs_review_count=0
  // the invoice's lines are all resolved — show as Selesai regardless of the status
  // field, which may lag behind the count after a resolve cycle.
  const displayStatus =
    status === "needs_review" && needsReviewCount === 0 ? "done" : status;
  const m = STATUS_META[displayStatus] ?? STATUS_META.needs_review;
  const label =
    displayStatus === "needs_review" && needsReviewCount && needsReviewCount > 0
      ? `${m.label} · ${needsReviewCount}`
      : m.label;
  return (
    <span
      className={`inline-flex text-[11px] font-medium px-2.5 py-1 rounded-full border ${m.cls}`}
    >
      {label}
    </span>
  );
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminV2InvoiceQueuePage() {
  const [filter, setFilter] = useState<QueueFilter>("pending");
  const [rows, setRows] = useState<InvoiceV2[]>([]);
  const [total, setTotal] = useState(0);
  const [areas, setAreas] = useState<AreaV2[]>([]);
  const [stores, setStores] = useState<StoreV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Load the small area/store lists once for client-side name mapping.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [aRes, sRes] = await Promise.all([getAreas(), getStoresV2()]);
        if (!cancelled) {
          setAreas(unwrapList<AreaV2>(aRes.data));
          setStores(unwrapList<StoreV2>(sRes.data));
        }
      } catch {
        // Non-fatal — rows fall back to id prefixes.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listV2Invoices({ filter, limit: 100 });
      setRows(res.items);
      setTotal(res.total);
    } catch {
      setError("Gagal memuat daftar invoice. Coba muat ulang.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const areaName = useMemo(() => {
    const map = new Map(areas.map((a) => [a.id, a.name]));
    return (id?: string | null) => (id ? map.get(id) ?? null : null);
  }, [areas]);

  const storeName = useMemo(() => {
    const map = new Map(stores.map((s) => [s.id, s.name]));
    return (id?: string | null) => (id ? map.get(id) ?? null : null);
  }, [stores]);

  return (
    <div>
      <V2PageHeader
        title="Antrian Invoice"
        description="Invoice yang diunggah tim Taro. Yang berstatus Perlu Review menunggu admin memetakan SKU atau menandai produk kompetitor."
        actions={
          <button
            type="button"
            onClick={load}
            className="text-[13px] font-medium px-3 py-1.5 rounded-lg border border-taco-border bg-white text-taco-sub hover:bg-taco-page"
          >
            Muat ulang
          </button>
        }
      />

      {/* Antrian filter — Pending / Selesai / Semua (AC-2) */}
      <div className="flex items-center gap-1 flex-wrap mb-4">
        {FILTER_TABS.map((t) => {
          const active = filter === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`text-[13px] font-medium px-3 h-9 rounded-lg border transition-colors ${
                active
                  ? "bg-taco-accent text-white border-taco-accent"
                  : "bg-white text-taco-sub border-taco-border hover:bg-taco-page"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 text-[13px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-taco-divider bg-taco-page flex items-center justify-between">
          <span className="text-[12px] font-semibold text-taco-muted uppercase tracking-wider">
            {FILTER_TABS.find((t) => t.key === filter)?.label}
          </span>
          <span className="text-[12px] text-taco-muted">{total} invoice</span>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-taco-divider">
              {["Invoice", "Toko", "Area", "Baris", "Status", "Tanggal"].map(
                (c) => (
                  <th
                    key={c}
                    className="px-4 py-2.5 text-left text-[11px] font-semibold text-taco-muted uppercase tracking-wider"
                  >
                    {c}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-taco-muted">
                  Memuat invoice…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-taco-muted">
                  {filter === "pending"
                    ? "Tidak ada invoice yang menunggu tindakan. 🎉"
                    : filter === "selesai"
                      ? "Belum ada invoice yang selesai."
                      : "Belum ada invoice."}
                </td>
              </tr>
            ) : (
              rows.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => router.push(`/taro/v2/invoices/${inv.id}`)}
                  className="border-b border-taco-divider last:border-0 hover:bg-taco-page/60 cursor-pointer"
                >
                  <td className="px-4 py-3 text-[13px] font-mono text-taco-text">
                    {inv.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-medium text-taco-text">
                    {storeName(inv.store_id) ??
                      inv.store?.name ??
                      inv.store_name ??
                      "—"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub">
                    {areaName(inv.area_id) ??
                      inv.area?.name ??
                      inv.area_name ??
                      "—"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub whitespace-nowrap">
                    {inv.line_count ?? inv.line_items?.length ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {statusChip(inv.status, inv.needs_review_count)}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-muted">
                    {fmtDate(inv.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
