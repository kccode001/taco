"use client";

import { cn } from "@/lib/utils";

interface BurningQuestionBannerProps {
  count: number;
  onClick?: () => void;
  className?: string;
}

export function BurningQuestionBanner({
  count,
  onClick,
  className,
}: BurningQuestionBannerProps) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left cursor-pointer rounded-xl border border-red-200 bg-[#FFF5F5] px-4 py-3.5 mb-3",
        className
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: "#D32F2F" }}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex-shrink-0 mt-0.5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#D32F2F"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-[#B91C1C] mb-0.5">
            {count} Pertanyaan Harus Dijawab
          </div>
          <div className="text-[14px] text-[#7F1D1D] leading-snug">
            Dari manajemen · Wajib sebelum submit
          </div>
          <div className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#D32F2F] mt-2">
            Jawab Sekarang
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </div>
      </div>
    </button>
  );
}
