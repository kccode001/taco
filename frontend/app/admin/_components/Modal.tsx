"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "./icons";

export function Modal({
  title,
  onClose,
  onSave,
  saveLabel = "Simpan",
  size = "default",
  busy,
  saveDisabled,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  size?: "default" | "wide";
  busy?: boolean;
  /** Disable Save without showing the "Menyimpan…" spinner label.
   *  Use when the form is invalid but no async action is in flight. */
  saveDisabled?: boolean;
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
                  disabled={busy || saveDisabled}
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
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  prefix?: string;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-taco-text mb-1.5">
        {label}
      </label>
      {hint && <div className="text-[12px] text-taco-muted mb-1.5">{hint}</div>}
      {prefix ? (
        <div className="w-full h-[44px] flex items-stretch border border-taco-border rounded-lg bg-white overflow-hidden focus-within:border-taco-text">
          <span className="flex items-center px-3 text-[13px] font-medium text-taco-muted border-r border-taco-border bg-taco-page">
            {prefix}
          </span>
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-3 text-[14px] text-taco-text bg-white outline-none"
          />
        </div>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
        />
      )}
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

/** Multi-tag chip input — type a value, Enter or comma adds a chip.
 *  Backspace on empty input removes the last chip. Each chip has a × button. */
export function FormTagInput({
  label,
  values,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,\n]/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !values.includes(s));
    if (parts.length === 0) return;
    onChange([...values, ...parts]);
    setDraft("");
  };

  const remove = (idx: number) => {
    const next = values.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div>
      <label className="block text-[13px] font-medium text-taco-text mb-1.5">
        {label}
      </label>
      {hint && <div className="text-[12px] text-taco-muted mb-1.5">{hint}</div>}
      <div className="w-full min-h-[44px] border border-taco-border rounded-lg px-2 py-1.5 text-[14px] bg-white focus-within:border-taco-text flex flex-wrap gap-1.5 items-center">
        {values.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="group inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-taco-page border border-taco-border text-[12px] text-taco-text"
          >
            <span className="truncate max-w-[200px]">{tag}</span>
            <button
              type="button"
              aria-label={`Hapus ${tag}`}
              onClick={() => remove(i)}
              className="w-4 h-4 inline-flex items-center justify-center rounded-full text-taco-muted hover:text-taco-text hover:bg-taco-border/60"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path
                  d="M1 1L9 9M9 1L1 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            // If user types a comma, commit immediately.
            if (v.endsWith(",")) {
              commit(v.slice(0, -1));
            } else {
              setDraft(v);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
              e.preventDefault();
              remove(values.length - 1);
            }
          }}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[,\n]/.test(text)) {
              e.preventDefault();
              commit(text);
            }
          }}
          placeholder={values.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] h-[28px] outline-none border-0 bg-transparent text-taco-text placeholder:text-taco-muted px-1"
        />
      </div>
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
