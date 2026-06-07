"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import {
  uploadVoiceRecording,
  getVoiceSummary,
  type VoiceSummaryGroup,
  type VoiceSummaryResponse,
  getVisit,
} from "@/lib/api";
import {
  VoiceWaveform,
  AiReviewList,
  formatMmSs,
  useVoiceRecorder,
  type ReviewItem,
} from "@/components/mobile";

type Step = "record" | "process" | "review";

const GROUP_LABELS: Record<VoiceSummaryGroup["key"], { label: string; route: string }> = {
  info: { label: "Info Kunjungan", route: "info" },
  data_taco: { label: "Data TACO", route: "data" },
  kompetitor: { label: "Kompetitor", route: "competitor" },
  sinyal: { label: "Sinyal Pasar", route: "sinyal" },
};

const FALLBACK_GROUPS: VoiceSummaryGroup[] = [
  { key: "info", status: "empty", preview: "Belum ada data" },
  { key: "data_taco", status: "empty", preview: "Belum ada data" },
  { key: "kompetitor", status: "empty", preview: "Belum ada data" },
  { key: "sinyal", status: "empty", preview: "Belum ada data" },
];

export default function VisitVoicePage() {
  const router = useRouter();
  const params = useParams();
  const visitId = params?.id as string;
  const { user } = useAuthStore();

  const [step, setStep] = useState<Step>("record");
  const [storeName, setStoreName] = useState<string>("");
  const [processStep, setProcessStep] = useState<
    "transcript" | "context" | "mapping"
  >("transcript");
  const [groups, setGroups] = useState<VoiceSummaryGroup[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serviceWarning, setServiceWarning] = useState<string | null>(null);

  const { state, elapsedMs, start, stop, cancel, error } = useVoiceRecorder();
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttempts = useRef(0);

  useEffect(() => {
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    getVisit(visitId)
      .then((r) => {
        const v = (r.data as { data?: { store_name?: string } })?.data ??
          (r.data as { store_name?: string });
        setStoreName(v?.store_name ?? "");
      })
      .catch(() => {});
  }, [visitId, user, router]);

  // Auto-start mic on entering the page
  useEffect(() => {
    if (step === "record" && state === "idle") {
      start().catch(() => {});
    }
  }, [step, state, start]);

  const cleanupPoll = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => () => cleanupPoll(), [cleanupPoll]);

  const pollSummary = useCallback(async (): Promise<VoiceSummaryResponse | null> => {
    try {
      const r = await getVoiceSummary(visitId);
      return r.data as VoiceSummaryResponse;
    } catch {
      return null;
    }
  }, [visitId]);

  const startPolling = useCallback(() => {
    pollAttempts.current = 0;
    const tick = async () => {
      pollAttempts.current += 1;
      const res = await pollSummary();
      if (res) {
        if (res.step) setProcessStep(res.step);
        if (res.status === "done" && res.groups) {
          setGroups(res.groups);
          setStep("review");
          return;
        }
        if (res.status === "failed") {
          setServiceWarning(
            "AI tidak bisa memproses rekaman. Lanjut isi manual."
          );
          setGroups(FALLBACK_GROUPS);
          setStep("review");
          return;
        }
      }
      if (pollAttempts.current >= 60) {
        // ~ 2 min total; fall back
        setServiceWarning(
          "Layanan AI lambat merespon. Lanjut isi manual."
        );
        setGroups(FALLBACK_GROUPS);
        setStep("review");
        return;
      }
      pollTimer.current = setTimeout(tick, 2000);
    };
    pollTimer.current = setTimeout(tick, 1500);
  }, [pollSummary]);

  async function handleStop() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const blob = await stop();
      if (!blob) {
        setSubmitError("Rekaman kosong. Coba lagi.");
        setSubmitting(false);
        return;
      }
      setStep("process");
      try {
        await uploadVoiceRecording(visitId, blob);
        startPolling();
      } catch {
        setServiceWarning(
          "Layanan suara belum tersedia. Lanjut isi manual."
        );
        setGroups(FALLBACK_GROUPS);
        setStep("review");
      } finally {
        setSubmitting(false);
      }
    } catch {
      setSubmitError("Gagal menghentikan rekaman.");
      setSubmitting(false);
    }
  }

  function handleCancel() {
    cancel();
    router.push(`/app/visit/${visitId}`);
  }

  const reviewItems: ReviewItem[] = (groups.length ? groups : FALLBACK_GROUPS).map(
    (g) => ({
      key: g.key,
      label: GROUP_LABELS[g.key]?.label ?? g.key,
      preview: g.preview,
      status: g.status === "filled" ? "ok" : "miss",
    })
  );

  const allFilled = reviewItems.every((r) => r.status === "ok");

  if (step === "record") {
    return (
      <div className="min-h-screen bg-taco-page flex flex-col">
        <div className="phone-shell flex flex-col min-h-screen">
          <div className="bg-white border-b border-taco-divider px-5 pt-3 pb-3">
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1 text-taco-sub text-[15px] min-h-[52px] -ml-1"
            >
              <ChevronLeft size={18} />
              Kembali
            </button>
            <div className="text-[15px] font-medium text-taco-text mt-0.5">
              {storeName || "Kunjungan"}
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-32 gap-7">
            {state === "error" && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[14px] text-red-700 text-center w-full">
                {error ?? "Tidak bisa mengakses mikrofon."}
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-taco-error taco-blink" />
              <span className="text-[17px] font-semibold text-taco-text">
                {state === "recording" ? "Merekam…" : "Siap merekam"}
              </span>
            </div>
            <div
              className="text-taco-text font-bold tabular-nums"
              style={{ fontSize: 48, lineHeight: 1 }}
            >
              {formatMmSs(elapsedMs)}
            </div>
            <VoiceWaveform active={state === "recording"} />
            <div className="text-[14px] text-taco-muted text-center">
              Ceritakan kunjungan 2–3 menit
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 phone-shell mx-auto bg-white border-t border-taco-divider px-5 pt-3.5 pb-8 z-30">
            <button
              type="button"
              onClick={handleStop}
              disabled={state !== "recording" || submitting}
              className="w-full h-14 rounded-xl bg-taco-accent text-white text-[16px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              {submitting ? "Mengirim…" : "Berhenti & Proses"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="w-full h-11 mt-1.5 text-[15px] text-taco-sub"
            >
              Batalkan
            </button>
            {submitError && (
              <div className="mt-2 text-center text-[13px] text-red-600">
                {submitError}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === "process") {
    const stepOrder: Array<"transcript" | "context" | "mapping"> = [
      "transcript",
      "context",
      "mapping",
    ];
    const stepLabels: Record<typeof stepOrder[number], string> = {
      transcript: "Transkripsi rekaman",
      context: "Memahami konteks kunjungan",
      mapping: "Memetakan data per kelompok",
    };
    const curIdx = stepOrder.indexOf(processStep);
    return (
      <div className="min-h-screen bg-taco-page flex flex-col">
        <div className="phone-shell flex flex-col min-h-screen">
          <div className="bg-white border-b border-taco-divider px-5 pt-3 pb-3">
            <div className="text-[16px] font-semibold text-taco-text">
              {storeName || "Kunjungan"}
            </div>
            <div className="text-[14px] text-taco-sub mt-0.5">
              Sedang memproses rekaman…
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5">
            <div className="w-11 h-11 rounded-full border-[3px] border-taco-border border-t-taco-text taco-spin" />
            <div className="text-[17px] font-semibold text-taco-text text-center">
              Merekap kunjungan dari rekaman suara…
            </div>
            <div className="text-[14px] text-taco-sub text-center">
              Biasanya 10–20 detik
            </div>
            <div className="w-full bg-white border border-taco-border rounded-xl p-5 flex flex-col gap-3.5 mt-2">
              {stepOrder.map((s, i) => {
                const done = i < curIdx;
                const active = i === curIdx;
                return (
                  <div key={s} className="flex items-center gap-2.5">
                    {done ? (
                      <span className="w-4 h-4 rounded-full bg-emerald-50 border-[1.5px] border-taco-success flex-shrink-0 flex items-center justify-center">
                        <svg
                          width="9"
                          height="9"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#1D9E75"
                          strokeWidth="3"
                        >
                          <polyline points="20 6 9 12 4 9" />
                        </svg>
                      </span>
                    ) : active ? (
                      <span className="w-4 h-4 rounded-full border-2 border-taco-border border-t-taco-text taco-spin flex-shrink-0" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border-[1.5px] border-taco-border flex-shrink-0" />
                    )}
                    <span
                      className={
                        active
                          ? "text-[14px] font-medium text-taco-text"
                          : "text-[14px] text-taco-sub"
                      }
                    >
                      {stepLabels[s]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // step === "review"
  const filledCount = reviewItems.filter((r) => r.status === "ok").length;
  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[120px]">
        <div className="bg-white border-b border-taco-divider px-5 pt-3 pb-3.5">
          <button
            type="button"
            onClick={() => {
              setStep("record");
              setGroups([]);
              setServiceWarning(null);
            }}
            className="inline-flex items-center gap-1 text-taco-sub text-[15px] min-h-[44px] -ml-1"
          >
            <ChevronLeft size={18} />
            Rekam ulang
          </button>
          <div className="text-[18px] font-semibold text-taco-text mt-1">
            Hasil AI — Periksa & Edit
          </div>
          <div className="text-[14px] text-taco-sub mt-0.5">
            {filledCount} dari {reviewItems.length} kelompok terisi
          </div>
        </div>

        <div className="flex-1 px-3.5 pt-3.5">
          {serviceWarning && (
            <div className="mb-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-[14px] text-amber-800">
              {serviceWarning}
            </div>
          )}
          <div className="text-[14px] text-taco-sub mb-3 leading-relaxed">
            Ketuk kelompok untuk ubah atau konfirmasi.
          </div>
          <AiReviewList
            items={reviewItems}
            onItemClick={(key) => {
              const route = GROUP_LABELS[key as VoiceSummaryGroup["key"]]?.route;
              if (route) router.push(`/app/visit/${visitId}/${route}`);
            }}
          />
        </div>

        <div className="fixed bottom-0 left-0 right-0 phone-shell mx-auto bg-white border-t border-taco-divider px-5 pt-3.5 pb-8 z-30">
          <button
            type="button"
            onClick={() => router.push(`/app/visit/${visitId}`)}
            disabled={!allFilled}
            className="w-full h-14 rounded-xl bg-taco-accent text-white text-[16px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
            >
              <polyline points="20 6 9 12 4 9" />
            </svg>
            Konfirmasi & Kembali
          </button>
        </div>
      </div>
    </div>
  );
}
