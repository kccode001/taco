"use client";

import { cn } from "@/lib/utils";

interface DeltaBadgeProps {
  variant?: "updated" | "first";
  daysAgo?: number;
  className?: string;
}

export function DeltaBadge({
  variant = "updated",
  daysAgo,
  className,
}: DeltaBadgeProps) {
  if (variant === "first") {
    return (
      <div
        className={cn(
          "border-l-[3px] border-taco-delta pl-3",
          className
        )}
      >
        <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-taco-delta mb-0.5">
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <circle cx="12" cy="12" r="10" />
          </svg>
          Baru
        </div>
        <div className="text-[13px] text-taco-sub">Kunjungan pertama — belum ada data</div>
      </div>
    );
  }
  return (
    <div className={cn("border-l-[3px] border-taco-delta pl-3", className)}>
      <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-taco-delta mb-0.5">
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
        Diperbarui
      </div>
      <div className="text-[13px] text-taco-sub">
        {typeof daysAgo === "number"
          ? `Data dari ${daysAgo} hari lalu — periksa perubahan`
          : "Data dari kunjungan sebelumnya — periksa perubahan"}
      </div>
    </div>
  );
}

interface DeltaInlineTagProps {
  daysAgo?: number;
  className?: string;
}

export function DeltaInlineTag({ daysAgo, className }: DeltaInlineTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium text-taco-delta",
        className
      )}
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
      {typeof daysAgo === "number" ? `Data ${daysAgo} hari lalu` : "Data sebelumnya"}
    </span>
  );
}
