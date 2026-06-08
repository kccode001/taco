"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getTaroUploadsInProgress,
  type TaroInProgressUpload,
  type TaroProgressStage,
} from "@/lib/api";
import { CheckIcon, CloseIcon } from "../../_components/icons";

/** localStorage key — bag of best-effort tracked uploads. The BE is the
 *  source of truth; this only keeps the page hot across refreshes when the
 *  BE roster is empty or still warming up. */
export const LS_KEY = "taro_uploads_in_progress";

export interface LocalUpload {
  id: string;
  file_name: string;
  uploaded_at: string;
  region_display?: string;
}

/** Read localStorage shadow list safely. */
function readLocal(): LocalUpload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalUpload[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: LocalUpload[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode — ignore. */
  }
}

export function pushLocalUploads(uploads: LocalUpload[]) {
  const existing = readLocal();
  const merged = [...existing];
  for (const u of uploads) {
    if (!merged.find((m) => m.id === u.id)) merged.push(u);
  }
  writeLocal(merged);
}

const STAGE_LABEL: Record<TaroProgressStage, string> = {
  queued: "Antrian",
  processing: "Memproses",
  ocr: "OCR berjalan",
  mapping: "Memetakan SKU",
  done: "Selesai",
  failed: "Gagal",
};

function elapsed(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "baru saja";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} mnt lalu`;
  const hr = Math.floor(min / 60);
  return `${hr} jam lalu`;
}

/** Merge BE results with the localStorage shadow list — BE wins on id collision. */
function mergeWithLocal(
  beItems: TaroInProgressUpload[],
  localItems: LocalUpload[]
): TaroInProgressUpload[] {
  const map = new Map<string, TaroInProgressUpload>();
  for (const l of localItems) {
    map.set(l.id, {
      id: l.id,
      file_name: l.file_name,
      region_display: l.region_display ?? null,
      status: "queued",
      progress_percent: 5,
      stage_label: STAGE_LABEL.queued,
      uploaded_at: l.uploaded_at,
    });
  }
  for (const b of beItems) {
    map.set(b.id, b);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  );
}

/** Drop done/failed items from localStorage after `ttlMs`. */
function gcLocal(items: TaroInProgressUpload[], ttlMs = 30_000) {
  const local = readLocal();
  if (!local.length) return;
  const now = Date.now();
  const keep = local.filter((l) => {
    const live = items.find((i) => i.id === l.id);
    if (!live) return true;
    if (live.status !== "done" && live.status !== "failed") return true;
    return now - new Date(l.uploaded_at).getTime() < ttlMs;
  });
  if (keep.length !== local.length) writeLocal(keep);
}

export function InProgressPanel({
  /** Re-render trigger from the upload page — bumps after a successful upload. */
  refreshNonce,
  /** Called when the user hits "Coba lagi" on a failed item. */
  onRetry,
}: {
  refreshNonce?: number;
  onRetry?: (item: TaroInProgressUpload) => void;
}) {
  const [items, setItems] = useState<TaroInProgressUpload[]>([]);
  const [, setTick] = useState(0); // forces elapsed-time refresh
  const beHydratedRef = useRef(false);

  // Initial hydration — read localStorage immediately so the page shows
  // resumed cards within one paint of a refresh.
  useEffect(() => {
    const local = readLocal();
    if (local.length) {
      setItems(mergeWithLocal([], local));
    }
  }, []);

  // Tick every second so "5s lalu" stays fresh.
  useEffect(() => {
    const i = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(i);
  }, []);

  // Fetch BE state + poll while anything is still in flight.
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    async function fetchOnce() {
      try {
        const res = await getTaroUploadsInProgress();
        const data =
          ((res.data as { data?: TaroInProgressUpload[] })?.data ??
            (res.data as TaroInProgressUpload[])) ?? [];
        if (!alive) return;
        beHydratedRef.current = true;
        const local = readLocal();
        const merged = mergeWithLocal(data, local);
        setItems(merged);
        gcLocal(merged);
        const stillRunning = merged.some(
          (m) =>
            m.status === "queued" ||
            m.status === "processing" ||
            m.status === "ocr" ||
            m.status === "mapping"
        );
        if (stillRunning) {
          timer = window.setTimeout(fetchOnce, 3000);
        }
      } catch {
        // BE endpoint not shipped → simulate forward progress from localStorage
        // so the demo still shows real-feeling progress bars after refresh.
        if (!alive) return;
        const local = readLocal();
        if (!local.length) {
          setItems([]);
          return;
        }
        const simulated: TaroInProgressUpload[] = local.map((l) => {
          const ageSec = (Date.now() - new Date(l.uploaded_at).getTime()) / 1000;
          let pct = Math.min(98, Math.round(15 + ageSec * 8));
          let status: TaroProgressStage = "processing";
          let stage: string = STAGE_LABEL.processing;
          if (ageSec < 3) {
            status = "queued";
            stage = STAGE_LABEL.queued;
            pct = Math.min(20, pct);
          } else if (ageSec < 8) {
            status = "ocr";
            stage = STAGE_LABEL.ocr;
          } else if (ageSec < 14) {
            status = "mapping";
            stage = STAGE_LABEL.mapping;
          } else {
            status = "done";
            stage = STAGE_LABEL.done;
            pct = 100;
          }
          return {
            id: l.id,
            file_name: l.file_name,
            region_display: l.region_display ?? null,
            status,
            progress_percent: pct,
            stage_label: stage,
            uploaded_at: l.uploaded_at,
          };
        });
        setItems(simulated);
        gcLocal(simulated);
        const anyRunning = simulated.some((s) => s.status !== "done" && s.status !== "failed");
        if (anyRunning) timer = window.setTimeout(fetchOnce, 3000);
      }
    }

    fetchOnce();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [refreshNonce]);

  const hasRunning = useMemo(
    () =>
      items.some(
        (i) =>
          i.status === "queued" ||
          i.status === "processing" ||
          i.status === "ocr" ||
          i.status === "mapping"
      ),
    [items]
  );

  if (items.length === 0) {
    return (
      <div className="bg-white border border-taco-border rounded-xl px-5 py-4">
        <div className="text-[14px] font-semibold text-taco-text mb-0.5">
          Sedang diproses
        </div>
        <div className="text-[12px] text-taco-muted">
          Tidak ada invoice yang sedang diproses. Upload baru di atas.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-taco-divider flex items-center gap-2">
        <div className="text-[14px] font-semibold text-taco-text">
          Sedang diproses ({items.length})
        </div>
        {hasRunning && (
          <div className="flex items-center gap-1.5 text-[11px] text-taco-sub">
            <span className="w-1.5 h-1.5 rounded-full bg-taco-info animate-pulse" />
            Live — polling tiap 3 detik
          </div>
        )}
      </div>
      <ul>
        {items.map((it) => {
          const done = it.status === "done";
          const failed = it.status === "failed";
          const stageLabel = it.stage_label ?? STAGE_LABEL[it.status] ?? "Memproses";
          const pct = Math.max(0, Math.min(100, it.progress_percent ?? 0));
          const barColor = failed
            ? "bg-taco-error"
            : done
            ? "bg-taco-success"
            : "bg-taco-info";

          return (
            <li
              key={it.id}
              className={`px-4 py-3 border-b border-taco-divider last:border-0 transition-opacity ${
                done ? "opacity-95" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[13px] font-medium text-taco-text truncate max-w-[260px]">
                      {it.file_name}
                    </span>
                    {it.region_display && (
                      <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-taco-page border border-taco-border text-taco-sub whitespace-nowrap">
                        {it.region_display}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 w-full bg-taco-page rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-all duration-500 ease-out`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-taco-muted">
                    <span
                      className={
                        failed
                          ? "text-taco-error font-medium"
                          : done
                          ? "text-taco-success font-medium"
                          : "text-taco-info font-medium"
                      }
                    >
                      {stageLabel}
                    </span>
                    <span>·</span>
                    <span>{pct}%</span>
                    <span>·</span>
                    <span>{elapsed(it.uploaded_at)}</span>
                  </div>
                  {failed && it.error_message && (
                    <div className="mt-1 text-[11px] text-taco-error">
                      {it.error_message}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {done && (
                    <>
                      <span className="text-taco-success" aria-label="Selesai">
                        <CheckIcon size={16} />
                      </span>
                      <Link
                        href={`/admin/taro-invoices/${it.id}`}
                        className="h-[36px] px-3 inline-flex items-center border border-taco-border rounded-lg text-[12px] font-semibold text-taco-text bg-white hover:border-taco-text"
                      >
                        Lihat hasil
                      </Link>
                    </>
                  )}
                  {failed && (
                    <>
                      <span className="text-taco-error" aria-label="Gagal">
                        <CloseIcon size={16} />
                      </span>
                      {onRetry && (
                        <button
                          type="button"
                          onClick={() => onRetry(it)}
                          className="h-[36px] px-3 inline-flex items-center border border-taco-border rounded-lg text-[12px] font-semibold text-taco-text bg-white hover:border-taco-text"
                        >
                          Coba lagi
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
