"use client";

import { cn } from "@/lib/utils";

export type SentimenLevel =
  | "sangat_positif"
  | "positif"
  | "netral"
  | "kurang_puas"
  | "negatif";

const LEVELS: { key: SentimenLevel; label: string; dot: string }[] = [
  { key: "sangat_positif", label: "Sangat Positif", dot: "#1D9E75" },
  { key: "positif", label: "Positif", dot: "#1D9E75" },
  { key: "netral", label: "Netral", dot: "#ADADAD" },
  { key: "kurang_puas", label: "Kurang Puas", dot: "#E07B00" },
  { key: "negatif", label: "Negatif / Kecewa", dot: "#D0342C" },
];

interface SentimenPickerProps {
  value: SentimenLevel | null;
  onChange: (v: SentimenLevel | null) => void;
  notes: string;
  onNotesChange: (s: string) => void;
}

export function SentimenPicker({
  value,
  onChange,
  notes,
  onNotesChange,
}: SentimenPickerProps) {
  return (
    <div>
      <div className="text-[15px] font-semibold text-taco-text mb-2.5">
        Sentimen pemilik terhadap TACO
      </div>
      <div className="flex flex-col gap-2 mb-3">
        {LEVELS.map((l) => {
          const on = value === l.key;
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => onChange(on ? null : l.key)}
              className={cn(
                "flex items-center min-h-[52px] px-4 rounded-[10px] border-[1.5px] text-[15px] font-medium text-left gap-2.5",
                on
                  ? "border-taco-text bg-[#FAFAFA] text-taco-text"
                  : "border-taco-border bg-white text-taco-text"
              )}
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ background: l.dot }}
              />
              {l.label}
            </button>
          );
        })}
      </div>
      <textarea
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Catatan — alasan sentimen, keluhan spesifik, dsb…"
        className="w-full min-h-[64px] border-[1.5px] border-taco-border rounded-[10px] px-3.5 py-3 text-[15px] text-taco-text bg-white outline-none resize-y focus:border-taco-sub"
      />
    </div>
  );
}
