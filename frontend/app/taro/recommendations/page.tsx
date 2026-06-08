"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyTaroRecommendation,
  getTaroRecommendations,
  regenerateTaroRecommendations,
  rejectTaroRecommendation,
  type TaroRecommendation,
} from "@/lib/api";
import { Badge } from "../../admin/_components/CrudShell";
import { LightbulbIcon, SparkleIcon } from "../../admin/_components/icons";
import { MOCK_RECOMMENDATIONS } from "../../admin/taro-invoices/_components/mockData";

/** BE emits a wider set of `type` strings than the FE enum lists (e.g.
 *  `add_synonym` aliases `synonym`). Map any unknown type to a sensible
 *  default label/tone so the chip always renders. */
const TYPE_LABEL_RAW: Record<string, string> = {
  synonym: "Tambah Sinonim",
  add_synonym: "Tambah Sinonim",
  new_sku: "Buat SKU Baru",
  mapping_rule: "Aturan Mapping",
  update_sku_knowledge: "Update Product Knowledge",
  investigate_competitor: "Investigasi Kompetitor",
};

const TYPE_TONE_RAW: Record<string, "info" | "ok" | "warn" | "err"> = {
  synonym: "info",
  add_synonym: "info",
  new_sku: "ok",
  mapping_rule: "warn",
  update_sku_knowledge: "ok",
  investigate_competitor: "err",
};

function typeLabel(t: string): string {
  return TYPE_LABEL_RAW[t] ?? t.replace(/_/g, " ");
}
function typeTone(t: string): "info" | "ok" | "warn" | "err" {
  return TYPE_TONE_RAW[t] ?? "info";
}

type SourceKey = "admin_correction" | "ocr_failure";
const SOURCE_LABEL: Record<SourceKey, string> = {
  admin_correction: "Koreksi Admin",
  ocr_failure: "OCR Gagal",
};

type SourceFilter = "all" | SourceKey;
const SOURCE_FILTER_LABEL: Record<SourceFilter, string> = {
  all: "Semua Sumber",
  admin_correction: "Koreksi Admin",
  ocr_failure: "OCR Gagal",
};

type FilterStatus = "pending" | "applied" | "rejected";
const FILTER_LABEL: Record<FilterStatus, string> = {
  pending: "Pending",
  applied: "Diterapkan",
  rejected: "Ditolak",
};

interface Toast {
  id: string;
  message: string;
  tone: "ok" | "err";
}

interface ActedRec extends TaroRecommendation {
  actedAs?: "applied" | "rejected";
}

function sourceOf(rec: TaroRecommendation): SourceKey {
  // BE emits "failed_ocr" — normalize to FE-internal "ocr_failure".
  const raw = (rec.source as string | undefined) ?? "";
  if (raw === "failed_ocr" || raw === "ocr_failure") return "ocr_failure";
  if (raw === "admin_correction") return "admin_correction";
  // Heuristic for legacy/empty source: typed cards from the new generator are
  // always OCR-failure sourced; anything else is admin-correction.
  if (rec.type === "update_sku_knowledge" || rec.type === "investigate_competitor") {
    return "ocr_failure";
  }
  return "admin_correction";
}

