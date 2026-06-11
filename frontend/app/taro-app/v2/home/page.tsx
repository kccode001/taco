"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listV2Invoices,
  getV2ImageUrl,
  v2StatusLabel,
  v2StatusTone,
  type InvoiceV2,
} from "@/lib/v2/invoices";
import { TopBar } from "../../_components/TopBar";
import { useTaroGuard } from "../../_components/useTaroGuard";
import { isToday, timeAgo } from "../../_components/mockUploads";
import { FileTextIcon, StoreIcon } from "../../_components/icons";
import { BottomNavV2 } from "@/components/pwa-v2/BottomNavV2";

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
  date: string;
  weekday_short: string;
  count: number;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateOf(inv: InvoiceV2): string {
  return inv.created_at ?? "";
}

function buildLast7DayBuckets(invoices: InvoiceV2[]): DayBucket[] {
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
  for (const inv of invoices) {
    const b = byDate.get(ymd(new Date(dateOf(inv))));
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
          loading="lazy"
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
        <linearGradient id="taroV2ChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F04E23" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#F04E23" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1={padL}
        y1={padT + innerH}
        x2={padL + innerW}
        y2={padT + innerH}
        stroke="#E5E7EB"
        strokeWidth={1}
      />
      <path d={areaPath} fill="url(#taroV2ChartFill)" />
      <path
        d={linePath}
        fill="none"
        stroke="#F04E23"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
          <text x={p.x} y={H - 6} fontSize={10} textAnchor="middle" fill="#6B7280">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function TaroV2HomePage() {
  const router = useRouter();
  const { ready } = useTaroGuard();
  const [uploads, setUploads] = useState<InvoiceV2[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listV2Invoices({ limit: 100 });
      setUploads(res.items);
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

  // Resolve signed thumbnail URLs for the recent rows (cap 10). Tokens are valid
  // 15min; failures fall back to the StoreIcon placeholder.
  const recent = useMemo(() => uploads.slice(0, 10), [uploads]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const targets = recent.filter((u) => u.thumb_image_id && !thumbs[u.id]);
      if (targets.length === 0) return;
      const resolved = await Promise.all(
        targets.map(async (u) => {
          const url = await getV2ImageUrl(u.thumb_image_id as string);
          return [u.id, url] as const;
        })
      );
      if (!alive) return;
      setThumbs((prev) => {
        const next = { ...prev };
        for (const [id, url] of resolved) if (url) next[id] = url;
        return next;
      });
    })();
    return () => {
      alive = false;
    };
  }, [recent, thumbs]);

  const todayCount = uploads.filter((u) => isToday(dateOf(u))).length;
  const weekBuckets = useMemo(() => buildLast7DayBuckets(uploads), [uploads]);
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
              onClick={() => router.push("/taro-app/v2/history")}
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
                const tone = v2StatusTone(u.status);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => router.push(`/taro-app/v2/invoice/${u.id}`)}
                    className="w-full bg-white border border-taco-border rounded-xl px-4 py-3 text-left active:bg-taco-page min-h-[80px]"
                  >
                    <div className="flex items-start gap-3">
                      <RowThumbnail src={thumbs[u.id]} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-taco-text truncate">
                          {u.store?.name ?? "Toko Tidak Disebutkan"}
                        </div>
                        {u.area?.name ? (
                          <div className="text-[12px] text-taco-sub mt-0.5 truncate">
                            {u.area.name}
                          </div>
                        ) : null}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${TONE_BG[tone]}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`}
                            />
                            {v2StatusLabel(u.status)}
                          </span>
                          {(u.line_count ?? 0) > 0 && (
                            <span className="text-[11px] text-taco-sub">
                              {u.line_count} baris
                            </span>
                          )}
                          <span className="text-[11px] text-taco-muted ml-auto">
                            {timeAgo(dateOf(u))}
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

      <BottomNavV2 />
    </div>
  );
}
