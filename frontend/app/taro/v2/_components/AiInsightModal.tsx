"use client";

import * as Dialog from "@radix-ui/react-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SparkleIcon } from "../../../admin/_components/icons";
import type { AiInsightV2 } from "@/lib/v2/types";

/** Full-screen modal that renders the AI insight as formatted markdown.
 *  Uses Radix Dialog + react-markdown + remark-gfm (tables, bold, lists). */
export function AiInsightModal({
  open,
  onOpenChange,
  insight,
  loading,
  period,
  onRegenerate,
  regenerating,
  title = "AI Insight Permintaan Pasar",
  subtitle,
  regenerateLabel = "Generate Ulang",
  emptyCtaLabel = "Generate Insight",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insight: AiInsightV2 | null;
  loading: boolean;
  period: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
  /** Modal title. Default keeps the legacy dashboard copy. */
  title?: string;
  /** Sub-line under the title. Defaults to `Periode {period}`. */
  subtitle?: string;
  /** Header regenerate-button copy. */
  regenerateLabel?: string;
  /** Empty-state CTA copy (when no saved insight yet). */
  emptyCtaLabel?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-[#D9DEEC] overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[#E8EBFA] flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#4F46E5]/10 text-[#4F46E5]">
                <SparkleIcon size={16} />
              </span>
              <div>
                <Dialog.Title className="text-[15px] font-semibold text-taco-text leading-tight">
                  {title}
                </Dialog.Title>
                <div className="text-[11px] text-taco-muted">
                  {subtitle ?? `Periode ${period}`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  disabled={regenerating || loading}
                  className="h-[32px] px-3 inline-flex items-center gap-1.5 bg-[#F97316] text-white rounded-lg text-[12px] font-semibold hover:bg-[#EA6C0A] transition-colors disabled:opacity-60"
                >
                  <SparkleIcon size={12} />
                  {regenerating ? "Menganalisa…" : regenerateLabel}
                </button>
              )}
              <Dialog.Close className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-taco-muted hover:bg-[#F0F2FB] hover:text-taco-text transition-colors">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </Dialog.Close>
            </div>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
            {loading || regenerating ? (
              <div className="space-y-3 py-2">
                <div className="h-5 bg-[#E6EAF5] rounded w-2/3 animate-pulse" />
                <div className="h-3.5 bg-[#E6EAF5] rounded w-full animate-pulse" />
                <div className="h-3.5 bg-[#E6EAF5] rounded w-5/6 animate-pulse" />
                <div className="h-3.5 bg-[#E6EAF5] rounded w-full animate-pulse" />
                <div className="h-3.5 bg-[#E6EAF5] rounded w-3/4 animate-pulse" />
              </div>
            ) : !insight ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#4F46E5]/10 text-[#4F46E5] mb-3">
                  <SparkleIcon size={22} />
                </span>
                <p className="text-[14px] text-taco-sub mb-4">
                  Belum ada insight tersimpan untuk periode ini.
                </p>
                {onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    disabled={regenerating}
                    className="h-[38px] px-5 inline-flex items-center gap-2 bg-[#F97316] text-white rounded-lg text-[13px] font-semibold hover:bg-[#EA6C0A] transition-colors disabled:opacity-60"
                  >
                    <SparkleIcon size={14} />
                    {regenerating ? "Menganalisa…" : emptyCtaLabel}
                  </button>
                )}
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-[17px] font-semibold text-taco-text mt-5 mb-2 first:mt-0">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-[15px] font-semibold text-taco-text mt-4 mb-2 first:mt-0">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-[14px] font-semibold text-taco-text mt-3 mb-1.5 first:mt-0">{children}</h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-[13px] text-taco-sub leading-relaxed mb-3 last:mb-0">{children}</p>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-taco-text">{children}</strong>
                  ),
                  em: ({ children }) => (
                    <em className="italic text-taco-sub">{children}</em>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-outside ml-5 mb-3 space-y-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-outside ml-5 mb-3 space-y-1">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-[13px] text-taco-sub leading-relaxed">{children}</li>
                  ),
                  hr: () => (
                    <hr className="border-[#E8EBFA] my-4" />
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-[12px] border-collapse border border-[#E8EBFA] rounded-lg overflow-hidden">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-[#F5F7FF]">{children}</thead>
                  ),
                  th: ({ children }) => (
                    <th className="text-left px-3 py-2 font-semibold text-taco-muted border border-[#E8EBFA]">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 text-taco-sub border border-[#E8EBFA]">{children}</td>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-[#4F46E5]/30 pl-4 my-3 text-[13px] text-taco-muted italic">{children}</blockquote>
                  ),
                  code: ({ children }) => (
                    <code className="bg-[#F0F2FB] text-[#4F46E5] text-[11px] px-1.5 py-0.5 rounded font-mono">{children}</code>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} className="text-[#F97316] hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>
                  ),
                }}
              >
                {insight.insight}
              </ReactMarkdown>
            )}
          </div>

          {/* Footer — generated_at stamp */}
          {insight?.generated_at && !loading && !regenerating && (
            <div className="px-6 py-3 border-t border-[#E8EBFA] flex-shrink-0 flex items-center justify-between">
              <span className="text-[11px] text-taco-muted">
                Diperbarui:{" "}
                {new Date(insight.generated_at).toLocaleString("id-ID", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="text-[11px] text-taco-muted font-mono">{insight.model}</span>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
