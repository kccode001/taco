"use client";

export interface ObjectiveOption {
  id: string;
  label: string;
}

interface VisitObjectivePickerProps {
  options: ObjectiveOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  loading?: boolean;
}

export function VisitObjectivePicker({
  options,
  value,
  onChange,
  loading,
}: VisitObjectivePickerProps) {
  return (
    <div>
      <label className="block text-[14px] font-medium text-taco-sub mb-2">
        Tujuan kunjungan
      </label>
      <div className="relative">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={loading}
          className="w-full h-[52px] border-[1.5px] border-taco-border rounded-[10px] px-3.5 pr-10 text-[16px] text-taco-text bg-white outline-none appearance-none focus:border-taco-sub"
        >
          <option value="">
            {loading ? "Memuat…" : "Pilih tujuan…"}
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-taco-muted"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}
