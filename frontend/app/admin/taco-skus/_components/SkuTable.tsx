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
  /** BE canonical key (entity column `avg_price`). */
  avg_price?: number;
  /** Catalog spelling (FE alias). Kept for mock/back-compat. */
  average_price?: number;
  standard_price?: number;
  embedded?: boolean;
  embedding_status?: "pending" | "done" | "failed";
  /** BE canonical: `product_name_aliases` (text[]). */
  product_name_aliases?: string[] | string;
  /** FE alias / mock seed key. Maps onto `product_name_aliases` for the BE. */
  synonyms?: string[] | string;
  /** BE canonical: `unit_aliases` (text[]). */
  unit_aliases?: string[] | string;
  /** FE alias / mock seed key. Maps onto `unit_aliases` for the BE. */
  unit_synonyms?: string[] | string;
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

function normalizeList(v?: string[] | string): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return v.split(/[,\n]/g).map((s) => s.trim()).filter(Boolean);
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
        cols={[
          "Kode",
          "Nama Produk",
          "Kategori",
          "Sinonim",
          "Harga",
          "Embedding",
          "Aksi",
        ]}
      />
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={7} label="Tidak ada SKU yang cocok dengan filter." />
        ) : (
          rows.map((s) => {
            const status = s.embedding_status ?? (s.embedded ? "done" : "pending");
            // Prefer BE canonical (`product_name_aliases`, `unit_aliases`,
            // `avg_price`); fall back to FE aliases used by mocks.
            const synonyms = normalizeList(s.product_name_aliases ?? s.synonyms);
            const unitSyns = normalizeList(s.unit_aliases ?? s.unit_synonyms);
            const avg = s.avg_price ?? s.average_price ?? s.standard_price;
            return (
              <tr
                key={s.id}
                className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
              >
                <td className="px-4 py-3 font-mono text-[12px] text-taco-muted whitespace-nowrap align-top">
                  {s.code}
                </td>
                <td className="px-4 py-3 text-[14px] text-taco-text max-w-[260px] align-top">
                  <div className="truncate">{s.name}</div>
                  <div className="text-[11px] text-taco-muted mt-0.5">
                    {lineLabel(s.product_line)}
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px] text-taco-sub whitespace-nowrap align-top">
                  {s.catalog_category ?? "—"}
                </td>
                <td className="px-4 py-3 align-top max-w-[220px]">
                  {synonyms.length === 0 && unitSyns.length === 0 ? (
                    <span className="text-[12px] text-taco-muted">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {synonyms.slice(0, 4).map((syn) => (
                        <span
                          key={`s-${syn}`}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-taco-page border border-taco-border text-taco-sub"
                        >
                          {syn}
                        </span>
                      ))}
                      {synonyms.length > 4 && (
                        <span className="text-[11px] text-taco-muted px-1">
                          +{synonyms.length - 4}
                        </span>
                      )}
                      {unitSyns.slice(0, 2).map((u) => (
                        <span
                          key={`u-${u}`}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-[#EBF3FD] text-taco-info"
                          title="Sinonim UOM"
                        >
                          {u}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap align-top">
                  {s.min_price != null && s.max_price != null && s.min_price !== s.max_price ? (
                    <div>
                      <div>
                        {formatIdr(s.min_price)} – {formatIdr(s.max_price)}
                      </div>
                      {avg != null && (
                        <div className="text-[11px] text-taco-muted">
                          avg {formatIdr(avg)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {formatIdr(avg ?? s.min_price)}
                    </div>
                  )}
                  {s.unit && (
                    <div className="text-[11px] text-taco-muted">/{s.unit}</div>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <Badge tone={status === "done" ? "ok" : status === "failed" ? "err" : "muted"}>
                    {status === "done"
                      ? "Diindeks"
                      : status === "failed"
                        ? "Gagal"
                        : "Menunggu"}
                  </Badge>
                </td>
                <td className="px-4 py-3 align-top">
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
