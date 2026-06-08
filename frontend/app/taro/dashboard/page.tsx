"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getTaroAnalytics,
  getTaroInvoices,
  type TaroAnalytics,
  type TaroInvoiceSummary,
} from "@/lib/api";
import {
  MOCK_ANALYTICS,
  MOCK_TARO_INVOICES,
  confidenceTone,
  formatDateTime,
} from "../../admin/taro-invoices/_components/mockData";
import { Badge } from "../../admin/_components/CrudShell";

/** Taro Dashboard overview — KPI tiles + regions_summary bars + agents leaderboard
 *  + recent uploads + top SKUs. Distinct from /taro/invoices/analytics which is
 *  the deep-dive analytics page; this is the "front door" of the Taro tree. */

interface AgentRow {
  id: string;
  name: string;
  region_display?: string | null;
  invoice_count: number;
}

/** Fallback agents leaderboard when BE doesn't ship /agents_summary yet. */
const MOCK_AGENTS_TOP10: AgentRow[] = [
  { id: "ag-1", name: "Andika Pratama", region_display: "W - BU2 - ASM Jakarta Selatan", invoice_count: 42 },
  { id: "ag-2", name: "Sri Wahyuni", region_display: "C - BU1 - ASM Bandung", invoice_count: 38 },
  { id: "ag-3", name: "Budi Santoso", region_display: "E - BU1 - ASM Surabaya", invoice_count: 34 },
  { id: "ag-4", name: "Lestari Putri", region_display: "C - BU1 - ASM Semarang", invoice_count: 29 },
  { id: "ag-5", name: "Rizky Hidayat", region_display: "N - BU1 - ASM Medan", invoice_count: 27 },
  { id: "ag-6", name: "Maya Anggraini", region_display: "W - BU2 - ASM Jakarta Barat", invoice_count: 24 },
  { id: "ag-7", name: "Dimas Saputra", region_display: "E - BU1 - ASM Malang", invoice_count: 21 },
  { id: "ag-8", name: "Fitri Ramadhani", region_display: "S - BU1 - ASM Palembang", invoice_count: 18 },
  { id: "ag-9", name: "Hendro Wibowo", region_display: "E - BU1 - ASM Bali", invoice_count: 15 },
  { id: "ag-10", name: "Wulan Sari", region_display: "W - BU2 - ASM Tangerang", invoice_count: 12 },
];

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`bg-white border rounded-xl p-5 ${
        accent ? "border-taco-accent" : "border-taco-border"
      }`}
    >
      <div className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`text-[24px] font-bold mt-2 leading-tight ${
          accent ? "text-taco-accent" : "text-taco-text"
        }`}
      >
        {value}
      </div>
      {hint && <div className="text-[12px] text-taco-sub mt-1">{hint}</div>}
    </div>
  );
}

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

