"use client";

import {
  Badge,
  EmptyRow,
  RowActions,
  TableHeader,
} from "../../_components/CrudShell";
import { STORE_TYPE_TONE, STORE_TYPES, type StoreTypeSlug } from "../../_components/constants";

export interface StoreRow {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  type?: StoreTypeSlug;
  type_label?: string;
  territory_id?: string | null;
  territory_name?: string | null;
  assigned_rep_id?: string | null;
  assigned_rep_name?: string | null;
  active?: boolean;
}

function typeLabel(t?: StoreTypeSlug) {
  return STORE_TYPES.find((x) => x.value === t)?.label ?? "Toko";
}

export function StoresTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: StoreRow[];
  onEdit: (row: StoreRow) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <table className="w-full">
      <TableHeader
        cols={["Kode", "Nama Toko", "Tipe", "Wilayah", "Sales", "Status", "Aksi"]}
      />
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={7} label="Belum ada toko terdaftar." />
        ) : (
          rows.map((s) => {
            const t = (s.type ?? "toko") as StoreTypeSlug;
            return (
              <tr
                key={s.id}
                className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
              >
                <td className="px-4 py-3.5 font-mono text-[12px] text-taco-muted">
                  {s.code}
                </td>
                <td className="px-4 py-3.5">
                  <div className="text-[14px] font-medium text-taco-text">
                    {s.name}
                  </div>
                  {s.address && (
                    <div className="text-[11px] text-taco-muted truncate max-w-[280px]">
                      {s.address}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <Badge tone={STORE_TYPE_TONE[t]}>{typeLabel(t)}</Badge>
                </td>
                <td className="px-4 py-3.5 text-[13px] text-taco-sub">
                  {s.territory_name || "—"}
                </td>
                <td className="px-4 py-3.5">
                  {s.assigned_rep_name ? (
                    <span className="text-[13px] text-taco-sub">
                      {s.assigned_rep_name}
                    </span>
                  ) : (
                    /* AUDIT-009 §06 fix: Perlu Assign warning badge when no rep */
                    <Badge tone="warn">⚠ Perlu Assign</Badge>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <Badge tone={s.active === false ? "muted" : "ok"}>
                    {s.active === false ? "Nonaktif" : "Aktif"}
                  </Badge>
                </td>
                <td className="px-4 py-3.5">
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
