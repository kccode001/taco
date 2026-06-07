"use client";

import { cn } from "@/lib/utils";

interface DeltaFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  priorValue?: string;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  suffix?: React.ReactNode;
}

export function DeltaField({
  label,
  value,
  onChange,
  priorValue,
  placeholder,
  type = "text",
  multiline,
  suffix,
}: DeltaFieldProps) {
  const isDelta = priorValue !== undefined && value !== priorValue;

  return (
    <div
      className={cn(
        "rounded-lg border border-taco-border bg-white p-3",
        isDelta && "border-l-[3px] border-l-taco-delta"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <label className="text-sm font-medium text-taco-sub">{label}</label>
        {isDelta && (
          <span className="text-[11px] font-semibold bg-green-50 text-taco-delta px-1.5 py-0.5 rounded">
            Diperbarui
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="flex-1 text-base text-taco-text bg-transparent outline-none resize-none placeholder:text-taco-muted"
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 h-[52px] text-base text-taco-text bg-transparent outline-none placeholder:text-taco-muted"
          />
        )}
        {suffix}
      </div>
    </div>
  );
}
