"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getTaroInvoices, type TaroInvoiceSummary } from "@/lib/api";
import { TopBar } from "../_components/TopBar";
import { BottomNav } from "../_components/BottomNav";
import { useTaroGuard } from "../_components/useTaroGuard";
import {
  isToday,
  statusLabel,
  statusTone,
  timeAgo,
} from "../_components/mockUploads";
import { FileTextIcon, StoreIcon } from "../_components/icons";

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

const WEEKDAY_SHORT_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

interface DayBucket {
  date: string; // YYYY-MM-DD
  weekday_short: string;
  count: number;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildLast7DayBuckets(uploads: TaroInvoiceSummary[], userId?: string): DayBucket[] {
  const now = new Date();
  const buckets: DayBucket[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    buckets.push({
      date: ymd(d),
      weekday_short: WEEKDAY_SHORT_ID[d.getDay()] ?? "—",
      count: 0,
    });
  }
  const byDate = new Map(buckets.map((b) => [b.date, b]));
  for (const u of uploads) {
    if (userId) {
      const uploaderId =
        (u as TaroInvoiceSummary & { uploaded_by_user_id?: string; uploaded_by?: string })
          .uploaded_by_user_id ??
        (u as TaroInvoiceSummary & { uploaded_by_user_id?: string; uploaded_by?: string })
          .uploaded_by;
      if (uploaderId && uploaderId !== userId) continue;
    }
    const dt = new Date(u.uploaded_at);
    const key = ymd(dt);
    const b = byDate.get(key);
    if (b) b.count += 1;
  }
  return buckets;
}

function RowThumbnail({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  return (
    <div className="w-10 h-10 rounded-lg bg-taco-page border border-taco-divider flex items-center justify-center text-taco-sub flex-shrink-0 overflow-hidden">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <StoreIcon size={18} />
      )}
    </div>
  );
}

