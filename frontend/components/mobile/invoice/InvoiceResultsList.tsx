"use client";

import { OcrLineItem, type OcrLine } from "./OcrLineItem";

interface InvoiceResultsListProps {
  lines: OcrLine[];
  onChange: (index: number, line: OcrLine) => void;
  mode?: "competitor" | "foto_katalog";
}

export function InvoiceResultsList({
  lines,
  onChange,
  mode = "competitor",
}: InvoiceResultsListProps) {
  if (!lines.length) {
    return (
      <div className="bg-white border border-taco-border rounded-[12px] px-4 py-6 text-center text-taco-muted text-[14px]">
        Tidak ada baris produk yang terbaca.
      </div>
    );
  }

  const brandSet = new Set<string>();
  let needsReview = 0;
  for (const l of lines) {
    if (l.brand) brandSet.add(l.brand);
    if (l.unclear && !l.skipped) needsReview++;
  }

  return (
    <div>
      <div className="text-[16px] font-semibold text-taco-text mb-1">
        {lines.length} produk · {brandSet.size || 0} brand
        {needsReview > 0 ? ` · ${needsReview} perlu review` : ""}
      </div>
      <div className="text-[13px] text-taco-sub mb-1.5">
        {mode === "foto_katalog"
          ? "Tinjau kecocokan SKU TACO per baris"
          : "Tinjau Harga Beli per produk · ketuk brand untuk ganti"}
      </div>
      <div className="flex items-center gap-3 text-[12px] text-taco-muted mb-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-taco-success inline-block" />
          Yakin
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-taco-warning inline-block" />
          Perlu cek
        </span>
      </div>
      <div className="bg-white border border-taco-border rounded-[12px] overflow-hidden">
        {lines.map((line, i) => (
          <OcrLineItem
            key={line.id}
            line={line}
            mode={mode}
            onChange={(next) => onChange(i, next)}
          />
        ))}
      </div>
    </div>
  );
}
