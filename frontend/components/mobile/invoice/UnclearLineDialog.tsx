"use client";

import { useState } from "react";
import type { OcrLine } from "./OcrLineItem";

interface UnclearLineDialogProps {
  line: OcrLine;
  onSave: (notes: string) => void;
  onCancel: () => void;
}

export function UnclearLineDialog({
  line,
  onSave,
  onCancel,
}: UnclearLineDialogProps) {
  const [notes, setNotes] = useState(line.notes ?? "");
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end justify-center">
      <div className="phone-shell bg-white rounded-t-[20px] p-5 pb-8">
        <div className="text-[16px] font-semibold text-taco-text mb-1.5">
          Tambah catatan
        </div>
        <div className="text-[13px] text-taco-sub mb-3">
          Baris ini tidak terbaca jelas. Catat info manual yang bisa membantu.
        </div>
        <div className="text-[12px] text-taco-muted mb-1.5">
          Teks asli: &ldquo;{line.raw_text ?? line.product_name}&rdquo;
        </div>
        <textarea
          autoFocus
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Tulis hal yang bisa kamu pastikan…"
          className="w-full min-h-[110px] border-[1.5px] border-taco-border rounded-[10px] px-3 py-2.5 text-[14px] text-taco-text bg-white outline-none focus:border-taco-sub resize-none"
        />
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-12 rounded-[10px] border-[1.5px] border-taco-border text-taco-text text-[15px] font-semibold"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onSave(notes)}
            className="flex-1 h-12 rounded-[10px] bg-taco-text text-white text-[15px] font-semibold"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