function WeeklyChart({ buckets }: { buckets: DayBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  // SVG dims
  const W = 320;
  const H = 110;
  const padL = 20;
  const padR = 12;
  const padT = 10;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = buckets.length > 1 ? innerW / (buckets.length - 1) : innerW;

  const points = buckets.map((b, i) => {
    const x = padL + i * stepX;
    const y = padT + innerH - (b.count / max) * innerH;
    return { x, y, count: b.count, label: b.weekday_short };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath = `${linePath} L ${padL + innerW} ${padT + innerH} L ${padL} ${
    padT + innerH
  } Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Grafik upload 7 hari terakhir"
    >
      <defs>
        <linearGradient id="taroChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F04E23" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#F04E23" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Baseline */}
      <line
        x1={padL}
        y1={padT + innerH}
        x2={padL + innerW}
        y2={padT + innerH}
        stroke="#E5E7EB"
        strokeWidth={1}
      />

      <path d={areaPath} fill="url(#taroChartFill)" />
      <path
        d={linePath}
        fill="none"
        stroke="#F04E23"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.5} fill="#F04E23" />
          {p.count > 0 && (
            <text
              x={p.x}
              y={p.y - 8}
              fontSize={10}
              textAnchor="middle"
              fill="#1F2937"
              fontWeight={600}
            >
              {p.count}
            </text>
          )}
          <text
            x={p.x}
            y={H - 6}
            fontSize={10}
            textAnchor="middle"
            fill="#6B7280"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function TaroHomePage() {
  const router = useRouter();
  const { ready } = useTaroGuard();
  const [uploads, setUploads] = useState<TaroInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTaroInvoices({ limit: "200" });
      const data =
        ((res.data as { data?: TaroInvoiceSummary[] })?.data ??
          (res.data as TaroInvoiceSummary[])) ?? [];
      setUploads(data);
    } catch (err) {
      const message =
        (err as { message?: string })?.message ?? "Tidak bisa memuat data.";
      setUploads([]);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  // Trust the BE's JWT ownership scope. `GET /api/taro-invoices` auto-filters a
  // taro_agent to their OWN uploads, derived from the JWT sub and never from
  // query params (taro-invoices.controller.ts:230 → service.ts:626) — the exact
  // scope the Riwayat screen already relies on. The previous client-side
  // re-filter compared each row's `uploaded_by` against the locally-stored
  // `user.id`, which is NOT guaranteed to equal the BE user id that owns the
  // upload: `user.id` is set at login and the /me enrichment that would correct
  // it is skipped once region_id is present (useTaroGuard.ts:45). When the two
  // ids diverged, a genuine upload that Riwayat happily renders was wrongly
  // hidden here. Re-filtering added no security (the BE already enforces the
  // scope) and only introduced this bug, so we drop it and trust the BE.
  const myUploads = uploads;

  const todayCount = myUploads.filter((u) => isToday(u.uploaded_at)).length;
  const recent = myUploads.slice(0, 10);

  const weekBuckets = useMemo(
    () => buildLast7DayBuckets(myUploads, undefined),
    [myUploads]
  );
  const weekTotal = weekBuckets.reduce((acc, b) => acc + b.count, 0);

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[96px]">
        <TopBar />

        {/* Upload Hari Ini summary */}
        <div className="px-4 pt-4">
          <div className="bg-white border border-taco-border rounded-xl px-4 py-3.5 flex items-center justify-between">
            <div>
              <div className="text-[12px] text-taco-sub uppercase tracking-wider font-medium">
                Upload Hari Ini
              </div>
              <div className="text-[28px] font-semibold text-taco-text leading-tight mt-1">
                {loading ? "…" : todayCount}
                <span className="text-[14px] text-taco-sub font-normal ml-1.5">
                  invoice
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-taco-page border border-taco-border flex items-center justify-center text-taco-sub">
              <FileTextIcon size={22} />
            </div>
          </div>
        </div>

        {/* Weekly chart */}
        <section className="px-4 pt-3">
          <div className="bg-white border border-taco-border rounded-xl p-4">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-[14px] font-semibold text-taco-text">
                Upload 7 Hari Terakhir
              </h2>
              <div className="text-[20px] font-semibold text-taco-text">
                {loading ? "…" : weekTotal}
                <span className="text-[12px] text-taco-sub font-normal ml-1">
                  invoice
                </span>
              </div>
            </div>
            <WeeklyChart buckets={weekBuckets} />
          </div>
        </section>

        {/* Riwayat Terbaru */}
        <section className="px-4 pt-5 flex-1">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-[15px] font-semibold text-taco-text">
              Riwayat Terbaru
            </h2>
            <button
              type="button"
              onClick={() => router.push("/taro-app/history")}
              className="text-[13px] text-taco-sub hover:text-taco-text"
            >
              Lihat semua
            </button>
          </div>

          {loading ? (
            <div className="bg-white border border-taco-border rounded-xl p-6 text-center text-[14px] text-taco-muted">
              Memuat riwayat…
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
          ) : recent.length === 0 ? (
            <div className="bg-white border border-taco-border rounded-xl p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-taco-page border border-taco-border mx-auto mb-3 flex items-center justify-center text-taco-muted">
                <FileTextIcon size={22} />
              </div>
              <div className="text-[14px] text-taco-sub leading-relaxed">
                Belum ada upload. Mulai dengan tombol + di bawah.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recent.map((u) => {
                const tone = statusTone(u.status);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => router.push(`/taro-app/upload/${u.id}`)}
                    className="w-full bg-white border border-taco-border rounded-xl px-4 py-3 text-left active:bg-taco-page min-h-[80px]"
                  >
                    <div className="flex items-start gap-3">
                      <RowThumbnail src={u.image_url} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-taco-text truncate">
                          {(u as TaroInvoiceSummary & { store_name?: string })
                            .store_name ?? u.short_id ?? u.id}
                        </div>
                        {u.region_display ? (
                          <div className="text-[12px] text-taco-sub mt-0.5 truncate">
                            {u.region_display}
                          </div>
                        ) : null}
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
                            u.status === "needs_review") &&
                            u.line_count > 0 && (
                              <span className="text-[11px] text-taco-sub">
                                {u.line_count} baris ·{" "}
                                {Math.round((u.avg_confidence ?? 0) * 100)}%
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
