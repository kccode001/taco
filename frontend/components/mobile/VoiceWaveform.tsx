"use client";

import { cn } from "@/lib/utils";

interface VoiceWaveformProps {
  bars?: number;
  className?: string;
  active?: boolean;
}

export function VoiceWaveform({
  bars = 10,
  className,
  active = true,
}: VoiceWaveformProps) {
  const heights = [6, 18, 30, 12, 26, 8, 34, 20, 6, 22, 16, 28];
  return (
    <div
      className={cn(
        "flex items-center gap-1 h-[40px]",
        className
      )}
      aria-hidden="true"
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-1 rounded-sm bg-taco-text inline-block",
            active && "taco-wave"
          )}
          style={{
            height: `${heights[i % heights.length]}px`,
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}
