"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export type PosmKondisi = "baik" | "rusak_ringan" | "perlu_ganti" | "tidak_ada";

export interface PosmEntry {
  id: string;
  nama: string;
  kondisi: PosmKondisi | null;
  photo_url: string | null;
}

const KONDISI: { key: PosmKondisi; label: string; cls: string }[] = [
  {
    key: "baik",
    label: "Baik",
    cls: "border-emerald-600 bg-emerald-50 text-emerald-700",
  },
  {
    key: "rusak_ringan",
    label: "Rusak Ringan",
    cls: "border-amber-600 bg-amber-50 text-amber-700",
  },
  {
    key: "perlu_ganti",
    label: "Perlu Ganti",
    cls: "border-red-600 bg-red-50 text-red-700",
  },
  {
    key: "tidak_ada",
    label: "Tidak Ada",
    cls: "border-taco-text bg-taco-text text-white",
  },
];

interface PosmRowProps {
  entry: PosmEntry;
  onChange: (entry: PosmEntry) => void;
  onRemove: () => void;
  onUploadPhoto: (file: File) => Promise<string | null>;
}

export function PosmRow({
  entry,
  onChange,
  onRemove,
  onUploadPhoto,
}: PosmRowProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await onUploadPhoto(file);
    if (url) onChange({ ...entry, photo_url: url });
    e.target.value = "";
  };

  return (
    <div className="border-b border-taco-divider py-3 last:border-b-0">
      <div className="flex items-start gap-2 mb-2">
        <input
          type="text"
          value={entry.nama}
          onChange={(e) => onChange({ ...entry, nama: e.target.value })}
          placeholder="Nama aset POSM (mis. Spanduk, Banner, Display…)"
          className="flex-1 h-[44px] border-[1.5px] border-taco-border rounded-[8px] px-3 text-[14px] text-taco-text bg-white outline-none focus:border-taco-sub"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Hapus aset"
          className="w-11 h-11 flex items-center justify-center rounded-[8px] border-[1.5px] border-taco-border text-taco-sub hover:border-taco-error hover:text-taco-error"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            "inline-flex items-center gap-1.5 h-10 px-3 rounded-[8px] border-[1.5px] text-[13px] font-medium",
            entry.photo_url
              ? "border-taco-success bg-emerald-50 text-taco-success"
              : "border-taco-border bg-white text-taco-sub"
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {entry.photo_url ? "Foto ✓" : "Foto"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />
        {KONDISI.map((k) => {
          const on = entry.kondisi === k.key;
          return (
            <button
              key={k.key}
              type="button"
              onClick={() =>
                onChange({
                  ...entry,
                  kondisi: on ? null : k.key,
                })
              }
              className={cn(
                "h-8 px-2.5 rounded-full text-[12px] font-medium border-[1.5px]",
                on ? k.cls : "border-taco-border bg-white text-taco-sub"
              )}
            >
              {k.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
