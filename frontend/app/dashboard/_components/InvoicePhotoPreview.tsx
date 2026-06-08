"use client";

import { useState } from "react";

interface InvoicePhotoPreviewProps {
  photos?: string[];
}

function PhotoIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function InvoicePhotoPreview({ photos }: InvoicePhotoPreviewProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const list = photos ?? [];

  return (
    <div data-testid="invoice-photos">
      <div className="flex gap-2 items-center">
        {list.length === 0 ? (
          <div className="text-[12px] text-taco-muted">— Tidak ada foto</div>
        ) : (
          list.map((url, idx) => (
            <button
              key={url + idx}
              type="button"
              onClick={() => setOpenIndex(idx)}
              data-testid={`invoice-photo-thumb-${idx}`}
              className="w-16 h-16 rounded-lg bg-taco-page border border-taco-border flex items-center justify-center text-taco-muted hover:text-taco-text overflow-hidden"
              title="Tap untuk lihat foto penuh"
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={`Invoice ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <PhotoIcon />
              )}
            </button>
          ))
        )}
        {list.length > 0 && (
          <div className="text-[13px] text-taco-muted">Tap untuk lihat foto penuh</div>
        )}
      </div>

      {openIndex !== null && list[openIndex] && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-8"
          onClick={() => setOpenIndex(null)}
          data-testid="invoice-photo-lightbox"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={list[openIndex]}
            alt={`Invoice ${openIndex + 1}`}
            className="max-w-full max-h-full rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
