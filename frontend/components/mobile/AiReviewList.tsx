"use client";

import { cn } from "@/lib/utils";

export type ReviewStatus = "ok" | "miss";

export interface ReviewItem {
  key: string;
  label: string;
  preview: string;
  status: ReviewStatus;
}

interface AiReviewListProps {
  items: ReviewItem[];
  onItemClick?: (key: string) => void;
  className?: string;
}

export function AiReviewList({
  items,
  onItemClick,
  className,
}: AiReviewListProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {items.map((it) => {
        const isOk = it.status === "ok";
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onItemClick?.(it.key)}
            className={cn(
              "w-full flex items-center gap-3 bg-white border border-taco-border rounded-xl px-4 py-3.5 min-h-[64px] text-left active:bg-zinc-50",
              isOk ? "border-l-[3px] border-l-taco-success" : "border-l-[3px] border-l-taco-warning"
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-semibold text-taco-text">
                {it.label}
              </div>
              <div
                className={cn(
                  "text-[13px] mt-0.5 truncate",
                  isOk ? "text-taco-sub" : "text-taco-muted"
                )}
              >
                {it.preview}
              </div>
            </div>
            {/* Pencil = edit affordance (NOT keyboard). Only on filled rows. */}
            {isOk && (
              <span
                className="text-taco-muted flex-shrink-0"
                aria-label="Ubah"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </span>
            )}
            {isOk ? (
              <span
                className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-taco-success whitespace-nowrap"
                aria-label="Terisi"
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <polyline points="20 6 9 12 4 9" />
                </svg>
                Terisi
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full bg-amber-50 text-taco-warning whitespace-nowrap"
                aria-label="Perlu review"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                </svg>
                Review
              </span>
            )}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-taco-muted flex-shrink-0"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
