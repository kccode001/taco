"use client";

import { cn } from "@/lib/utils";

export type StoreHealth = "cek" | "lama" | "oke" | "baru";

interface StoreCardProps {
  name: string;
  health: StoreHealth;
  territory?: string;
  lastVisitDaysAgo?: number;
  onClick?: () => void;
  className?: string;
}

const HEALTH_CFG: Record<
  StoreHealth,
  { dot: string; label: string; badgeBg: string; badgeText: string; badgeLabel: string }
> = {
  cek: {
    dot: "bg-taco-error",
    label: "Cek",
    badgeBg: "bg-amber-50",
    badgeText: "text-taco-warning",
    badgeLabel: "Perlu Update",
  },
  lama: {
    dot: "bg-taco-warning",
    label: "Lama",
    badgeBg: "bg-amber-50",
    badgeText: "text-taco-warning",
    badgeLabel: "Perlu Update",
  },
  oke: {
    dot: "bg-taco-success",
    label: "Oke",
    badgeBg: "bg-emerald-50",
    badgeText: "text-taco-success",
    badgeLabel: "Aktif",
  },
  baru: {
    dot: "bg-taco-muted",
    label: "Baru",
    badgeBg: "bg-taco-page",
    badgeText: "text-taco-muted",
    badgeLabel: "Baru",
  },
};

function formatLastVisit(daysAgo?: number): string {
  if (daysAgo === undefined || daysAgo === null) return "Belum pernah dikunjungi";
  if (daysAgo === 0) return "Hari ini";
  if (daysAgo === 1) return "Kemarin";
  return `Terakhir dikunjungi ${daysAgo} hari lalu`;
}

export function StoreCard({
  name,
  health,
  territory,
  lastVisitDaysAgo,
  onClick,
  className,
}: StoreCardProps) {
  const cfg = HEALTH_CFG[health];
  const isNew = lastVisitDaysAgo === undefined || lastVisitDaysAgo === null;
  const lastVisitText = formatLastVisit(lastVisitDaysAgo);
  const meta = isNew
    ? lastVisitText
    : `${lastVisitText}${territory ? ` · ${territory}` : ""}`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 bg-white border border-taco-border rounded-xl px-4 min-h-[72px] text-left active:bg-taco-page transition-colors",
        className
      )}
    >
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={cn("w-3 h-3 rounded-full", cfg.dot)} />
        <span className="text-[12px] text-taco-muted whitespace-nowrap">
          {cfg.label}
        </span>
      </div>
      <div className="flex-1 min-w-0 py-3.5">
        <div className="text-[17px] font-medium text-taco-text truncate">
          {name}
        </div>
        <div className="text-[14px] text-taco-sub mt-0.5 truncate">{meta}</div>
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span
          className={cn(
            "inline-flex items-center text-[12px] font-medium px-2 py-0.5 rounded-full",
            cfg.badgeBg,
            cfg.badgeText
          )}
        >
          {cfg.badgeLabel}
        </span>
        <span className="text-taco-muted text-[20px] leading-none font-light">
          ›
        </span>
      </div>
    </button>
  );
}
