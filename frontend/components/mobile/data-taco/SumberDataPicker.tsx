"use client";

import { cn } from "@/lib/utils";

export type SumberKey = "owner_pic" | "self_estimation" | "tidak_tahu" | "lainnya";

const OPTIONS: { key: SumberKey; title: string; sub?: string }[] = [
  { key: "owner_pic", title: "Owner / PIC", sub: "Toko memberitahu langsung" },
  {
    key: "self_estimation",
    title: "Self estimation",
    sub: "Saya estimasi dari pengamatan",
  },
  { key: "tidak_tahu", title: "Tidak tahu" },
  { key: "lainnya", title: "Lainnya" },
];

interface SumberDataPickerProps {
  value: SumberKey | null;
  onChange: (v: SumberKey | null) => void;
  lainnyaText: string;
  onLainnyaTextChange: (s: string) => void;
}

export function SumberDataPicker({
  value,
  onChange,
  lainnyaText,
  onLainnyaTextChange,
}: SumberDataPickerProps) {
  return (
    <div>
      <div className="text-[16px] font-semibold text-taco-text mb-1">
        Sumber informasi di atas
      </div>
      <div className="text-[14px] text-taco-sub mb-3.5">
        Dari mana data harga dan SKU ini?
      </div>
      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const on = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              className={cn(
                "w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[52px] border-[1.5px] rounded-[12px] text-left",
                on
                  ? "border-taco-text bg-[#FAFAFA]"
                  : "border-taco-border bg-white"
              )}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                  on
                    ? "border-taco-text bg-taco-text"
                    : "border-taco-border bg-white"
                )}
              >
                {on && (
                  <span className="w-2 h-2 rounded-full bg-white" />
                )}
              </span>
              <span>
                <span className="block text-[15px] font-medium text-taco-text leading-tight">
                  {o.title}
                </span>
                {o.sub && (
                  <span className="block text-[13px] text-taco-sub mt-0.5">
                    {o.sub}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {value === "lainnya" && (
        <div className="mt-2.5">
          <textarea
            value={lainnyaText}
            onChange={(e) => onLainnyaTextChange(e.target.value)}
            placeholder="Jelaskan sumber informasi…"
            className="w-full min-h-[64px] border-[1.5px] border-taco-border rounded-[10px] px-3.5 py-3 text-[15px] text-taco-text bg-white outline-none resize-y focus:border-taco-sub"
          />
        </div>
      )}
    </div>
  );
}
