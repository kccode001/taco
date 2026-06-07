"use client";

import { cn } from "@/lib/utils";

export const PROJECT_TYPES = [
  "Perumahan",
  "Apartemen",
  "Komersial",
  "Renovasi",
  "Lainnya",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_SCALES = ["Kecil", "Sedang", "Besar"] as const;
export type ProjectScale = (typeof PROJECT_SCALES)[number];

export interface ProjectData {
  has_project: boolean | null;
  types: ProjectType[];
  scale: ProjectScale | null;
  note: string;
}

export const EMPTY_PROJECT: ProjectData = {
  has_project: null,
  types: [],
  scale: null,
  note: "",
};

interface ProjectInquiryProps {
  value: ProjectData;
  onChange: (v: ProjectData) => void;
}

export function ProjectInquiry({ value, onChange }: ProjectInquiryProps) {
  const toggleType = (t: ProjectType) => {
    onChange({
      ...value,
      types: value.types.includes(t)
        ? value.types.filter((x) => x !== t)
        : [...value.types, t],
    });
  };

  return (
    <div>
      <div className="text-[15px] font-semibold text-taco-text mb-1">
        Ada proyek di area ini?
      </div>
      <div className="text-[13px] text-taco-sub mb-3">
        Proyek konstruksi, renovasi, atau developer yang sedang aktif
      </div>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => onChange({ ...value, has_project: true })}
          className={cn(
            "flex-1 h-[52px] rounded-[10px] border-[1.5px] text-[15px] font-semibold",
            value.has_project === true
              ? "border-taco-text bg-[#FAFAFA] text-taco-text"
              : "border-taco-border bg-white text-taco-sub"
          )}
        >
          Ya, ada
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({ ...EMPTY_PROJECT, has_project: false })
          }
          className={cn(
            "flex-1 h-[52px] rounded-[10px] border-[1.5px] text-[15px] font-semibold",
            value.has_project === false
              ? "border-taco-text bg-[#FAFAFA] text-taco-text"
              : "border-taco-border bg-white text-taco-sub"
          )}
        >
          Tidak ada
        </button>
      </div>
      {value.has_project === true && (
        <div className="border-[1.5px] border-taco-border rounded-[12px] p-3.5 bg-white">
          <div className="mb-3">
            <div className="text-[13px] font-semibold text-taco-sub mb-1.5">
              Tipe proyek
            </div>
            <div className="flex flex-wrap gap-2">
              {PROJECT_TYPES.map((t) => {
                const on = value.types.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={cn(
                      "h-11 px-4 rounded-full text-[14px] font-medium border-[1.5px]",
                      on
                        ? "border-taco-text bg-taco-text text-white"
                        : "border-taco-border bg-white text-taco-text"
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mb-3">
            <div className="text-[13px] font-semibold text-taco-sub mb-1.5">
              Skala
            </div>
            <div className="flex gap-1.5">
              {PROJECT_SCALES.map((s) => {
                const on = value.scale === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      onChange({ ...value, scale: on ? null : s })
                    }
                    className={cn(
                      "flex-1 h-11 px-4 rounded-full text-[14px] font-medium border-[1.5px]",
                      on
                        ? "border-taco-text bg-taco-text text-white"
                        : "border-taco-border bg-white text-taco-text"
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <textarea
            value={value.note}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
            placeholder="Nama proyek, lokasi, PIC, estimasi unit, kebutuhan produk…"
            className="w-full min-h-[72px] border-[1.5px] border-taco-border rounded-[10px] px-3.5 py-3 text-[15px] text-taco-text bg-white outline-none resize-y focus:border-taco-sub"
          />
        </div>
      )}
    </div>
  );
}
