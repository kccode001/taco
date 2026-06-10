"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getRecommendationsV2,
  applyRecommendationV2,
  acknowledgeRecommendationV2,
  unwrapList,
} from "@/lib/v2/api";
import type { RecommendationV2 } from "@/lib/v2/types";
import { Badge } from "../../../admin/_components/CrudShell";
import { Modal } from "../../../admin/_components/Modal";
import { LightbulbIcon } from "../../../admin/_components/icons";
import { V2PageHeader } from "../_components/V2Tabs";
import { MOCK_RECOMMENDATIONS } from "../_components/mockData";
import { useToast } from "../_components/useToast";

const TYPE_LABEL: Record<string, string> = {
  add_synonym: "Tambah Sinonim",
  synonym: "Tambah Sinonim",
  create_sku: "Buat SKU Baru",
  new_sku: "Buat SKU Baru",
  mapping_rule: "Aturan Mapping",
  update_sku_knowledge: "Update Product Knowledge",
  investigate_competitor: "Investigasi Kompetitor",
};
const TYPE_TONE: Record<string, "info" | "ok" | "warn" | "err"> = {
  add_synonym: "info",
  synonym: "info",
  create_sku: "ok",
  new_sku: "ok",
  mapping_rule: "warn",
  update_sku_knowledge: "ok",
  investigate_competitor: "err",
};
const typeLabel = (t: string) => TYPE_LABEL[t] ?? t.replace(/_/g, " ");
const typeTone = (t: string) => TYPE_TONE[t] ?? "info";

type FilterStatus = "pending" | "applied" | "acknowledged";
const FILTER_LABEL: Record<FilterStatus, string> = {
  pending: "Pending",
  applied: "Diterapkan",
  acknowledged: "Diakui",
};

interface ActedRec extends RecommendationV2 {
  actedAs?: "applied" | "acknowledged";
}

