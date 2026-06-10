"use client";

import { SparkleIcon } from "../../../admin/_components/icons";
import type { AiInsightV2 } from "@/lib/v2/types";

/** Single AI-insight card — renders Mortar's `/dashboard/ai-insight` LLM output
 *  over the selected period. Distinctive (subtle indigo wash + sparkle) but
 *  uses NO orange — that token is reserved for primary CTAs. */
export function AiInsightCard({
  insight,
  loading,
  period,
  onRegenerate,
  regenerating,
}: {
  insight: AiInsightV2 | null;
  loading: boolean;
  period: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#D9DEEC] bg-gradient-to-br from-[#F5F7FF] to-white p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#4F46E5]/10 text-[#4F46E5]">
            <SparkleIcon size={16} />
          </span>
          <div>
            <div className="text-[14px] font-semibold text-taco-text leading-tight">
              AI Insight
            </div>
            <div className="text-[11px] text-taco-muted">
              Periode {period} · ditenagai Claude
            </div>
          </div>
        </div>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={regenerating || loading}
            className="h-[32px] px-3 inline-flex items-center gap-1.5 border border-[#C7CEE6] text-[#4F46E5] rounded-lg text-[12px] font-semibold hover:bg-[#4F46E5]/5 transition-colors disabled:opacity-60"
          >
            <SparkleIcon size={12} />
            {regenerating ? "Menganalisa…" : "Perbarui"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2.5 py-1">
          <div className="h-4 bg-[#E6EAF5] rounded w-3/4 animate-pulse" />
          <div className="h-3 bg-[#E6EAF5] rounded w-full animate-pulse" />
          <div className="h-3 bg-[#E6EAF5] rounded w-5/6 animate-pulse" />
        </div>
      ) : !insight ? (
        <div className="text-[13px] text-taco-muted py-2">
          Belum ada insight untuk periode ini.
        </div>
      ) : (
        <>
          {insight.headline && (
            <h3 className="text-[15px] font-semibold text-taco-text leading-snug mb-2">
              {insight.headline}
            </h3>
          )}
          <p className="text-[13px] text-taco-sub leading-relaxed whitespace-pre-line">
            {insight.insight}
          </p>
          {insight.highlights && insight.highlights.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3.5">
              {insight.highlights.map((h, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2.5 py-1 rounded-full bg-white border border-[#D9DEEC] text-[11px] font-medium text-[#3B3F66]"
                >
                  {h}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
