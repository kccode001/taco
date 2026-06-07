"use client";

import { cn } from "@/lib/utils";

export type PicRole = "owner" | "purchaser" | "sales_staff" | "warehouse";

export interface PicEntry {
  role: PicRole;
  name: string;
}

const ROLE_LABELS: Record<PicRole, string> = {
  owner: "Owner",
  purchaser: "Purchaser",
  sales_staff: "Sales staff",
  warehouse: "Warehouse",
};

const ROLES: PicRole[] = ["owner", "purchaser", "sales_staff", "warehouse"];

interface PicMultiPickerProps {
  value: PicEntry[];
  onChange: (value: PicEntry[]) => void;
}

export function PicMultiPicker({ value, onChange }: PicMultiPickerProps) {
  const toggleRole = (role: PicRole) => {
    const exists = value.some((p) => p.role === role);
    if (exists) {
      onChange(value.filter((p) => p.role !== role));
    } else {
      onChange([...value, { role, name: "" }]);
    }
  };

  const updateName = (role: PicRole, name: string) => {
    onChange(value.map((p) => (p.role === role ? { ...p, name } : p)));
  };

  return (
    <div>
      <div className="text-[14px] font-medium text-taco-sub mb-2">
        Siapa yang Anda temui?
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {ROLES.map((r) => {
          const on = value.some((p) => p.role === r);
          return (
            <button
              key={r}
              type="button"
              onClick={() => toggleRole(r)}
              className={cn(
                "h-[44px] px-4 rounded-full text-[14px] font-medium font-sans border-[1.5px] transition-colors min-h-[44px]",
                on
                  ? "border-taco-text bg-taco-text text-white"
                  : "border-taco-border bg-white text-taco-text"
              )}
            >
              {ROLE_LABELS[r]}
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((entry) => (
            <div key={entry.role}>
              <label className="block text-[12px] font-medium text-taco-sub mb-1">
                Nama — {ROLE_LABELS[entry.role]}
              </label>
              <input
                type="text"
                value={entry.name}
                onChange={(e) => updateName(entry.role, e.target.value)}
                placeholder={`Nama ${ROLE_LABELS[entry.role].toLowerCase()}`}
                className="w-full h-[52px] border-[1.5px] border-taco-border rounded-[10px] px-3.5 text-[16px] text-taco-text bg-white outline-none focus:border-taco-sub"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
