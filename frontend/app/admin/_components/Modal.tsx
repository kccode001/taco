"use client";

import { useEffect } from "react";
import { CloseIcon } from "./icons";

export function Modal({
  title,
  onClose,
  onSave,
  saveLabel = "Simpan",
  size = "default",
  busy,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  size?: "default" | "wide";
  busy?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const widthCls = size === "wide" ? "max-w-[720px]" : "max-w-[500px]";

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl w-full ${widthCls} shadow-2xl max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-taco-divider flex-shrink-0">
          <h2 className="text-[17px] font-semibold text-taco-text">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-taco-muted hover:text-taco-text"
            aria-label="Tutup"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-auto">{children}</div>
        <div className="flex gap-3 px-6 py-4 border-t border-taco-divider flex-shrink-0">
          {footer ?? (
            <>
              <button
                onClick={onClose}
                className="flex-1 h-[44px] border border-taco-border rounded-lg text-[14px] font-medium text-taco-sub hover:text-taco-text"
              >
                Batal
              </button>
              {onSave && (
                <button
                  onClick={onSave}
                  disabled={busy}
                  className="flex-1 h-[44px] bg-taco-accent text-white rounded-lg text-[14px] font-semibold hover:bg-taco-accent-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {busy ? "Menyimpan…" : saveLabel}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-taco-text mb-1.5">
        {label}
      </label>
      {hint && <div className="text-[12px] text-taco-muted mb-1.5">{hint}</div>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
      />
    </div>
  );
}

export function FormSelect({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-taco-text mb-1.5">
        {label}
      </label>
      {hint && <div className="text-[12px] text-taco-muted mb-1.5">{hint}</div>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
      >
        <option value="">Pilih…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FormTextarea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-taco-text mb-1.5">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full border border-taco-border rounded-lg px-3 py-2.5 text-[14px] text-taco-text bg-white outline-none resize-none focus:border-taco-text"
      />
    </div>
  );
}

export function FormCheckbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-[18px] h-[18px] accent-taco-text cursor-pointer"
      />
      <div>
        <div className="text-[14px] text-taco-text">{label}</div>
        {hint && <div className="text-[12px] text-taco-muted">{hint}</div>}
      </div>
    </label>
  );
}
