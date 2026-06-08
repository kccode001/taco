"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRegionAreas,
  getTaroInvoices,
  type RegionArea,
  type TaroInvoiceSummary,
} from "@/lib/api";
import { Badge, TableHeader, EmptyRow } from "../../admin/_components/CrudShell";
import {
  ChevronDownIcon,
  MapIcon,
  SearchIcon,
  CalendarIcon,
} from "../../admin/_components/icons";
import {
  MOCK_REGION_AREAS,
  MOCK_TARO_INVOICES,
  confidenceTone,
  formatDateTime,
} from "../../admin/taro-invoices/_components/mockData";

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
  const [regions, setRegions] = useState<RegionArea[]>([]);
  const [search, setSearch] = useState("");
  const [pill, setPill] = useState<FilterPill>("all");
  const [regionFilter, setRegionFilter] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const regionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getRegionAreas();
        const data =
          ((res.data as { data?: RegionArea[] })?.data ??
            (res.data as RegionArea[])) ?? [];
        if (!alive) return;
        setRegions(data.length ? data : MOCK_REGION_AREAS);
      } catch {
        if (alive) setRegions(MOCK_REGION_AREAS);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const regionMap = useMemo(() => {
    const m = new Map<string, RegionArea>();
    for (const r of regions) m.set(r.id, r);
    return m;
  }, [regions]);

  const refetch = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (pill === "needs_review") params.needs_review = "true";
      else if (pill !== "all") params.status = pill;
      if (search.trim()) params.search = search.trim();
      if (regionFilter !== "all") params.region_id = regionFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await getTaroInvoices(params);
      const raw =
        ((res.data as { data?: unknown[] })?.data ??
          (res.data as unknown[])) ?? [];
      const data: TaroInvoiceSummary[] = (raw as Array<Record<string, unknown>>).map((r) => {
        const id = String(r.id ?? "");
        const lineCount = Number(r.line_count ?? r.lineCount ?? 0);
        const needsReviewCount = Number(r.needs_review_count ?? 0);
        const hasReviewSignal = r.needs_review_count !== undefined;
        const avg = hasReviewSignal
          ? lineCount > 0
            ? Math.max(0, 1 - needsReviewCount / lineCount)
            : 0
          : Number(r.avg_confidence ?? 0);
        const regionId = (r.region_id as string | null | undefined) ?? null;
        const regionDisplay =
          (r.region_display as string | null | undefined) ??
          (regionId ? regionMap.get(regionId)?.display_path ?? null : null);
        const supplier =
          (r.ocr_detected_supplier as string | undefined) ??
          (r.supplier_name as string | undefined) ??
          (r.supplier as string | undefined) ??
          null;
        // Prefer BE-supplied `short_id`. Otherwise use `file_name` (without
        // extension) so the list shows a human-readable identifier rather
        // than the first 12 chars of a UUID. Last fallback is the UUID slice.
        const fileName = (r.file_name as string | undefined) ?? "";
        const short_id =
          (r.short_id as string | undefined) ??
          (fileName ? fileName.replace(/\.[^.]+$/, "") : id.slice(0, 8));
        return {
          id,
          short_id,
          uploaded_at: String(r.uploaded_at ?? r.created_at ?? ""),
          region_id: regionId,
          region_display: regionDisplay,
          ocr_detected_supplier: supplier,
          line_count: lineCount,
          avg_confidence: avg,
          status: (r.status as TaroInvoiceSummary["status"]) ?? "pending",
        };
      });
      setInvoices(data.length ? data : MOCK_TARO_INVOICES);
    } catch {
      setInvoices(MOCK_TARO_INVOICES);
    }
  }, [pill, search, regionFilter, dateFrom, dateTo, regionMap]);

  useEffect(() => {
    const t = setTimeout(refetch, 200);
    return () => clearTimeout(t);
  }, [refetch]);

  useEffect(() => {
    if (!regionMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!regionMenuRef.current?.contains(e.target as Node)) {
        setRegionMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRegionMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [regionMenuOpen]);

  // Client-side enforcement of all filters — guarantees the table mutates even
  // when the BE ignores a filter param.
  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (pill === "done" && i.status !== "done") return false;
      if (pill === "needs_review" && i.status !== "needs_review") return false;
      if (pill === "processing" && i.status !== "processing") return false;
      if (regionFilter !== "all" && i.region_id !== regionFilter) return false;
      if (dateFrom || dateTo) {
        const ts = i.uploaded_at ? new Date(i.uploaded_at).getTime() : NaN;
        if (Number.isNaN(ts)) return false;
        if (dateFrom) {
          const from = new Date(dateFrom + "T00:00:00").getTime();
          if (ts < from) return false;
        }
        if (dateTo) {
          const to = new Date(dateTo + "T23:59:59").getTime();
          if (ts > to) return false;
        }
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = [
          i.short_id,
          i.id,
          i.region_display ?? "",
          i.ocr_detected_supplier ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, pill, regionFilter, dateFrom, dateTo, search]);

  const selectedRegionLabel =
    regionFilter === "all"
      ? "Semua Wilayah"
      : regionMap.get(regionFilter)?.display_path ?? "Semua Wilayah";

  const hasDateFilter = !!(dateFrom || dateTo);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-taco-text leading-tight">
            Daftar Invoice Taro
          </h1>
          <p className="text-[13px] text-taco-sub mt-1">
            {invoices.length} invoice · {filtered.length} cocok dengan filter ·
            klik baris untuk meninjau line items
          </p>
        </div>
        <Link
          href="/taro/invoices/upload"
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
              placeholder="Cari ID invoice atau nama wilayah…"
              className="h-[36px] pl-9 pr-3 border border-taco-border rounded-lg text-[13px] text-taco-text bg-white outline-none w-[260px] focus:border-taco-text"
            />
          </div>

          <div ref={regionMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setRegionMenuOpen((v) => !v)}
              className={`h-[36px] pl-3 pr-2 inline-flex items-center gap-2 border rounded-lg text-[13px] bg-white transition-colors min-w-[200px] max-w-[280px] ${
                regionMenuOpen || regionFilter !== "all"
                  ? "border-taco-text text-taco-text"
                  : "border-taco-border text-taco-sub hover:border-taco-text hover:text-taco-text"
              }`}
              aria-haspopup="listbox"
              aria-expanded={regionMenuOpen}
            >
              <span className="text-taco-muted flex-shrink-0">
                <MapIcon size={14} />
              </span>
              <span className="truncate flex-1 text-left">
                {selectedRegionLabel}
              </span>
              <span className="text-taco-muted flex-shrink-0">
                <ChevronDownIcon size={14} />
              </span>
            </button>
            {regionMenuOpen && (
              <div className="absolute z-30 mt-1.5 w-[300px] bg-white border border-taco-border rounded-lg shadow-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setRegionFilter("all");
                    setRegionMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-[13px] hover:bg-taco-page ${
                    regionFilter === "all"
                      ? "bg-taco-page text-taco-text font-semibold"
                      : "text-taco-text"
                  }`}
                >
                  Semua Wilayah
                </button>
                <div className="max-h-[280px] overflow-y-auto border-t border-taco-divider">
                  {regions.map((r) => {
                    const active = regionFilter === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setRegionFilter(r.id);
                          setRegionMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-[13px] hover:bg-taco-page ${
                          active
                            ? "bg-taco-page text-taco-text font-semibold"
                            : "text-taco-text"
                        }`}
                      >
                        {r.display_path}
                      </button>
                    );
                  })}
                </div>
                <div className="px-3 py-2 border-t border-taco-divider text-[11px] text-taco-muted">
                  {regions.length} wilayah ASM
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-taco-muted">
              <CalendarIcon size={14} />
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`h-[36px] px-2 border rounded-lg text-[13px] text-taco-text bg-white outline-none ${
                hasDateFilter ? "border-taco-text" : "border-taco-border"
              }`}
              aria-label="Tanggal mulai"
            />
            <span className="text-[12px] text-taco-muted">s/d</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`h-[36px] px-2 border rounded-lg text-[13px] text-taco-text bg-white outline-none ${
                hasDateFilter ? "border-taco-text" : "border-taco-border"
              }`}
              aria-label="Tanggal akhir"
            />
            {hasDateFilter && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-[12px] text-taco-sub hover:text-taco-text underline underline-offset-2"
              >
                Reset
              </button>
            )}
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
              "Wilayah ASM",
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
                    <td className="px-4 py-3 text-[13px]">
                      {inv.region_display ? (
                        <span className="text-taco-text">{inv.region_display}</span>
                      ) : (
                        <span className="text-taco-muted italic">Tanpa Region</span>
                      )}
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
                        href={`/taro/invoices/${inv.id}`}
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
