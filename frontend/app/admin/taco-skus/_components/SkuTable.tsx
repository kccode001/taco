"use client";

import {
  Badge,
  EmptyRow,
  RowActions,
  TableHeader,
} from "../../_components/CrudShell";
import { PRODUCT_LINES, type ProductLineSlug } from "../../_components/constants";

export interface TacoSkuRow {
  id: string;
  code: string;
  name: string;
  product_line?: ProductLineSlug | string;
  catalog_category?: string;
  unit?: string;
  min_price?: number;
  max_price?: number;
  avg_price?: number;
  standard_price?: number;
  embedded?: boolean;
  embedding_status?: "pending" | "done" | "failed";
}

function lineLabel(slug?: string) {
  return PRODUCT_LINES.find((p) => p.slug === slug)?.label ?? "—";
}

function formatIdr(value?: number) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function SkuTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: TacoSkuRow[];
  onEdit: (row: TacoSkuRow) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <table className="w-full">
      <TableHeader
        cols={["Kode", "Nama Produk", "Kategori", "Lini", "Harga", "Embedding", "Aksi"]}
      />
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={7} label="Tidak ada SKU yang cocok dengan filter." />
        ) : (
          rows.map((s) => {
            const status = s.embedding_status ?? (s.embedded ? "done" : "pending");
            return (
              <tr
                key={s.id}
                className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
              >
                <td className="px-4 py-3 font-mono text-[12px] text-taco-muted whitespace-nowrap">
                  {s.code}
                </td>
                <td className="px-4 py-3 text-[14px] text-taco-text max-w-[280px]">
                  <div className="truncate">{s.name}</div>
                </td>
                <td className="px-4 py-3 text-[13px] text-taco-sub whitespace-nowrap">
                  {s.catalog_category ?? "—"}
                </td>
                <td className="px-4 py-3 text-[13px] text-taco-sub whitespace-nowrap">
                  {lineLabel(s.product_line)}
                </td>
                <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap">
                  {s.min_price != null && s.max_price != null && s.min_price !== s.max_price
                    ? `${formatIdr(s.min_price)} – ${formatIdr(s.max_price)}`
                    : formatIdr(s.avg_price ?? s.standard_price ?? s.min_price)}
                  {s.unit && (
                    <span className="text-taco-muted ml-1">/{s.unit}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={status === "done" ? "ok" : status === "failed" ? "err" : "muted"}>
                    {status === "done"
                      ? "✓ Diindeks"
                      : status === "failed"
                        ? "Gagal"
                        : "Menunggu"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <RowActions
                    onEdit={() => onEdit(s)}
                    onDelete={() => onDelete(s.id)}
                  />
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
