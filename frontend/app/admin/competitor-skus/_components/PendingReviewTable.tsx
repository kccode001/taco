"use client";

import {
  Badge,
  EmptyRow,
  TableHeader,
} from "../../_components/CrudShell";
import type { CompetitorSkuRow } from "./LibraryTable";

export function PendingReviewTable({
  rows,
  onMap,
  onMarkNew,
  onIgnore,
}: {
  rows: CompetitorSkuRow[];
  onMap: (row: CompetitorSkuRow) => void;
  onMarkNew: (row: CompetitorSkuRow) => void;
  onIgnore: (row: CompetitorSkuRow) => void;
}) {
  return (
    <table className="w-full">
      <TableHeader
        cols={["Nama Raw OCR", "Brand Tebakan", "Alasan", "Terdeteksi", "Aksi"]}
      />
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={5} label="Tidak ada SKU yang perlu direview." />
        ) : (
          rows.map((s) => (
            <tr
              key={s.id}
              className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
            >
              <td className="px-4 py-3.5">
                <div className="text-[14px] text-taco-text">{s.raw_name}</div>
                <div className="text-[11px] text-taco-muted mt-0.5">
                  {s.canonical_name
                    ? `Kanonisasi: ${s.canonical_name}`
                    : "Belum dikanonisasi"}
                </div>
              </td>
              <td className="px-4 py-3.5">
                {s.competitor_brand ? (
                  <Badge tone="neutral">{s.competitor_brand}</Badge>
                ) : (
                  <span className="text-[12px] text-taco-muted">
                    Tidak terdeteksi
                  </span>
                )}
              </td>
              <td className="px-4 py-3.5">
                <Badge tone="warn">
                  {s.flag_reason ?? "Tidak ada di pustaka"}
                </Badge>
              </td>
              <td className="px-4 py-3.5 text-[12px] text-taco-muted">
                {s.detected_in ?? 1}× invoice
              </td>
              <td className="px-4 py-3.5">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onMap(s)}
                    className="h-[28px] px-2.5 border border-taco-border rounded-md text-[12px] text-taco-sub hover:text-taco-text hover:border-taco-text"
                  >
                    Petakan
                  </button>
                  {/* AUDIT-009 §06 fix: "Tandai SKU Baru" promotes unknown to catalog */}
                  <button
                    onClick={() => onMarkNew(s)}
                    className="h-[28px] px-2.5 border border-taco-border rounded-md text-[12px] text-taco-text hover:bg-taco-page hover:border-taco-text font-medium"
                  >
                    Tandai SKU Baru
                  </button>
                  <button
                    onClick={() => onIgnore(s)}
                    className="h-[28px] px-2.5 border border-taco-border rounded-md text-[12px] text-taco-sub hover:text-taco-error hover:border-taco-error"
                  >
                    Abaikan
                  </button>
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
