"use client";

import { cn } from "@/lib/utils";

interface MicButtonProps {
  onClick?: () => void;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
  ariaLabel?: string;
}

const sizeMap = {
  sm: { box: "h-[44px] px-3", icon: 14, text: "text-[12px]" },
  md: { box: "h-[52px] px-4", icon: 16, text: "text-[13px]" },
  lg: { box: "h-[56px] px-5", icon: 20, text: "text-[15px]" },
};

export function MicButton({
  onClick,
  active = false,
  size = "md",
  label = "Rekam Suara",
  className,
  ariaLabel,
}: MicButtonProps) {
  const cfg = sizeMap[size];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full border-[1.5px] font-medium font-sans",
        cfg.box,
        cfg.text,
        active
          ? "border-taco-error bg-red-50 text-taco-error"
          : "border-taco-border bg-taco-page text-taco-sub hover:border-taco-text/40",
        className
      )}
    >
      <svg
        width={cfg.icon}
        height={cfg.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
      <span className="leading-none">{label}</span>
    </button>
  );
}
