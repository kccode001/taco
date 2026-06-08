"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { getTaroInvoices, type TaroInvoiceSummary } from "@/lib/api";
import { TopBar } from "../_components/TopBar";
import { BottomNav } from "../_components/BottomNav";
import { useTaroGuard } from "../_components/useTaroGuard";
import {
  MOCK_AGENT_UPLOADS,
  greetingByHour,
  isToday,
  statusLabel,
  statusTone,
  timeAgo,
  type AgentUpload,
} from "../_components/mockUploads";
import { FileTextIcon, PlusIcon, StoreIcon } from "../_components/icons";

type UploadRow = AgentUpload | TaroInvoiceSummary;

function isAgentUpload(u: UploadRow): u is AgentUpload {
  return "store_name" in u && !!(u as AgentUpload).store_name;
}

function storeName(u: UploadRow): string {
  if (isAgentUpload(u)) return u.store_name;
  return u.short_id;
}

const TONE_BG: Record<"ok" | "warn" | "err" | "info", string> = {
  ok: "bg-emerald-50 text-taco-success",
  warn: "bg-amber-50 text-taco-warning",
  err: "bg-red-50 text-taco-error",
  info: "bg-blue-50 text-taco-info",
};

const TONE_DOT: Record<"ok" | "warn" | "err" | "info", string> = {
  ok: "bg-taco-success",
  warn: "bg-taco-warning",
  err: "bg-taco-error",
  info: "bg-taco-info",
};

export default function TaroHomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { ready } = useTaroGuard();
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMocks, setUsingMocks] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTaroInvoices({ limit: "20" });
      const data =
        ((res.data as { data?: TaroInvoiceSummary[] })?.data ??
          (res.data as TaroInvoiceSummary[])) ?? [];
      if (data.length === 0) {
        setUploads(MOCK_AGENT_UPLOADS);
        setUsingMocks(true);
      } else {
        setUploads(data);
        setUsingMocks(false);
      }
    } catch {
      setUploads(MOCK_AGENT_UPLOADS);
      setUsingMocks(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  const todayCount = uploads.filter((u) => isToday(u.uploaded_at)).length;
  const firstName = user?.name?.split(" ")[0] ?? "Agent";
  const recent = uploads.slice(0, 10);

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[96px]">
        <TopBar />

        {/* Greeting + region badge */}
        <div className="bg-white border-b border-taco-divider px-4 pt-3 pb-4">
          <div className="text-[18px] font-semibold text-taco-text leading-tight">
            {greetingByHour()}, {firstName}
          </div>
          <div className="text-[13px] text-taco-sub mt-1">
            {user?.region_display ?? "Wilayah belum ditetapkan"}
          </div>
        </div>

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

        {/* Primary CTA — single orange element */}
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => router.push("/taro-app/upload")}
            className="w-full min-h-[60px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] flex items-center justify-center gap-2 active:bg-taco-accent-dark transition-colors"
          >
            <PlusIcon size={20} />
            <span>Upload Invoice</span>
          </button>
        </div>

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
          ) : recent.length === 0 ? (
            <div className="bg-white border border-taco-border rounded-xl p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-taco-page border border-taco-border mx-auto mb-3 flex items-center justify-center text-taco-muted">
                <FileTextIcon size={22} />
              </div>
              <div className="text-[14px] text-taco-sub leading-relaxed">
                Belum ada upload. Mulai dengan tombol Upload di atas.
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
                      <div className="w-10 h-10 rounded-lg bg-taco-page border border-taco-divider flex items-center justify-center text-taco-sub flex-shrink-0">
                        <StoreIcon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-taco-text truncate">
                          {storeName(u)}
                        </div>
                        <div className="text-[12px] text-taco-sub mt-0.5 truncate">
                          {u.region_display ?? "—"}
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
                          {u.status === "done" && u.line_count > 0 && (
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

          {usingMocks && !loading && (
            <div className="mt-3 text-[11px] text-taco-muted text-center">
              Contoh data — backend agent endpoint belum aktif.
            </div>
          )}
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