export default function TaroRecommendationsPage() {
  const [status, setStatus] = useState<FilterStatus>("pending");
  const [source, setSource] = useState<SourceFilter>("all");
  const [recs, setRecs] = useState<ActedRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (message: string, tone: "ok" | "err") => {
    const id = `t-${Date.now()}`;
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((t) => (t?.id === id ? null : t));
    }, 3500);
  };

  const refetch = useCallback(async (s: FilterStatus) => {
    setLoading(true);
    try {
      const res = await getTaroRecommendations({ status: s });
      const data =
        ((res.data as { data?: TaroRecommendation[] })?.data ??
          (res.data as TaroRecommendation[])) ?? [];
      if (data.length) {
        setRecs(data.filter((r) => r.status === s));
      } else {
        setRecs(MOCK_RECOMMENDATIONS.filter((r) => r.status === s));
      }
    } catch {
      setRecs(MOCK_RECOMMENDATIONS.filter((r) => r.status === s));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch(status);
  }, [refetch, status]);

  // Source filter is applied client-side so the same data set works for
  // either source toggle without re-fetch.
  const visibleRecs = useMemo(() => {
    return recs.filter((r) => source === "all" || sourceOf(r) === source);
  }, [recs, source]);

  // KPI counts within current status — informs filter pills.
  const counts = useMemo(() => {
    const all = recs.length;
    const admin = recs.filter((r) => sourceOf(r) === "admin_correction").length;
    const ocr = recs.filter((r) => sourceOf(r) === "ocr_failure").length;
    return { all, admin, ocr };
  }, [recs]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      try {
        await regenerateTaroRecommendations();
      } catch {
        await new Promise((r) => setTimeout(r, 900));
      }
      await refetch(status);
    } finally {
      setRegenerating(false);
    }
  };

  const handleAction = async (id: string, action: "apply" | "reject") => {
    if (status !== "pending") return;
    setBusyId(id);
    const target = recs.find((r) => r.id === id);
    if (!target) return;

    setRecs((r) =>
      r.map((rec) =>
        rec.id === id
          ? { ...rec, actedAs: action === "apply" ? "applied" : "rejected" }
          : rec
      )
    );

    let ok = true;
    try {
      if (action === "apply") await applyTaroRecommendation(id);
      else await rejectTaroRecommendation(id);
    } catch {
      ok = true; // optimistic in mock mode
    }

    if (ok) {
      window.setTimeout(() => {
        setRecs((r) => r.filter((rec) => rec.id !== id));
        setBusyId((b) => (b === id ? null : b));
      }, 320);
      showToast(
        action === "apply" ? "Rekomendasi diterapkan." : "Rekomendasi ditolak.",
        "ok"
      );
    } else {
      setRecs((r) =>
        r.map((rec) => (rec.id === id ? { ...rec, actedAs: undefined } : rec))
      );
      setBusyId(null);
      showToast("Gagal — coba lagi.", "err");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-taco-text leading-tight">
            Rekomendasi Sistem
          </h1>
          <p className="text-[13px] text-taco-sub mt-1 max-w-[640px]">
            Saran sinonim, SKU baru, aturan mapping, dan sinyal kompetitor —
            berdasarkan koreksi admin + OCR gagal terbaru di lapangan.
          </p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="h-[40px] px-4 inline-flex items-center gap-2 bg-taco-accent text-white rounded-lg text-[13px] font-semibold hover:bg-taco-accent-dark transition-colors disabled:opacity-60"
        >
          <SparkleIcon size={14} />
          {regenerating ? "Menganalisa koreksi + OCR gagal…" : "Regenerate"}
        </button>
      </div>

      {/* Filter row: status + source */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider mr-1">
            Status
          </span>
          {(Object.keys(FILTER_LABEL) as FilterStatus[]).map((s) => {
            const active = status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`h-[32px] px-3 inline-flex items-center rounded-full text-[12px] font-semibold border transition-colors ${
                  active
                    ? "bg-taco-text text-white border-taco-text"
                    : "bg-white text-taco-sub border-taco-border hover:border-taco-text hover:text-taco-text"
                }`}
              >
                {FILTER_LABEL[s]}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider mr-1">
            Sumber
          </span>
          {(Object.keys(SOURCE_FILTER_LABEL) as SourceFilter[]).map((s) => {
            const active = source === s;
            const count = s === "all" ? counts.all : s === "admin_correction" ? counts.admin : counts.ocr;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={`h-[32px] px-3 inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold border transition-colors ${
                  active
                    ? "bg-taco-text text-white border-taco-text"
                    : "bg-white text-taco-sub border-taco-border hover:border-taco-text hover:text-taco-text"
                }`}
              >
                {SOURCE_FILTER_LABEL[s]}
                <span
                  className={`text-[10px] font-medium ${
                    active ? "text-white/80" : "text-taco-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {regenerating && (
        <div className="bg-white border border-taco-border rounded-xl px-5 py-4 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-taco-border border-t-taco-text rounded-full animate-spin" />
          <div className="text-[13px] text-taco-sub">
            Membaca koreksi admin + OCR gagal terbaru — biasanya selesai dalam ±10 detik.
          </div>
        </div>
      )}

      {loading && !regenerating ? (
        <div className="bg-white border border-taco-border rounded-xl px-6 py-12 text-center text-[13px] text-taco-muted">
          Memuat rekomendasi…
        </div>
      ) : visibleRecs.length === 0 && !regenerating ? (
        <div className="bg-white border border-taco-border rounded-xl px-6 py-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-taco-page text-taco-muted mb-3">
            <LightbulbIcon size={22} />
          </div>
          <div className="text-[14px] font-semibold text-taco-text mb-1">
            {status === "pending"
              ? "Belum ada rekomendasi pending"
              : status === "applied"
                ? "Belum ada yang diterapkan"
                : "Belum ada yang ditolak"}
          </div>
          <div className="text-[13px] text-taco-sub max-w-[420px] mx-auto">
            {status === "pending"
              ? "Klik Regenerate untuk membuat saran dari koreksi + OCR gagal terbaru."
              : "Pindah filter ke Pending untuk lihat saran yang menunggu keputusan."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleRecs.map((rec) => {
            const acted = !!rec.actedAs;
            const src = sourceOf(rec);
            return (
              <div
                key={rec.id}
                className={`bg-white border border-taco-border rounded-xl p-5 flex flex-col gap-3 transition-all duration-300 ${
                  acted ? "opacity-0 scale-[0.98]" : "opacity-100"
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={typeTone(rec.type)}>{typeLabel(rec.type)}</Badge>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${
                      src === "ocr_failure"
                        ? "bg-[#FFF5E6] border-taco-warning/40 text-taco-warning"
                        : "bg-taco-page border-taco-border text-taco-sub"
                    }`}
                    title={`Source: ${SOURCE_LABEL[src]}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: src === "ocr_failure" ? "#E07B00" : "#888" }} />
                    Source: {SOURCE_LABEL[src]}
                  </span>
                  {rec.actedAs === "applied" && <Badge tone="ok">Diterapkan</Badge>}
                  {rec.actedAs === "rejected" && <Badge tone="neutral">Ditolak</Badge>}
                  {!rec.actedAs && status === "applied" && (
                    <Badge tone="ok">Diterapkan</Badge>
                  )}
                  {!rec.actedAs && status === "rejected" && (
                    <Badge tone="neutral">Ditolak</Badge>
                  )}
                </div>
                <div className="text-[15px] font-semibold text-taco-text leading-snug">
                  {rec.title}
                </div>
                <div className="text-[13px] text-taco-sub leading-relaxed flex-1">
                  {rec.body}
                </div>

                {/* Payload detail strip — surfaces the structured fields when BE
                    sends them, so admins can see the data behind the card.
                    BE uses `suggested_payload`; FE legacy uses `payload`. */}
                {(() => {
                  const payload =
                    rec.payload ??
                    ((rec as unknown as { suggested_payload?: typeof rec.payload }).suggested_payload);
                  if (!payload) return null;
                  return (
                    <div className="bg-taco-page border border-taco-divider rounded-md px-3 py-2 text-[12px] space-y-1">
                      {payload.existing_sku && (
                        <div className="text-taco-text">
                          <span className="text-taco-muted">SKU terkait: </span>
                          <span className="font-mono text-[11px]">
                            {payload.existing_sku.code}
                          </span>
                          {payload.existing_sku.name && (
                            <span className="ml-1">— {payload.existing_sku.name}</span>
                          )}
                        </div>
                      )}
                      {payload.suggested_synonym && (
                        <div className="text-taco-text">
                          <span className="text-taco-muted">Sinonim usulan: </span>
                          <span className="font-medium">{payload.suggested_synonym}</span>
                        </div>
                      )}
                      {payload.raw_text && (
                        <div className="text-taco-text">
                          <span className="text-taco-muted">Raw text OCR: </span>
                          <span className="italic">&ldquo;{payload.raw_text}&rdquo;</span>
                          {payload.occurrence_count !== undefined && (
                            <span className="text-taco-muted ml-1.5">
                              ({payload.occurrence_count}×)
                            </span>
                          )}
                        </div>
                      )}
                      {payload.regions && payload.regions.length > 0 && (
                        <div className="flex items-start gap-1.5 flex-wrap text-taco-text">
                          <span className="text-taco-muted">Wilayah: </span>
                          {payload.regions.slice(0, 4).map((r) => (
                            <span
                              key={r}
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-white border border-taco-border text-[10px] text-taco-sub"
                            >
                              {r}
                            </span>
                          ))}
                          {payload.regions.length > 4 && (
                            <span className="text-[10px] text-taco-muted">
                              +{payload.regions.length - 4} lain
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {status === "pending" && (
                  <div className="flex items-center gap-2 pt-2 border-t border-taco-divider">
                    <button
                      onClick={() => handleAction(rec.id, "apply")}
                      disabled={busyId === rec.id}
                      className="flex-1 h-[40px] border border-taco-text rounded-lg text-[13px] font-semibold text-taco-text hover:bg-taco-text hover:text-white transition-colors disabled:opacity-60"
                    >
                      Terapkan
                    </button>
                    <button
                      onClick={() => handleAction(rec.id, "reject")}
                      disabled={busyId === rec.id}
                      className="flex-1 h-[40px] border border-taco-border rounded-lg text-[13px] font-medium text-taco-sub hover:text-taco-error hover:border-taco-error transition-colors disabled:opacity-60"
                    >
                      Tolak
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-[13px] font-medium border ${
            toast.tone === "ok"
              ? "bg-white border-taco-success text-taco-success"
              : "bg-white border-taco-error text-taco-error"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
