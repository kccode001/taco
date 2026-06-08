"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getTaroInvoices, type TaroInvoiceSummary } from "@/lib/api";
import { Badge, TableHeader, EmptyRow } from "../_components/CrudShell";
import { SearchIcon } from "../_components/icons";
import {
  MOCK_TARO_INVOICES,
  confidenceTone,
  formatDateTime,
} from "./_components/mockData";

type FilterPill = "all" | "done" | "needs_review" | "processing";

const PILLS: { value: FilterPill; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "done", label: "Sudah Selesai" },
  { value: "needs_review", label: "Perlu Review" },
  { value: "processing", label: "Proses" },
];

function statusBadge(status: TaroInvoiceSummary["status"]) {
  switch (status) {
    case "done":
      return <Badge tone="ok">Selesai</Badge>;
    case "needs_review":
      return <Badge tone="warn">Perlu Review</Badge>;
    case "processing":
      return <Badge tone="info">Proses</Badge>;
    case "failed":
      return <Badge tone="err">Gagal</Badge>;
    case "pending":
    default:
      return <Badge tone="muted">Menunggu</Badge>;
  }
}

export default function TaroInvoiceListPage() {
  const [invoices, setInvoices] = useState<TaroInvoiceSummary[]>([]);
  const [search, setSearch] = useState("");
  const [pill, setPill] = useState<FilterPill>("all");

  const refetch = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (pill === "needs_review") params.needs_review = "true";
      else if (pill !== "all") params.status = pill;
      if (search.trim()) params.search = search.trim();
      const res = await getTaroInvoices(params);
      const raw =
        ((res.data as { data?: unknown[] })?.data ??
          (res.data as unknown[])) ?? [];
      // BE returns a richer shape: `low_confidence_count`, `needs_review_count`,
      // `supplier_name`, etc. Adapt to the summary the table expects so live BE
      // data renders without UI changes.
      const data: TaroInvoiceSummary[] = (raw as Array<Record<string, unknown>>).map((r) => {
        const id = String(r.id ?? "");
        const lineCount = Number(r.line_count ?? r.lineCount ?? 0);
        const needsReviewCount = Number(r.needs_review_count ?? 0);
        // BE doesn't ship avg_confidence on list — derive a coarse signal from
        // needs_review_count so the dot still tells a useful story.
        const hasReviewSignal = r.needs_review_count !== undefined;
        const avg = hasReviewSignal
          ? lineCount > 0
            ? Math.max(0, 1 - needsReviewCount / lineCount)
            : 0
          : Number(r.avg_confidence ?? 0);
        return {
          id,
          short_id: String(r.short_id ?? id).slice(0, 12),
          uploaded_at: String(r.uploaded_at ?? r.created_at ?? ""),
          supplier: String(r.supplier ?? r.supplier_name ?? "—"),
          line_count: lineCount,
          avg_confidence: avg,
          status: (r.status as TaroInvoiceSummary["status"]) ?? "pending",
        };
      });
      setInvoices(data.length ? data : MOCK_TARO_INVOICES);
    } catch {
      setInvoices(MOCK_TARO_INVOICES);
    }
  }, [pill, search]);

  useEffect(() => {
    const t = setTimeout(refetch, 200);
    return () => clearTimeout(t);
  }, [refetch]);

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (pill === "done" && i.status !== "done") return false;
      if (pill === "needs_review" && i.status !== "needs_review") return false;
      if (pill === "processing" && i.status !== "processing") return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !i.supplier.toLowerCase().includes(q) &&
          !i.short_id.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [invoices, pill, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-taco-text leading-tight">
            Daftar Invoice Taro
          </h1>
          <p className="text-[13px] text-taco-sub mt-1">
            {invoices.length} invoice · klik baris untuk meninjau line items
          </p>
        </div>
        <Link
          href="/admin/taro-invoices/upload"
          className="h-[36px] px-4 inline-flex items-center bg-taco-accent text-white rounded-lg text-[13px] font-semibold hover:bg-taco-accent-dark transition-colors"
        >
          + Upload Invoice
        </Link>
      </div>

      <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-taco-divider flex items-center gap-3 flex-wrap bg-taco-page">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted">
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari supplier atau ID invoice…"
              className="h-[36px] pl-9 pr-3 border border-taco-border rounded-lg text-[13px] text-taco-text bg-white outline-none w-[260px] focus:border-taco-text"
            />
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            {PILLS.map((p) => {
              const active = pill === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => setPill(p.value)}
                  className={`h-[32px] px-3 rounded-full text-[12px] font-semibold transition-colors border ${
                    active
                      ? "bg-taco-text text-white border-taco-text"
                      : "bg-white text-taco-sub border-taco-border hover:text-taco-text hover:border-taco-text"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <table className="w-full">
          <TableHeader
            cols={[
              "Invoice ID",
              "Tanggal Upload",
              "Supplier",
              "Jumlah Baris",
              "Kepercayaan AI",
              "Status",
              "Aksi",
            ]}
          />
          <tbody>
            {filtered.length === 0 ? (
              <EmptyRow
                colSpan={7}
                label="Tidak ada invoice yang cocok dengan filter."
              />
            ) : (
              filtered.map((inv) => {
                const c = confidenceTone(inv.avg_confidence);
                return (
                  <tr
                    key={inv.id}
                    className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
                  >
                    <td className="px-4 py-3 font-mono text-[12px] text-taco-muted whitespace-nowrap">
                      {inv.short_id}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-taco-sub whitespace-nowrap">
                      {formatDateTime(inv.uploaded_at)}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-taco-text">
                      {inv.supplier}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap">
                      {inv.line_count}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inv.status === "processing" ? (
                        <span className="text-[12px] text-taco-muted">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-[12px] text-taco-text">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: c.dot }}
                          />
                          {c.label}
                          <span className="text-taco-muted">
                            ({Math.round(inv.avg_confidence * 100)}%)
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/taro-invoices/${inv.id}`}
                        className="h-[28px] px-2.5 inline-flex items-center border border-taco-border rounded-md text-[12px] text-taco-sub hover:text-taco-text hover:border-taco-text"
                      >
                        Lihat Detail
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
