"use client";

import { cn } from "@/lib/utils";

export type GroupStatus = "filled" | "partial" | "empty" | "burn";

interface GroupCardProps {
  name: string;
  sub: string;
  status: GroupStatus;
  burnCount?: number;
  onClick?: () => void;
  className?: string;
}

const STATUS_CFG: Record<
  GroupStatus,
  { label: (count?: number) => string; bg: string; text: string; showCheck: boolean }
> = {
  filled: {
    label: () => "Terisi",
    bg: "bg-emerald-50",
    text: "text-taco-success",
    showCheck: true,
  },
  partial: {
    label: () => "Sebagian",
    bg: "bg-indigo-50",
    text: "text-taco-info",
    showCheck: false,
  },
  empty: {
    label: () => "Perlu diisi",
    bg: "bg-amber-50",
    text: "text-taco-warning",
    showCheck: false,
  },
  burn: {
    label: (count) => `${count ?? 0} wajib`,
    bg: "bg-red-50",
    text: "text-red-600",
    showCheck: false,
  },
};

export function GroupCard({
  name,
  sub,
  status,
  burnCount,
  onClick,
  className,
}: GroupCardProps) {
  const cfg = STATUS_CFG[status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 bg-white border border-taco-border rounded-2xl px-4 py-4 min-h-[72px] text-left active:bg-zinc-50 transition-colors mb-2.5",
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[17px] font-semibold text-taco-text">{name}</div>
        <div className="text-[13px] text-taco-sub mt-0.5 truncate">{sub}</div>
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0",
          cfg.bg,
          cfg.text
        )}
      >
        {cfg.showCheck && (
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
        )}
        {cfg.label(burnCount)}
      </span>
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
}