export default function RecommendationsV2Page() {
  const [status, setStatus] = useState<FilterStatus>("pending");
  const [recs, setRecs] = useState<ActedRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRec, setConfirmRec] = useState<RecommendationV2 | null>(null);
  const { show, node: toastNode } = useToast();

  const refetch = useCallback(async (s: FilterStatus) => {
    setLoading(true);
    try {
      const res = await getRecommendationsV2({ status: s });
      const data = unwrapList<RecommendationV2>(res.data);
      setRecs(data);
      setUsingMock(false);
    } catch {
      setRecs(MOCK_RECOMMENDATIONS.filter((r) => (r.status ?? "pending") === s));
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch(status);
  }, [refetch, status]);

  const fadeOut = (id: string, as: "applied" | "acknowledged") => {
    setRecs((r) => r.map((rc) => (rc.id === id ? { ...rc, actedAs: as } : rc)));
    window.setTimeout(() => {
      setRecs((r) => r.filter((rc) => rc.id !== id));
      setBusyId((b) => (b === id ? null : b));
    }, 320);
  };

  const handleApply = async (rec: RecommendationV2) => {
    setBusyId(rec.id);
    try {
      await applyRecommendationV2(rec.id);
      fadeOut(rec.id, "applied");
      show("Rekomendasi diterapkan");
    } catch (e: unknown) {
      const beMsg = (e as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      if (usingMock) {
        fadeOut(rec.id, "applied");
        show("Diterapkan (mode demo)");
      } else {
        setBusyId(null);
        show(beMsg ?? "Gagal menerapkan — coba lagi.", "err");
      }
    }
    setConfirmRec(null);
  };

  const handleAcknowledge = async (rec: RecommendationV2) => {
    setBusyId(rec.id);
    try {
      await acknowledgeRecommendationV2(rec.id);
      fadeOut(rec.id, "acknowledged");
      show("Rekomendasi diakui");
    } catch {
      if (usingMock) {
        fadeOut(rec.id, "acknowledged");
        show("Diakui (mode demo)");
      } else {
        setBusyId(null);
        show("Gagal — coba lagi.", "err");
      }
    }
  };

  return (
    <>
      <V2PageHeader
        title="Rekomendasi"
        description="Saran berbasis alasan dari koreksi admin & sinyal OCR. Tindakan otomatis hanya muncul bila sistem benar-benar bisa menjalankannya."
      />

      {/* Status filter */}
      <div className="flex items-center gap-1.5 mb-5">
        <span className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider mr-1">
          Status
        </span>
        {(Object.keys(FILTER_LABEL) as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`h-[32px] px-3 inline-flex items-center rounded-full text-[12px] font-semibold border transition-colors ${
              status === s
                ? "bg-taco-text text-white border-taco-text"
                : "bg-white text-taco-sub border-taco-border hover:border-taco-text hover:text-taco-text"
            }`}
          >
            {FILTER_LABEL[s]}
          </button>
        ))}
        {usingMock && (
          <span className="ml-2">
            <Badge tone="warn">Data demo — BE belum siap</Badge>
          </span>
        )}
      </div>

      {loading ? (
        <div className="bg-white border border-taco-border rounded-xl px-6 py-12 text-center text-[13px] text-taco-muted">
          Memuat rekomendasi…
        </div>
      ) : recs.length === 0 ? (
        <div className="bg-white border border-taco-border rounded-xl px-6 py-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-taco-page text-taco-muted mb-3">
            <LightbulbIcon size={22} />
          </div>
          <div className="text-[14px] font-semibold text-taco-text mb-1">
            {status === "pending"
              ? "Belum ada rekomendasi pending"
              : status === "applied"
                ? "Belum ada yang diterapkan"
                : "Belum ada yang diakui"}
          </div>
          <div className="text-[13px] text-taco-sub max-w-[420px] mx-auto">
            Rekomendasi muncul otomatis dari koreksi admin & alasan mismatch yang tercatat.
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
                  <Badge tone={typeTone(rec.type)}>{typeLabel(rec.type)}</Badge>
                  {rec.auto_actionable ? (
                    <Badge tone="ok">Bisa diterapkan otomatis</Badge>
                  ) : (
                    <Badge tone="neutral">Perlu tindakan manual</Badge>
                  )}
                </div>

                <div className="text-[15px] font-semibold text-taco-text leading-snug">
                  {rec.title}
                </div>
                <div className="text-[13px] text-taco-sub leading-relaxed flex-1">
                  {rec.body}
                </div>

                {rec.reason && (
                  <div className="bg-taco-page border border-taco-divider rounded-md px-3 py-2 text-[12px]">
                    <span className="text-taco-muted">Alasan: </span>
                    <span className="text-taco-text italic">{rec.reason}</span>
                  </div>
                )}

                {status === "pending" && (
                  <div className="flex items-center gap-2 pt-2 border-t border-taco-divider">
                    {rec.auto_actionable ? (
                      <button
                        onClick={() => setConfirmRec(rec)}
                        disabled={busyId === rec.id}
                        className="flex-1 h-[40px] bg-taco-accent text-white rounded-lg text-[13px] font-semibold hover:bg-taco-accent-dark transition-colors disabled:opacity-60"
                      >
                        Terapkan
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAcknowledge(rec)}
                        disabled={busyId === rec.id}
                        className="flex-1 h-[40px] border border-taco-border rounded-lg text-[13px] font-medium text-taco-sub hover:text-taco-text hover:border-taco-text transition-colors disabled:opacity-60"
                      >
                        {busyId === rec.id ? "Memproses…" : "Tandai Sudah Dilihat"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmRec && (
        <Modal
          title="Terapkan Rekomendasi?"
          onClose={() => (busyId ? null : setConfirmRec(null))}
          onSave={() => handleApply(confirmRec)}
          saveLabel="Terapkan"
          busy={busyId === confirmRec.id}
        >
          <div className="text-[14px] text-taco-text leading-relaxed">
            {confirmRec.title}
          </div>
          <div className="text-[13px] text-taco-sub leading-relaxed">
            {confirmRec.body}
          </div>
        </Modal>
      )}

      {toastNode}
    </>
  );
}
