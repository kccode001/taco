"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  COMPETITOR_BRANDS,
  type CompetitorBrand,
} from "../competitor/CompetitorBrandPicker";

export interface OcrLine {
  id: string;
  product_name: string;
  brand?: string;
  qty?: number | string;
  uom?: string;
  harga_beli?: number;
  confidence?: number;
  taco_sku_id?: string;
  taco_sku_name?: string;
  taco_sku_code?: string;
  candidates?: { id: string; name: string }[];
  unclear?: boolean;
  raw_text?: string;
  notes?: string;
  skipped?: boolean;
}

function fmtIdr(n?: number) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("id-ID");
}

interface OcrLineItemProps {
  line: OcrLine;
  onChange: (line: OcrLine) => void;
  mode?: "competitor" | "foto_katalog";
}

export function OcrLineItem({
  line,
  onChange,
  mode = "competitor",
}: OcrLineItemProps) {
  const [brandOpen, setBrandOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const confColor =
    (line.confidence ?? 0) >= 0.8
      ? "bg-taco-success"
      : (line.confidence ?? 0) >= 0.5
      ? "bg-taco-warning"
      : "bg-taco-error";

  const detail = `${line.qty ?? "—"}${line.uom ? " " + line.uom : ""} · Harga Beli Rp ${fmtIdr(
    line.harga_beli
  )}${line.uom ? "/" + line.uom : ""}`;

  if (line.unclear || line.skipped) {
    return (
      <div
        className={cn(
          "border-l-[3px] px-4 py-3 border-b border-taco-divider last:border-b-0",
          line.skipped ? "border-l-taco-muted bg-gray-50" : "border-l-taco-warning"
        )}
      >
        {!line.skipped && (
          <div className="flex items-center gap-1.5 mb-1.5 text-[13px] font-semibold text-taco-warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Teks tidak jelas
          </div>
        )}
        <div className="text-[15px] font-medium text-taco-text mb-0.5">
          {line.product_name || "—"}
        </div>
        {line.raw_text && (
          <div className="text-[12px] text-taco-muted mb-2">
            Teks asli: &ldquo;{line.raw_text}&rdquo;
          </div>
        )}
        {mode === "competitor" && (
          <BrandChip
            brand={line.brand}
            onPick={(b) => onChange({ ...line, brand: b })}
            open={brandOpen}
            setOpen={setBrandOpen}
          />
        )}
        {line.notes && (
          <div className="text-[13px] text-taco-text bg-white rounded-md px-2.5 py-1.5 mt-2 border border-taco-border">
            Catatan: {line.notes}
          </div>
        )}
        {!line.skipped && (
          <div className="flex gap-3 mt-2.5">
            <button
              type="button"
              onClick={() => setNoteOpen((v) => !v)}
              className="text-[13px] text-taco-warning underline font-medium h-11 px-1"
            >
              Tambah Catatan
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...line, skipped: true })}
              className="text-[13px] text-taco-sub underline h-11 px-1"
            >
              Lewati
            </button>
          </div>
        )}
        {line.skipped && (
          <button
            type="button"
            onClick={() => onChange({ ...line, skipped: false })}
            className="text-[13px] text-taco-info underline h-11 px-1 mt-1"
          >
            Batal lewati
          </button>
        )}
        {noteOpen && (
          <textarea
            autoFocus
            value={line.notes ?? ""}
            onChange={(e) => onChange({ ...line, notes: e.target.value })}
            placeholder="Catat hal yang tidak terbaca…"
            className="w-full mt-2 min-h-[60px] border-[1.5px] border-taco-border rounded-[8px] px-2.5 py-2 text-[14px] text-taco-text bg-white outline-none focus:border-taco-sub resize-none"
          />
        )}
        {mode === "foto_katalog" && line.candidates && line.candidates.length > 0 && (
          <div className="mt-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-taco-muted mb-1">
              Cocokkan ke SKU TACO
            </div>
            <SkuCandidatePicker
              line={line}
              onPick={(c) =>
                onChange({
                  ...line,
                  taco_sku_id: c.id,
                  taco_sku_name: c.name,
                })
              }
              open={pickerOpen}
              setOpen={setPickerOpen}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-taco-divider last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-semibold text-taco-text">
          {line.product_name}
        </div>
        <div className="text-[14px] text-taco-sub mt-0.5">{detail}</div>
        {mode === "competitor" && (
          <div className="mt-1.5">
            <BrandChip
              brand={line.brand}
              onPick={(b) => onChange({ ...line, brand: b })}
              open={brandOpen}
              setOpen={setBrandOpen}
            />
          </div>
        )}
        {mode === "foto_katalog" && (
          <div className="mt-1.5">
            {line.taco_sku_id ? (
              <div className="text-[12px] text-taco-success font-semibold">
                Cocok: {line.taco_sku_name ?? "SKU TACO"}{" "}
                {line.taco_sku_code ? `· ${line.taco_sku_code}` : ""}
              </div>
            ) : line.candidates && line.candidates.length > 0 ? (
              <SkuCandidatePicker
                line={line}
                onPick={(c) =>
                  onChange({
                    ...line,
                    taco_sku_id: c.id,
                    taco_sku_name: c.name,
                  })
                }
                open={pickerOpen}
                setOpen={setPickerOpen}
              />
            ) : (
              <span className="text-[12px] text-taco-warning font-medium">
                ⚠ SKU TACO tidak ditemukan
              </span>
            )}
          </div>
        )}
      </div>
      <span
        className={cn("w-2 h-2 rounded-full mt-2 flex-shrink-0", confColor)}
        aria-label={`Confidence ${Math.round((line.confidence ?? 0) * 100)}%`}
      />
    </div>
  );
}

function BrandChip({
  brand,
  onPick,
  open,
  setOpen,
}: {
  brand?: string;
  onPick: (b: CompetitorBrand) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-taco-page text-taco-text border border-taco-border text-[11px] font-semibold"
      >
        Brand: {brand || "Pilih"}{" "}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6 9 18 9 12 16" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 left-0 mt-1 w-56 bg-white border border-taco-border rounded-[10px] shadow-lg p-2 grid grid-cols-2 gap-1">
          {COMPETITOR_BRANDS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => {
                onPick(b);
                setOpen(false);
              }}
              className={cn(
                "h-9 rounded-[6px] text-[12px] font-medium",
                brand === b
                  ? "bg-taco-text text-white"
                  : "bg-taco-page text-taco-text"
              )}
            >
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SkuCandidatePicker({
  line,
  onPick,
  open,
  setOpen,
}: {
  line: OcrLine;
  onPick: (c: { id: string; name: string }) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  if (!line.candidates) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300 text-[11px] font-semibold"
      >
        Pilih kecocokan ({line.candidates.length})
      </button>
      {open && (
        <div className="absolute z-10 left-0 mt-1 w-72 bg-white border border-taco-border rounded-[10px] shadow-lg p-1.5">
          {line.candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className="w-full text-left h-11 px-2.5 rounded-[6px] text-[13px] text-taco-text hover:bg-taco-page"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
