"use client";

import { cn } from "@/lib/utils";
import { SearchIcon } from "./icons";

/** Page shell for an admin CRUD section.
 *  Strict rule: exactly ONE orange element on this page = the "+ Tambah" button.
 *  Inner sidebar active state is dark — outer DashboardLayout's active /admin nav
 *  shows orange. */
export function CrudShell({
  title,
  description,
  addLabel,
  onAdd,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  extraActions,
  children,
}: {
  title: string;
  description?: string;
  addLabel: string;
  onAdd: () => void;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  extraActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-taco-text leading-tight">
            {title}
          </h1>
          {description && (
            <p className="text-[13px] text-taco-sub mt-1">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {onSearchChange && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted">
                <SearchIcon size={14} />
              </span>
              <input
                type="text"
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder ?? "Cari…"}
                className="h-[36px] pl-9 pr-3 border border-taco-border rounded-lg text-[13px] text-taco-text bg-white outline-none w-[220px] focus:border-taco-text"
              />
            </div>
          )}
          {extraActions}
          <button
            onClick={onAdd}
            className="h-[36px] px-4 bg-taco-accent text-white rounded-lg text-[13px] font-semibold hover:bg-taco-accent-dark transition-colors"
          >
            {addLabel}
          </button>
        </div>
      </div>
      <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export function TableHeader({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="bg-taco-page border-b border-taco-border">
        {cols.map((c) => (
          <th
            key={c}
            className="text-left px-4 py-2.5 text-[11px] font-semibold text-taco-muted uppercase tracking-wider"
          >
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-[13px] text-taco-muted">
        {label}
      </td>
    </tr>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "ok" | "warn" | "err" | "info" | "neutral" | "muted";
  children: React.ReactNode;
}) {
  const map: Record<string, string> = {
    ok: "bg-[#E6F7F2] text-taco-success",
    warn: "bg-[#FFF5E6] text-taco-warning",
    err: "bg-[#FEE2E2] text-taco-error",
    info: "bg-[#EBF3FD] text-taco-info",
    neutral: "bg-taco-page border border-taco-border text-taco-sub",
    muted: "bg-taco-page text-taco-muted border border-taco-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap",
        map[tone]
      )}
    >
      {children}
    </span>
  );
}

export function RowActions({
  onEdit,
  onDelete,
  extra,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex gap-1.5">
      {extra}
      {onEdit && (
        <button
          onClick={onEdit}
          className="h-[28px] px-2.5 border border-taco-border rounded-md text-[12px] text-taco-sub hover:text-taco-text hover:border-taco-text"
        >
          Edit
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="h-[28px] px-2.5 border border-taco-border rounded-md text-[12px] text-taco-sub hover:text-taco-error hover:border-taco-error"
        >
          Hapus
        </button>
      )}
    </div>
  );
}
