"use client";

import { useRef } from "react";

interface InvoiceCameraViewProps {
  onCapture: (file: File) => void;
  onCancel: () => void;
  hint?: string;
}

export function InvoiceCameraView({
  onCapture,
  onCancel,
  hint = "Arahkan ke seluruh invoice",
}: InvoiceCameraViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-40 bg-[#1A1A1A] flex flex-col">
      <div className="phone-shell flex-1 flex flex-col">
        <div className="px-5 pt-3 pb-1 text-white flex justify-between text-[12px] font-semibold">
          <span>Kamera</span>
          <span>●●●●</span>
        </div>
        <div className="px-5 pt-3 pb-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 h-11 text-white text-[15px]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Batal
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <div className="w-full aspect-[4/3] bg-[#2A2A2A] rounded-lg relative overflow-hidden">
            <div className="absolute top-3 left-3 w-7 h-7 border-t-[3px] border-l-[3px] border-white rounded-sm" />
            <div className="absolute top-3 right-3 w-7 h-7 border-t-[3px] border-r-[3px] border-white rounded-sm" />
            <div className="absolute bottom-3 left-3 w-7 h-7 border-b-[3px] border-l-[3px] border-white rounded-sm" />
            <div className="absolute bottom-3 right-3 w-7 h-7 border-b-[3px] border-r-[3px] border-white rounded-sm" />
            <div className="absolute inset-0 flex items-center justify-center opacity-20 text-white">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          </div>
          <div className="text-[#CCCCCC] text-[15px]">{hint}</div>
        </div>

        <div className="bg-white py-5 pb-9 flex items-center justify-center">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Ambil foto"
            className="w-[72px] h-[72px] rounded-full bg-taco-accent border-4 border-white flex items-center justify-center shadow-[0_0_0_2px_var(--primary)]"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onCapture(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}
