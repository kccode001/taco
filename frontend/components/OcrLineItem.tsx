"use client";

import { useState } from "react";
import { AlertTriangle, Copy, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { InvoiceLineItem, TacoSku } from "@/lib/types";

interface OcrLineItemProps {
  item: InvoiceLineItem;
  onUpdate: (updates: Partial<InvoiceLineItem>) => void;
  tacoSkus?: TacoSku[];
  rowIndex: number;
  prevPrice?: number;
}

export function OcrLineItemRow({ item, onUpdate, tacoSkus = [], rowIndex, prevPrice }: OcrLineItemProps) {
  const [expanded, setExpanded] = useState(item.is_unclear || item.is_unknown);
  const [note, setNote] = useState(item.rep_note || "");

  const confidence = item.confidence_score ?? 0;
  const confClass =
    confidence >= 0.9
      ? "text-taco-success bg-emerald-50"
      : confidence >= 0.6
      ? "text-taco-warning bg-amber-50"
      : "text-taco-error bg-red-50";

  return (
    <div
      className={cn(
        "border border-taco-border rounded-lg overflow-hidden",
        item.is_unclear && "border-l-[3px] border-l-taco-warning"
      )}
    >
      <div
        className="flex items-center gap-3 px-3 py-3 bg-white cursor-pointer min-h-[52px]"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-taco-text truncate">
            {item.raw_text}
          </div>
          {item.mapped_sku_name && (
            <div className="text-[13px] text-taco-sub truncate">{item.mapped_sku_name}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.qty && <span className="text-[13px] text-taco-sub">×{item.qty}</span>}
          {item.unit_price && (
            <div className="flex items-center gap-1">
              <span className="text-[14px] font-medium text-taco-text">
                {new Intl.NumberFormat("id-ID").format(item.unit_price)}
              </span>
              {prevPrice !== undefined && rowIndex > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate({ unit_price: prevPrice });
                  }}
                  className="p-1 text-taco-muted hover:text-taco-text"
                  title="Salin dari baris atas"
                >
                  <Copy size={12} />
                </button>
              )}
            </div>
          )}
          {item.confidence_score !== undefined && (
            <span className={cn("text-[11px] px-1.5 py-0.5 rounded font-medium", confClass)}>
              {Math.round(confidence * 100)}%
            </span>
          )}
          {item.is_unclear && <AlertTriangle size={16} className="text-taco-warning" />}
          <ChevronDown
            size={16}
            className={cn("text-taco-muted transition-transform", expanded && "rotate-180")}
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-taco-divider bg-taco-page p-3 space-y-2">
          {item.is_unclear && (
            <div className="text-[13px] text-taco-warning font-medium flex items-center gap-1.5">
              <AlertTriangle size={14} />
              Teks tidak jelas — perlu info tambahan
            </div>
          )}
          {item.is_unknown && (
            <div>
              <label className="text-[13px] text-taco-sub mb-1 block">Cocokkan ke SKU TACO</label>
              <select
                className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[14px] bg-white text-taco-text"
                value={item.mapped_taco_sku_id || ""}
                onChange={(e) => onUpdate({ mapped_taco_sku_id: e.target.value, is_unknown: false })}
              >
                <option value="">— Tidak cocok / tidak dikenal</option>
                {tacoSkus.map((sku) => (
                  <option key={sku.id} value={sku.id}>
                    {sku.name} ({sku.code})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-[13px] text-taco-sub mb-1 block">Catatan</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => onUpdate({ rep_note: note })}
              placeholder="Tambahkan catatan…"
              className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[14px] bg-white text-taco-text placeholder:text-taco-muted"
            />
          </div>
        </div>
      )}
    </div>
  );
}
