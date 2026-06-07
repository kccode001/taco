"use client";

import { cn } from "@/lib/utils";

export const UOM_OPTIONS = [
  "Box",
  "Lembar",
  "m²",
  "Pcs",
  "m",
  "Gulungan",
  "Pasang",
] as const;

export type Uom = (typeof UOM_OPTIONS)[number];

export const PROMO_OPTIONS = ["Tidak Ada", "Diskon", "Bundle", "FG"] as const;
export type Promo = (typeof PROMO_OPTIONS)[number];

export interface SkuFormData {
  harga_beli: string;
  harga_jual: string;
  terjual: string;
  uom: Uom;
  stok: string;
  promo: Promo[];
}

export const EMPTY_SKU_FORM: SkuFormData = {
  harga_beli: "",
  harga_jual: "",
  terjual: "",
  uom: "Box",
  stok: "",
  promo: [],
};

interface SkuCardProps {
  code: string;
  name: string;
  expanded: boolean;
  onToggle: () => void;
  data: SkuFormData;
  onChange: (data: SkuFormData) => void;
  preFilled?: boolean;
  changed?: boolean;
}

function fmtIdr(s: string) {
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function SkuCard({
  code,
  name,
  expanded,
  onToggle,
  data,
  onChange,
  preFilled,
  changed,
}: SkuCardProps) {
  const filled =
    data.harga_beli.trim().length > 0 || data.harga_jual.trim().length > 0;
  const previewLine = filled
    ? `Rp ${fmtIdr(data.harga_beli) || "—"} beli · Rp ${
        fmtIdr(data.harga_jual) || "—"
      } jual`
    : "Belum diisi";

  const toggleP = (p: Promo) => {
    onChange({
      ...data,
      promo: data.promo.includes(p)
        ? data.promo.filter((x) => x !== p)
        : [...data.promo, p],
    });
  };

  const inputCls = (pre: boolean) =>
    cn(
      "h-[44px] border-[1.5px] rounded-[8px] pl-7 pr-2.5 text-[15px] text-taco-text bg-white outline-none w-full focus:border-taco-sub",
      pre ? "border-taco-delta bg-emerald-50" : "border-taco-border"
    );

  return (
    <div
      className={cn(
        "bg-taco-page border border-taco-border rounded-[10px] mb-2 overflow-hidden",
        changed && "border-l-[3px] border-l-taco-delta"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3.5 py-3 min-h-[52px]"
      >
        <div className="text-left">
          <div className="text-[11px] font-bold text-taco-muted tracking-wide uppercase mb-0.5">
            {code}
          </div>
          <div className="text-[15px] font-medium text-taco-text">{name}</div>
          <div className="text-[13px] text-taco-sub mt-0.5">{previewLine}</div>
        </div>
        <span
          className="text-taco-muted transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-taco-border bg-white px-3.5 py-3.5">
          <div className="grid grid-cols-2 gap-2.5 mb-2.5">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-taco-sub">
                Harga Beli
              </span>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-taco-sub">
                  Rp
                </span>
                <input
                  inputMode="numeric"
                  value={fmtIdr(data.harga_beli)}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      harga_beli: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  placeholder="0"
                  className={inputCls(!!preFilled)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-taco-sub">
                Harga Jual ke Tukang
              </span>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-taco-sub">
                  Rp
                </span>
                <input
                  inputMode="numeric"
                  value={fmtIdr(data.harga_jual)}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      harga_jual: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  placeholder="0"
                  className={inputCls(!!preFilled)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-taco-sub">
                Terjual
              </span>
              <input
                inputMode="numeric"
                type="number"
                min="0"
                value={data.terjual}
                onChange={(e) =>
                  onChange({ ...data, terjual: e.target.value })
                }
                placeholder="0"
                className="h-[44px] border-[1.5px] border-taco-border rounded-[8px] px-2.5 text-[15px] text-taco-text bg-white outline-none w-full focus:border-taco-sub"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-taco-sub">UOM</span>
              <select
                value={data.uom}
                onChange={(e) =>
                  onChange({ ...data, uom: e.target.value as Uom })
                }
                className="h-[44px] border-[1.5px] border-taco-border rounded-[8px] px-2.5 text-[15px] text-taco-text bg-white outline-none w-full appearance-none focus:border-taco-sub"
              >
                {UOM_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-taco-sub">
                Stok on Hand
              </span>
              <input
                inputMode="numeric"
                type="number"
                min="0"
                value={data.stok}
                onChange={(e) =>
                  onChange({ ...data, stok: e.target.value })
                }
                placeholder="0"
                className="h-[44px] border-[1.5px] border-taco-border rounded-[8px] px-2.5 text-[15px] text-taco-text bg-white outline-none w-full focus:border-taco-sub"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-taco-sub">Promo</span>
            <div className="flex flex-wrap gap-1.5">
              {PROMO_OPTIONS.map((p) => {
                const on = data.promo.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleP(p)}
                    className={cn(
                      "h-9 px-3 rounded-full text-[13px] font-medium border-[1.5px]",
                      on
                        ? "border-taco-text bg-taco-text text-white"
                        : "border-taco-border bg-white text-taco-text"
                    )}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
