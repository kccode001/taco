"use client";

import { SparkleIcon } from "../../../admin/_components/icons";
import type { AiInsightV2 } from "@/lib/v2/types";

/** Compact dashboard entry point for the AI insight.
 *  Shows latest-generated date + "Lihat Insight" button when insight exists.
 *  Empty state shows a Generate CTA. Clicking "Lihat Insight" opens the modal. */
export function AiInsightCard({
  insight,
  loading,
  period,
  onRegenerate,
  regenerating,
  onViewInsight,
}: {
  insight: AiInsightV2 | null;
  loading: boolean;
  period: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
  onViewInsight?: () => void;
}) {
  const formattedDate = insight?.generated_at
    ? new Date(insight.generated_at).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#D9DEEC] bg-gradient-to-br from-[#F5F7FF] to-white p-5">
      <div className="flex items-center justify-between gap-4">
        {/* Left: icon + label + date */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#4F46E5]/10 text-[#4F46E5] flex-shrink-0">
            <SparkleIcon size={17} />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-taco-text leading-tight">
              AI Insight · Permintaan Pasar
            </div>
            <div className="text-[11px] text-taco-muted">
              Periode {period}
            </div>
            {loading ? (
              <div className="mt-1 h-3 bg-[#E6EAF5] rounded w-40 animate-pulse" />
            ) : formattedDate ? (
              <div className="text-[11px] text-taco-muted mt-0.5">
                Diperbarui: {formattedDate}
              </div>
            ) : (
              <div className="text-[11px] text-taco-muted mt-0.5">
                Belum ada insight untuk periode ini
              </div>
            )}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!loading && insight && onViewInsight && (
            <button
              onClick={onViewInsight}
              className="h-[32px] px-3.5 inline-flex items-center gap-1.5 bg-[#F97316] text-white rounded-lg text-[12px] font-semibold hover:bg-[#EA6C0A] transition-colors"
            >
              Lihat Insight
            </button>
          )}
          {!loading && !insight && onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={regenerating}
              className="h-[32px] px-3.5 inline-flex items-center gap-1.5 bg-[#F97316] text-white rounded-lg text-[12px] font-semibold hover:bg-[#EA6C0A] transition-colors disabled:opacity-60"
            >
              <SparkleIcon size={12} />
              {regenerating ? "Menganalisa…" : "Generate Insight"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
