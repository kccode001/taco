"use client";

import {
  Badge,
  EmptyRow,
  RowActions,
  TableHeader,
} from "../../_components/CrudShell";

export interface CompetitorSkuRow {
  id: string;
  raw_name: string;
  canonical_name?: string;
  competitor_brand?: string;
  mapped_sku_name?: string;
  flagged_for_review?: boolean;
  flag_reason?: string;
  detected_in?: number;
}

export function LibraryTable({
  rows,
  onMap,
  onDelete,
}: {
  rows: CompetitorSkuRow[];
  onMap?: (row: CompetitorSkuRow) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <table className="w-full">
      <TableHeader
        cols={["Nama Raw", "Canonical", "Brand", "Mapped → TACO", "Terdeteksi", "Aksi"]}
      />
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={6} label="Pustaka kompetitor masih kosong." />
        ) : (
          rows.map((s) => (
            <tr
              key={s.id}
              className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
            >
              <td className="px-4 py-3 text-[14px] text-taco-text">
                {s.raw_name}
              </td>
              <td className="px-4 py-3 text-[13px] text-taco-sub">
                {s.canonical_name ?? "—"}
              </td>
              <td className="px-4 py-3">
                {s.competitor_brand ? (
                  <Badge tone="neutral">{s.competitor_brand}</Badge>
                ) : (
                  <span className="text-[13px] text-taco-muted">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-[13px] text-taco-sub">
                {s.mapped_sku_name ?? "—"}
              </td>
              <td className="px-4 py-3 text-[12px] text-taco-muted">
                {s.detected_in ?? 0}× invoice
              </td>
              <td className="px-4 py-3">
                <RowActions
                  onEdit={onMap ? () => onMap(s) : undefined}
                  onDelete={() => onDelete(s.id)}
                />
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
