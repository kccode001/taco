"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyTaroRecommendation,
  getTaroRecommendations,
  regenerateTaroRecommendations,
  rejectTaroRecommendation,
  type TaroRecommendation,
} from "@/lib/api";
import { Badge } from "../../_components/CrudShell";
import { LightbulbIcon, SparkleIcon } from "../../_components/icons";
import { MOCK_RECOMMENDATIONS } from "../_components/mockData";

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

export default function TaroRecommendationsPage() {
  const [recs, setRecs] = useState<TaroRecommendation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await getTaroRecommendations({ status: "pending" });
      const data =
        ((res.data as { data?: TaroRecommendation[] })?.data ??
          (res.data as TaroRecommendation[])) ?? [];
      setRecs(data.length ? data : MOCK_RECOMMENDATIONS);
    } catch {
      setRecs(MOCK_RECOMMENDATIONS);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      try {
        await regenerateTaroRecommendations();
      } catch {
        // BE not ready — simulate a short delay so users see the loading state.
        await new Promise((r) => setTimeout(r, 900));
      }
      await refetch();
    } finally {
      setRegenerating(false);
    }
  };

  const handleAction = async (id: string, action: "apply" | "reject") => {
    setBusyId(id);
    try {
      try {
        if (action === "apply") await applyTaroRecommendation(id);
        else await rejectTaroRecommendation(id);
      } catch {
        // ignore — proceed with optimistic update
      }
      setRecs((r) => r.filter((rec) => rec.id !== id));
    } finally {
      setBusyId(null);
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
          className="h-[36px] px-4 inline-flex items-center gap-2 bg-taco-accent text-white rounded-lg text-[13px] font-semibold hover:bg-taco-accent-dark transition-colors disabled:opacity-60"
        >
          <SparkleIcon size={14} />
          {regenerating ? "Menganalisa koreksi admin…" : "Regenerate"}
        </button>
      </div>

      {regenerating && (
        <div className="bg-white border border-taco-border rounded-xl px-5 py-4 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-taco-border border-t-taco-text rounded-full animate-spin" />
          <div className="text-[13px] text-taco-sub">
            Mempelajari koreksi terbaru — biasanya selesai dalam ±10 detik.
          </div>
        </div>
      )}

      {recs.length === 0 && !regenerating ? (
        <div className="bg-white border border-taco-border rounded-xl px-6 py-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-taco-page text-taco-muted mb-3">
            <LightbulbIcon size={22} />
          </div>
          <div className="text-[14px] font-semibold text-taco-text mb-1">
            Belum ada rekomendasi
          </div>
          <div className="text-[13px] text-taco-sub max-w-[420px] mx-auto">
            Klik Regenerate untuk membuat saran dari koreksi terbaru admin.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {recs.map((rec) => (
            <div
              key={rec.id}
              className="bg-white border border-taco-border rounded-xl p-5 flex flex-col gap-3"
            >
              <Badge tone={TYPE_TONE[rec.type]}>{TYPE_LABEL[rec.type]}</Badge>
              <div className="text-[15px] font-semibold text-taco-text leading-snug">
                {rec.title}
              </div>
              <div className="text-[13px] text-taco-sub leading-relaxed flex-1">
                {rec.body}
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-taco-divider">
                <button
                  onClick={() => handleAction(rec.id, "apply")}
                  disabled={busyId === rec.id}
                  className="flex-1 h-[36px] border border-taco-text rounded-lg text-[13px] font-semibold text-taco-text hover:bg-taco-text hover:text-white transition-colors disabled:opacity-60"
                >
                  Terapkan
                </button>
                <button
                  onClick={() => handleAction(rec.id, "reject")}
                  disabled={busyId === rec.id}
                  className="flex-1 h-[36px] border border-taco-border rounded-lg text-[13px] font-medium text-taco-sub hover:text-taco-error hover:border-taco-error transition-colors disabled:opacity-60"
                >
                  Tolak
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