export default function TaroDashboardOverviewPage() {
  const [analytics, setAnalytics] = useState<TaroAnalytics | null>(null);
  const [recent, setRecent] = useState<TaroInvoiceSummary[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await getTaroAnalytics();
        // BE can return a partial shape (e.g. missing regions_summary or KPIs)
        // — merge over the mock so every field the page reads is defined.
        const merged: TaroAnalytics = {
          ...MOCK_ANALYTICS,
          ...(res.data ?? {}),
          regions_summary:
            res.data?.regions_summary ?? MOCK_ANALYTICS.regions_summary,
          top_uploaded_skus:
            res.data?.top_uploaded_skus ?? MOCK_ANALYTICS.top_uploaded_skus,
        };
        setAnalytics(merged);
      } catch {
        setAnalytics(MOCK_ANALYTICS);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await getTaroInvoices();
        const raw =
          ((res.data as { data?: unknown[] })?.data ??
            (res.data as unknown[])) ?? [];
        // BE list shape lacks avg_confidence — derive coarse signal from
        // needs_review_count / line_count so the dot + percent render.
        const normalized: TaroInvoiceSummary[] = (raw as Array<Record<string, unknown>>).map(
          (r) => {
            const id = String(r.id ?? "");
            const lineCount = Number(r.line_count ?? r.lineCount ?? 0);
            const needsReviewCount = Number(r.needs_review_count ?? 0);
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
              region_id: (r.region_id as string | null | undefined) ?? null,
              region_display:
                (r.region_display as string | null | undefined) ?? null,
              line_count: lineCount,
              avg_confidence: Number.isFinite(avg) ? avg : 0,
              status: (r.status as TaroInvoiceSummary["status"]) ?? "pending",
            };
          }
        );
        setRecent(
          normalized.length ? normalized.slice(0, 8) : MOCK_TARO_INVOICES.slice(0, 8)
        );
      } catch {
        setRecent(MOCK_TARO_INVOICES.slice(0, 8));
      }
    })();
  }, []);

  useEffect(() => {
    // BE: GET /api/taro-invoices/agents_summary — not shipped yet. Auto-resolve
    // when Core lights it up; fall back to mock leaderboard otherwise.
    (async () => {
      try {
        const r = await fetch("/api/taro-invoices/agents_summary").catch(() => null);
        if (r && r.ok) {
          const j = await r.json();
          const list = (j?.data ?? j) as AgentRow[];
          if (Array.isArray(list) && list.length) {
            setAgents(list.slice(0, 10));
            return;
          }
        }
      } catch {
        /* ignore */
      }
      setAgents(MOCK_AGENTS_TOP10);
    })();
  }, []);

  const a = analytics ?? MOCK_ANALYTICS;
  const regions = useMemo(
    () =>
      (a.regions_summary ?? [])
        .slice()
        .sort((x, y) => y.invoice_count - x.invoice_count)
        .slice(0, 10),
    [a.regions_summary]
  );
  const regionsMax = Math.max(1, ...regions.map((r) => r.invoice_count));
  const agentMax = Math.max(1, ...agents.map((g) => g.invoice_count));
  const topSkus = (a.top_uploaded_skus ?? []).slice(0, 8);
  const topSkuMax = Math.max(1, ...topSkus.map((s) => s.count));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-taco-text leading-tight">
            Taro Dashboard
          </h1>
          <p className="text-[13px] text-taco-sub mt-1">
            Ringkasan invoice OCR, kontribusi agent, dan tren wilayah.
          </p>
        </div>
        <Link
          href="/taro/invoices/upload"
          className="h-[36px] px-4 inline-flex items-center bg-taco-accent text-white rounded-lg text-[13px] font-semibold hover:bg-taco-accent-dark transition-colors"
        >
          + Upload Invoice
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label="Total Invoice"
          value={(a.total_invoices ?? 0).toLocaleString("id-ID")}
          hint={`${a.processed ?? 0} diproses`}
          accent
        />
        <Kpi
          label="Perlu Review"
          value={(a.needs_review ?? 0).toLocaleString("id-ID")}
          hint="Confidence rendah / belum cocok"
        />
        <Kpi
          label="Rata-rata Kepercayaan"
          value={`${Math.round((a.avg_confidence ?? 0) * 100)}%`}
          hint="Akurasi OCR keseluruhan"
        />
        <Kpi
          label="Sales Agent Aktif"
          value={agents.length.toString()}
          hint="Top 10 ditampilkan di bawah"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-taco-border rounded-xl p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold text-taco-text">
                Volume Invoice per Wilayah
              </h2>
              <p className="text-[12px] text-taco-sub mt-0.5">
                Top 10 wilayah ASM berdasarkan jumlah invoice
              </p>
            </div>
            <Link
              href="/taro/invoices"
              className="text-[12px] text-taco-sub hover:text-taco-text"
            >
              Lihat detail →
            </Link>
          </div>
          <div className="space-y-2.5">
            {regions.length === 0 ? (
              <div className="text-[12px] text-taco-muted py-4">
                Belum ada data wilayah.
              </div>
            ) : (
              regions.map((r) => {
                const pct = (r.invoice_count / regionsMax) * 100;
                return (
                  <div
                    key={r.region.id ?? "tanpa-region"}
                    className="flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 text-[12px] mb-1">
                        <span className="text-taco-text truncate">
                          {r.region.display_path}
                        </span>
                        <span className="text-taco-muted whitespace-nowrap">
                          {Math.round(r.avg_confidence * 100)}% akurasi
                        </span>
                      </div>
                      <div className="h-2 bg-taco-page rounded-full overflow-hidden">
                        <div
                          className="h-full bg-taco-text transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-[13px] font-semibold text-taco-text w-10 text-right">
                      {r.invoice_count}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white border border-taco-border rounded-xl p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold text-taco-text">
                Top Sales Agent
              </h2>
              <p className="text-[12px] text-taco-sub mt-0.5">
                10 agent dengan upload terbanyak
              </p>
            </div>
            <Link
              href="/taro/agents"
              className="text-[12px] text-taco-sub hover:text-taco-text"
            >
              Semua →
            </Link>
          </div>
          <div className="space-y-2.5">
            {agents.length === 0 ? (
              <div className="text-[12px] text-taco-muted py-4">
                Belum ada agent terdaftar.
              </div>
            ) : (
              agents.map((g, idx) => {
                const pct = (g.invoice_count / agentMax) * 100;
                return (
                  <div key={g.id} className="flex items-center gap-3">
                    <span className="text-[11px] text-taco-muted font-mono w-5 text-right">
                      #{idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 text-[12px] mb-1">
                        <span className="text-taco-text truncate font-medium">
                          {g.name}
                        </span>
                        <span className="text-taco-muted">
                          {g.invoice_count}
                        </span>
                      </div>
                      <div className="h-1.5 bg-taco-page rounded-full overflow-hidden">
                        <div
                          className="h-full bg-taco-text transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-taco-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-taco-divider flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-taco-text">
              Upload Terbaru
            </h2>
            <Link
              href="/taro/invoices"
              className="text-[12px] text-taco-sub hover:text-taco-text"
            >
              Semua invoice →
            </Link>
          </div>
          <ul>
            {recent.length === 0 ? (
              <li className="px-4 py-8 text-center text-[13px] text-taco-muted">
                Belum ada upload.
              </li>
            ) : (
              recent.map((inv) => {
                const c = confidenceTone(inv.avg_confidence);
                return (
                  <li
                    key={inv.id}
                    className="px-4 py-3 border-b border-taco-divider last:border-0 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/taro/invoices/${inv.id}`}
                          className="font-mono text-[12px] text-taco-text hover:text-taco-accent"
                        >
                          {inv.short_id}
                        </Link>
                        {statusBadge(inv.status)}
                      </div>
                      <div className="text-[12px] text-taco-sub mt-0.5 truncate">
                        {inv.region_display ?? "Tanpa Region"} ·{" "}
                        {formatDateTime(inv.uploaded_at)}
                      </div>
                    </div>
                    <div className="text-[12px] text-taco-text whitespace-nowrap flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: c.dot }}
                      />
                      {Math.round(inv.avg_confidence * 100)}%
                    </div>
                    <div className="text-[12px] text-taco-sub whitespace-nowrap">
                      {inv.line_count} baris
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="bg-white border border-taco-border rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-[14px] font-semibold text-taco-text">
              SKU Paling Banyak Diupload
            </h2>
            <p className="text-[12px] text-taco-sub mt-0.5">
              Top 8 SKU dari semua invoice
            </p>
          </div>
          <div className="space-y-2.5">
            {topSkus.length === 0 ? (
              <div className="text-[12px] text-taco-muted py-4">
                Belum ada data.
              </div>
            ) : (
              topSkus.map((s) => {
                const pct = (s.count / topSkuMax) * 100;
                return (
                  <div key={s.sku_code} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 text-[12px] mb-1">
                        <span className="text-taco-text truncate">
                          {s.sku_name}
                        </span>
                        <span className="text-taco-muted whitespace-nowrap">
                          {s.count}
                        </span>
                      </div>
                      <div className="h-1.5 bg-taco-page rounded-full overflow-hidden">
                        <div
                          className="h-full bg-taco-text"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
