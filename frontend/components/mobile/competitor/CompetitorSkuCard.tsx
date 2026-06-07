"use client";

import { cn } from "@/lib/utils";

export const COMPETITOR_CATEGORIES = [
  "Laminate",
  "HPL",
  "Vinyl",
  "Sheet",
  "Edging",
  "Hardware",
  "Plywood",
  "Lainnya",
] as const;
export type CompetitorCategory = (typeof COMPETITOR_CATEGORIES)[number];

export const COMPETITOR_UOM = [
  "Box",
  "Lembar",
  "m²",
  "Pcs",
  "m",
  "Gulungan",
  "Pasang",
] as const;
export type CompetitorUom = (typeof COMPETITOR_UOM)[number];

export const COMPETITOR_PROMO_OPTIONS = [
  "Tidak Ada",
  "Diskon",
  "Bundle",
  "FG",
] as const;
export type CompetitorPromo = (typeof COMPETITOR_PROMO_OPTIONS)[number];

export const COMPETITOR_FLAGS = [
  { key: "baru", label: "Baru", cls: "border-amber-500 bg-amber-50 text-amber-700" },
  { key: "populer", label: "Populer", cls: "border-emerald-600 bg-emerald-50 text-emerald-700" },
  { key: "top", label: "Top SKU", cls: "border-blue-600 bg-blue-50 text-blue-700" },
] as const;
export type CompetitorFlag = (typeof COMPETITOR_FLAGS)[number]["key"];

export interface CompetitorSkuFormData {
  nama: string;
  kode: string;
  kategori: CompetitorCategory;
  harga_beli: string;
  harga_jual: string;
  terjual: string;
  uom: CompetitorUom;
  stok: string;
  promo: CompetitorPromo[];
  flags: CompetitorFlag[];
  foto_urls: (string | null)[];
  deskripsi: string;
}

export const EMPTY_COMPETITOR_SKU: CompetitorSkuFormData = {
  nama: "",
  kode: "",
  kategori: "Laminate",
  harga_beli: "",
  harga_jual: "",
  terjual: "",
  uom: "Box",
  stok: "",
  promo: [],
  flags: [],
  foto_urls: [null, null, null],
  deskripsi: "",
};

