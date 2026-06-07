"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { InvoiceRecord } from "@/lib/api";
import { OcrLineItem, type OcrLine } from "./OcrLineItem";

interface InvoiceCardProps {
  invoice: InvoiceRecord;
}

function fmtTime(t?: string) {
  if (!t) return "—";
  try {
    return new Date(t).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return t;
  }
}

export function InvoiceCard({ invoice }: InvoiceCardProps) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const brandLabel =
    (invoice.brands && invoice.brands.join(" + ")) ||
    invoice.brand ||
    invoice.supplier_name ||
    "Invoice";

  const photos = invoice.photos?.length
    ? invoice.photos
    : invoice.photo_url
    ? [invoice.photo_url]
    : [];

  const status =
    invoice.status === "done" && (invoice.needs_review ?? 0) > 0
      ? "warn"
      : invoice.status === "done"
      ? "ok"
      : invoice.status === "failed"
      ? "err"
      : "pending";

  const statusLabel =
    status === "warn"
      ? "Perlu Review"
      : status === "ok"
      ? "Tersimpan"
      : status === "err"
      ? "Gagal OCR"
      : "Memproses";

  const statusCls =
    status === "warn"
      ? "bg-amber-100 text-amber-700"
      : status === "ok"
      ? "bg-emerald-100 text-emerald-700"
      : status === "err"
      ? "bg-red-100 text-red-700"
      : "bg-gray-100 text-taco-sub";

  const lineCount = invoice.product_count ?? invoice.line_items?.length ?? 0;

  return (
    <div className="bg-white border border-taco-border rounded-[12px] mb-2.5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 min-h-[72px] text-left active:bg-taco-page"
      >
        <div className="w-[60px] h-[60px] rounded-[8px] bg-taco-page border border-taco-border overflow-hidden flex items-center justify-center flex-shrink-0 text-taco-muted">
          {photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photos[0]}
              alt="Foto invoice"
              className="w-full h-full object-cover"
            />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-taco-text truncate">
            {brandLabel}
          </div>
          <div className="text-[12px] text-taco-sub truncate">
            {lineCount} produk
            {invoice.supplier_name ? ` · ${invoice.supplier_name}` : ""} ·{" "}
            {fmtTime(invoice.created_at)}
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 mt-1",
              statusCls
            )}
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                status === "warn"
                  ? "bg-taco-warning"
                  : status === "ok"
                  ? "bg-taco-success"
                  : status === "err"
                  ? "bg-taco-error"
                  : "bg-taco-muted"
              )}
            />
            {statusLabel}
          </span>
        </div>
        <span
          className="text-taco-muted transition-transform flex-shrink-0"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-taco-divider">
          {photos.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1 text-[11px] font-bold tracking-wide uppercase text-taco-muted">
                Foto Invoice
              </div>
              <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
                {photos.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setZoomed(p)}
                    className="w-[88px] h-[88px] rounded-[8px] bg-taco-page border border-taco-border overflow-hidden flex-shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p}
                      alt={`Foto ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="px-4 pt-2 pb-1 text-[11px] font-bold tracking-wide uppercase text-taco-muted">
            Produk Ditemukan
          </div>
          {invoice.line_items && invoice.line_items.length > 0 ? (
            invoice.line_items.map((li) => (
              <OcrLineItem
                key={li.id}
                line={li as OcrLine}
                onChange={() => {
                  /* read-only in expanded card */
                }}
              />
            ))
          ) : (
            <div className="px-4 py-5 text-center text-taco-muted text-[14px]">
              Tidak ada baris produk.
            </div>
          )}
        </div>
      )}

      {zoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomed(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomed}
            alt="Foto invoice"
            className="max-w-full max-h-full rounded-[10px]"
          />
        </div>
      )}
    </div>
  );
}
