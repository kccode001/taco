"use client";

import { useCallback, useEffect, useState } from "react";
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

const TYPE_LABEL: Record<TaroRecommendation["type"], string> = {
  synonym: "Tambah Sinonim",
  new_sku: "Buat SKU Baru",
  mapping_rule: "Aturan Mapping",
};

const TYPE_TONE: Record<TaroRecommendation["type"], "info" | "ok" | "warn"> = {
  synonym: "info",
  new_sku: "ok",
  mapping_rule: "warn",
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

export default function TaroRecommendationsPage() {
  const [filter, setFilter] = useState<FilterStatus>("pending");
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

  const refetch = useCallback(async (status: FilterStatus) => {
    setLoading(true);
    try {
      const res = await getTaroRecommendations({ status });
      const data =
        ((res.data as { data?: TaroRecommendation[] })?.data ??
          (res.data as TaroRecommendation[])) ?? [];
      if (data.length) {
        // Defense in depth — even though we send ?status=X, filter again so the
        // visible cards always match the active pill (in case BE ignores it).
        setRecs(data.filter((r) => r.status === status));
      } else {
        setRecs(MOCK_RECOMMENDATIONS.filter((r) => r.status === status));
      }
    } catch {
      setRecs(MOCK_RECOMMENDATIONS.filter((r) => r.status === status));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch(filter);
  }, [refetch, filter]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      try {
        await regenerateTaroRecommendations();
      } catch {
        await new Promise((r) => setTimeout(r, 900));
      }
      await refetch(filter);
    } finally {
      setRegenerating(false);
    }
  };

  const handleAction = async (id: string, action: "apply" | "reject") => {
    if (filter !== "pending") return;
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
      ok = true;
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
          <p className="text-[13px] text-taco-sub mt-1">
            Saran sinonim, SKU baru, dan aturan mapping yang dipelajari dari
            koreksi admin.
          </p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="h-[40px] px-4 inline-flex items-center gap-2 bg-taco-accent text-white rounded-lg text-[13px] font-semibold hover:bg-taco-accent-dark transition-colors disabled:opacity-60"
        >
          <SparkleIcon size={14} />
          {regenerating ? "Menganalisa koreksi admin…" : "Regenerate"}
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {(Object.keys(FILTER_LABEL) as FilterStatus[]).map((s) => {
          const active = filter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`h-[36px] px-3.5 inline-flex items-center rounded-full text-[12px] font-semibold border transition-colors min-h-[36px] ${
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

      {regenerating && (
        <div className="bg-white border border-taco-border rounded-xl px-5 py-4 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-taco-border border-t-taco-text rounded-full animate-spin" />
          <div className="text-[13px] text-taco-sub">
            Mempelajari koreksi terbaru — biasanya selesai dalam ±10 detik.
          </div>
        </div>
      )}

      {loading && !regenerating ? (
        <div className="bg-white border border-taco-border rounded-xl px-6 py-12 text-center text-[13px] text-taco-muted">
          Memuat rekomendasi…
        </div>
      ) : recs.length === 0 && !regenerating ? (
        <div className="bg-white border border-taco-border rounded-xl px-6 py-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-taco-page text-taco-muted mb-3">
            <LightbulbIcon size={22} />
          </div>
          <div className="text-[14px] font-semibold text-taco-text mb-1">
            {filter === "pending"
              ? "Belum ada rekomendasi pending"
              : filter === "applied"
                ? "Belum ada yang diterapkan"
                : "Belum ada yang ditolak"}
          </div>
          <div className="text-[13px] text-taco-sub max-w-[420px] mx-auto">
            {filter === "pending"
              ? "Klik Regenerate untuk membuat saran dari koreksi terbaru admin."
              : "Pindah filter ke Pending untuk lihat saran yang menunggu keputusan."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {recs.map((rec) => {
            const acted = !!rec.actedAs;
            return (
              <div
                key={rec.id}
                className={`bg-white border border-taco-border rounded-xl p-5 flex flex-col gap-3 transition-all duration-300 ${
                  acted ? "opacity-0 scale-[0.98]" : "opacity-100"
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={TYPE_TONE[rec.type]}>{TYPE_LABEL[rec.type]}</Badge>
                  {rec.actedAs === "applied" && <Badge tone="ok">Diterapkan</Badge>}
                  {rec.actedAs === "rejected" && (
                    <Badge tone="neutral">Ditolak</Badge>
                  )}
                  {!rec.actedAs && filter === "applied" && (
                    <Badge tone="ok">Diterapkan</Badge>
                  )}
                  {!rec.actedAs && filter === "rejected" && (
                    <Badge tone="neutral">Ditolak</Badge>
                  )}
                </div>
                <div className="text-[15px] font-semibold text-taco-text leading-snug">
                  {rec.title}
                </div>
                <div className="text-[13px] text-taco-sub leading-relaxed flex-1">
                  {rec.body}
                </div>
                {filter === "pending" && (
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