function fmtIdr(s: string) {
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

interface CompetitorSkuCardProps {
  index: number;
  expanded: boolean;
  onToggle: () => void;
  data: CompetitorSkuFormData;
  onChange: (data: CompetitorSkuFormData) => void;
  onRemove: () => void;
  onUploadPhoto?: (file: File) => Promise<string | null>;
  // AC-23: dash-to-copy from previous row
  previous?: CompetitorSkuFormData;
}

export function CompetitorSkuCard({
  index,
  expanded,
  onToggle,
  data,
  onChange,
  onRemove,
  onUploadPhoto,
  previous,
}: CompetitorSkuCardProps) {
  const filled = data.nama.trim().length > 0;
  const previewLine = filled
    ? data.harga_beli || data.harga_jual
      ? `Rp ${fmtIdr(data.harga_beli) || "—"} beli · Rp ${
          fmtIdr(data.harga_jual) || "—"
        } jual`
      : "Belum diisi"
    : "Produk belum diberi nama";

  const togglePromo = (p: CompetitorPromo) => {
    onChange({
      ...data,
      promo: data.promo.includes(p)
        ? data.promo.filter((x) => x !== p)
        : [...data.promo, p],
    });
  };

  const toggleFlag = (f: CompetitorFlag) => {
    onChange({
      ...data,
      flags: data.flags.includes(f)
        ? data.flags.filter((x) => x !== f)
        : [...data.flags, f],
    });
  };

  const handlePhoto = async (slot: number, file: File) => {
    if (!onUploadPhoto) return;
    const url = await onUploadPhoto(file);
    if (url) {
      const next = [...data.foto_urls];
      next[slot] = url;
      onChange({ ...data, foto_urls: next });
    }
  };

  // AC-23: typing a single dash copies the previous row's value
  const copyOnDash = (field: keyof CompetitorSkuFormData, value: string) => {
    if (!previous) return false;
    if (value.trim() === "-") {
      const prev = previous[field];
      if (typeof prev === "string") {
        onChange({ ...data, [field]: prev });
        return true;
      }
    }
    return false;
  };

  const inputCls =
    "h-[44px] border-[1.5px] border-taco-border rounded-[8px] px-2.5 text-[15px] text-taco-text bg-white outline-none w-full focus:border-taco-sub";

  return (
    <div className="bg-taco-page border border-taco-border rounded-[10px] mb-2.5 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3.5 py-3 min-h-[52px] text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold text-taco-muted tracking-wide uppercase mb-0.5">
            Produk #{index + 1}
          </div>
          <div className="text-[15px] font-medium text-taco-text truncate">
            {data.nama || "Produk belum diberi nama"}
          </div>
          <div className="text-[13px] text-taco-sub mt-0.5">{previewLine}</div>
          {data.flags.length > 0 && (
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {data.flags.map((f) => {
                const meta = COMPETITOR_FLAGS.find((x) => x.key === f)!;
                return (
                  <span
                    key={f}
                    className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full border-[1.5px]",
                      meta.cls
                    )}
                  >
                    {meta.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <span
          className="text-taco-muted transition-transform ml-2 flex-shrink-0"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-taco-border bg-white px-3.5 py-3.5 space-y-3">
          <div>
            <span className="text-[12px] font-medium text-taco-sub block mb-1">
              Nama Produk <span className="text-taco-error">*</span>
            </span>
            <input
              value={data.nama}
              onChange={(e) => {
                if (copyOnDash("nama", e.target.value)) return;
                onChange({ ...data, nama: e.target.value });
              }}
              placeholder="Nama produk kompetitor"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <span className="text-[12px] font-medium text-taco-sub block mb-1">
                Kode SKU
              </span>
              <input
                value={data.kode}
                onChange={(e) => {
                  if (copyOnDash("kode", e.target.value)) return;
                  onChange({ ...data, kode: e.target.value });
                }}
                placeholder="Opsional"
                className={inputCls}
              />
            </div>
            <div>
              <span className="text-[12px] font-medium text-taco-sub block mb-1">
                Kategori
              </span>
              <select
                value={data.kategori}
                onChange={(e) =>
                  onChange({
                    ...data,
                    kategori: e.target.value as CompetitorCategory,
                  })
                }
                className={cn(inputCls, "appearance-none")}
              >
                {COMPETITOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-[12px] font-medium text-taco-sub block mb-1">
                Harga Beli
              </span>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-taco-sub">
                  Rp
                </span>
                <input
                  inputMode="numeric"
                  value={fmtIdr(data.harga_beli)}
                  onChange={(e) => {
                    if (copyOnDash("harga_beli", e.target.value)) return;
                    onChange({
                      ...data,
                      harga_beli: e.target.value.replace(/\D/g, ""),
                    });
                  }}
                  placeholder="0"
                  className={cn(inputCls, "pl-7")}
                />
              </div>
            </div>
            <div>
              <span className="text-[12px] font-medium text-taco-sub block mb-1">
                Harga Jual ke Tukang
              </span>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-taco-sub">
                  Rp
                </span>
                <input
                  inputMode="numeric"
                  value={fmtIdr(data.harga_jual)}
                  onChange={(e) => {
                    if (copyOnDash("harga_jual", e.target.value)) return;
                    onChange({
                      ...data,
                      harga_jual: e.target.value.replace(/\D/g, ""),
                    });
                  }}
                  placeholder="0"
                  className={cn(inputCls, "pl-7")}
                />
              </div>
            </div>
            <div>
              <span className="text-[12px] font-medium text-taco-sub block mb-1">
                Terjual
              </span>
              <input
                inputMode="numeric"
                value={data.terjual}
                onChange={(e) => {
                  if (copyOnDash("terjual", e.target.value)) return;
                  onChange({
                    ...data,
                    terjual: e.target.value.replace(/\D/g, ""),
                  });
                }}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <span className="text-[12px] font-medium text-taco-sub block mb-1">
                UOM
              </span>
              <select
                value={data.uom}
                onChange={(e) =>
                  onChange({ ...data, uom: e.target.value as CompetitorUom })
                }
                className={cn(inputCls, "appearance-none")}
              >
                {COMPETITOR_UOM.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-[12px] font-medium text-taco-sub block mb-1">
                Stok on Hand
              </span>
              <input
                inputMode="numeric"
                value={data.stok}
                onChange={(e) => {
                  if (copyOnDash("stok", e.target.value)) return;
                  onChange({
                    ...data,
                    stok: e.target.value.replace(/\D/g, ""),
                  });
                }}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <span className="text-[12px] font-medium text-taco-sub block mb-1.5">
              Promo
            </span>
            <div className="flex flex-wrap gap-1.5">
              {COMPETITOR_PROMO_OPTIONS.map((p) => {
                const on = data.promo.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePromo(p)}
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

          <div>
            <span className="text-[12px] font-medium text-taco-sub block mb-1.5">
              Flag produk ini
            </span>
            <div className="flex flex-wrap gap-1.5">
              {COMPETITOR_FLAGS.map((f) => {
                const on = data.flags.includes(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleFlag(f.key)}
                    className={cn(
                      "h-9 px-3 rounded-full text-[13px] font-semibold border-[1.5px]",
                      on
                        ? f.cls
                        : "border-taco-border bg-white text-taco-sub"
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-[12px] font-medium text-taco-sub block mb-1.5">
              Foto Produk (opsional)
            </span>
            <div className="flex gap-2">
              {[0, 1, 2].map((slot) => {
                const url = data.foto_urls[slot];
                return (
                  <label
                    key={slot}
                    className={cn(
                      "flex-1 h-16 border-2 border-dashed rounded-[10px] flex items-center justify-center cursor-pointer overflow-hidden",
                      url
                        ? "border-taco-success bg-emerald-50"
                        : "border-taco-border bg-white text-taco-muted"
                    )}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={`Foto ${slot + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePhoto(slot, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-[12px] font-medium text-taco-sub block mb-1">
              Deskripsi (opsional)
            </span>
            <textarea
              value={data.deskripsi}
              onChange={(e) =>
                onChange({ ...data, deskripsi: e.target.value })
              }
              placeholder="Catatan tambahan tentang produk ini…"
              className="w-full min-h-[64px] border-[1.5px] border-taco-border rounded-[8px] px-2.5 py-2 text-[14px] text-taco-text bg-white outline-none focus:border-taco-sub resize-none"
            />
          </div>

          <div className="text-right">
            <button
              type="button"
              onClick={onRemove}
              className="text-[13px] text-taco-error font-medium h-11 px-2"
            >
              Hapus produk ini
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
