"use client";

import { Badge, EmptyRow, RowActions, TableHeader } from "../../_components/CrudShell";

export interface StaffRow {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  territory_id?: string;
  territory_name?: string;
  assigned_store_ids?: string[];
  assigned_store_names?: string[];
  active?: boolean;
}

export function SalesStaffTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: StaffRow[];
  onEdit: (row: StaffRow) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <table className="w-full">
      <TableHeader
        cols={["Nama", "Telepon", "Wilayah", "Toko Ditugaskan", "Status", "Aksi"]}
      />
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={6} label="Belum ada rep terdaftar." />
        ) : (
          rows.map((s) => {
            const stores = s.assigned_store_names ?? [];
            return (
              <tr
                key={s.id}
                className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
              >
                <td className="px-4 py-3.5">
                  <div className="text-[14px] font-medium text-taco-text">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-taco-muted">ID: {s.id.slice(0, 8)}</div>
                </td>
                <td className="px-4 py-3.5 text-[13px] text-taco-sub">
                  {s.phone || "—"}
                </td>
                <td className="px-4 py-3.5 text-[13px] text-taco-sub">
                  {s.territory_name || "—"}
                </td>
                <td className="px-4 py-3.5">
                  {stores.length === 0 ? (
                    <span className="text-[12px] text-taco-muted italic">
                      Belum ditugaskan
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {stores.slice(0, 3).map((n) => (
                        <span
                          key={n}
                          className="text-[11px] text-taco-sub bg-taco-page border border-taco-border px-2 py-0.5 rounded-full"
                        >
                          {n}
                        </span>
                      ))}
                      {stores.length > 3 && (
                        <span className="text-[11px] text-taco-muted px-2 py-0.5">
                          +{stores.length - 3} lagi
                        </span>
                      )}
                    </div>
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
