"use client";

import { useRef, useState } from "react";
import { Modal } from "../../_components/Modal";
import { UploadIcon } from "../../_components/icons";
import { importTacoSkusCsv, type CsvImportPreview } from "@/lib/api";
import { Badge } from "../../_components/CrudShell";
import { CATALOG_CATEGORIES, PRODUCT_LINES } from "../../_components/constants";

const REQUIRED_COLS =
  "code, name, catalog_category, product_line, unit, min_price, max_price";

/** Build a client-side dry-run preview when BE is unavailable. Parses simple
 *  comma-separated CSV (no quoted commas) and flags rows whose
 *  catalog_category/product_line are not in the locked enum sets. */
function parsePreviewLocal(file: File): Promise<CsvImportPreview> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) {
        resolve({
          filename: file.name,
          total_rows: 0,
          new_count: 0,
          update_count: 0,
          error_count: 0,
          rows: [],
        });
        return;
      }
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const idx = {
        code: header.indexOf("code"),
        name: header.indexOf("name"),
        catalog_category: header.indexOf("catalog_category"),
        product_line: header.indexOf("product_line"),
        unit: header.indexOf("unit"),
        min_price: header.indexOf("min_price"),
        max_price: header.indexOf("max_price"),
      };
      const lineSet = new Set<string>(PRODUCT_LINES.map((p) => p.slug));
      const catSet = new Set<string>(CATALOG_CATEGORIES);
      const rows = lines.slice(1).map((line, i) => {
        const cells = line.split(",").map((c) => c.trim());
        const errors: string[] = [];
        const code = idx.code >= 0 ? cells[idx.code] : "";
        const name = idx.name >= 0 ? cells[idx.name] : "";
        const cat = idx.catalog_category >= 0 ? cells[idx.catalog_category] : "";
        const line_ = idx.product_line >= 0 ? cells[idx.product_line] : "";
        if (!code) errors.push("code wajib");
        if (!name) errors.push("name wajib");
        if (cat && !catSet.has(cat)) errors.push("catalog_category tidak valid");
        if (line_ && !lineSet.has(line_)) errors.push("product_line tidak valid");
        return {
          row: i + 2,
          code,
          name,
          catalog_category: cat,
          product_line: line_,
          unit: idx.unit >= 0 ? cells[idx.unit] : "",
          min_price: idx.min_price >= 0 ? Number(cells[idx.min_price]) : undefined,
          max_price: idx.max_price >= 0 ? Number(cells[idx.max_price]) : undefined,
          status: errors.length ? ("error" as const) : ("new" as const),
          errors: errors.length ? errors : undefined,
        };
      });
      const error_count = rows.filter((r) => r.status === "error").length;
      resolve({
        filename: file.name,
        total_rows: rows.length,
        new_count: rows.filter((r) => r.status === "new").length,
        update_count: 0,
        error_count,
        rows,
      });
    };
    reader.readAsText(file);
  });
}

export function CsvImportModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"pick" | "preview" | "done">("pick");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);

  if (!open) return null;

  const reset = () => {
    setFile(null);
    setPreview(null);
    setStep("pick");
    setError(null);
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onPick = async (picked: File) => {
    setError(null);
    setFile(picked);
    setBusy(true);
    try {
      const res = await importTacoSkusCsv(picked, true);
      const data = res.data as CsvImportPreview;
      setPreview(data);
      setStep("preview");
    } catch {
      try {
        const local = await parsePreviewLocal(picked);
        setPreview(local);
        setStep("preview");
      } catch (err) {
        setError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await importTacoSkusCsv(file, false);
      const data = res.data as { imported?: number; failed?: number } | CsvImportPreview;
      setResult({
        imported: (data as { imported?: number }).imported ?? preview?.new_count ?? 0,
        failed: (data as { failed?: number }).failed ?? preview?.error_count ?? 0,
      });
      setStep("done");
      onComplete();
    } catch {
      setError(
        "Gagal mengimpor ke backend — coba lagi atau periksa koneksi. Data dry-run sudah divalidasi."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Impor SKU TACO dari CSV"
      onClose={handleClose}
      size="wide"
      footer={
        step === "done" ? (
          <button
            onClick={handleClose}
            className="flex-1 h-[44px] bg-taco-text text-white rounded-lg text-[14px] font-semibold"
          >
            Selesai
          </button>
        ) : (
          <>
            <button
              onClick={handleClose}
              className="flex-1 h-[44px] border border-taco-border rounded-lg text-[14px] font-medium text-taco-sub hover:text-taco-text"
            >
              Batal
            </button>
            {step === "preview" && preview && (
              <button
                onClick={commit}
                disabled={busy || preview.error_count > 0 || preview.new_count + preview.update_count === 0}
                className="flex-1 h-[44px] bg-taco-accent text-white rounded-lg text-[14px] font-semibold hover:bg-taco-accent-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy
                  ? "Mengimpor…"
                  : `Impor ${preview.new_count + preview.update_count} SKU`}
              </button>
            )}
          </>
        )
      }
    >
      {step === "pick" && (
        <>
          <div className="text-[13px] text-taco-sub">
            Unggah file CSV untuk menambahkan atau memperbarui SKU TACO secara
            massal. Sistem akan menjalankan pratinjau (dry-run) sebelum data
            disimpan. Setelah diimpor, embedding pgvector akan digenerate
            otomatis (AC-21).
          </div>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="w-full border-2 border-dashed border-taco-border rounded-xl py-10 px-4 text-center bg-taco-page hover:border-taco-text transition-colors"
          >
            <div className="text-taco-muted mb-2 flex justify-center">
              <UploadIcon size={28} />
            </div>
            <div className="text-[14px] font-medium text-taco-text">
              Klik untuk pilih file
            </div>
            <div className="text-[12px] text-taco-muted mt-1">
              Maksimum 5MB · format .csv
            </div>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
          />

          <div>
            <div className="text-[13px] font-medium text-taco-text mb-1.5">
              Kolom yang diperlukan
            </div>
            <div className="font-mono text-[12px] text-taco-sub bg-taco-page border border-taco-border rounded-lg px-3 py-2.5">
              {REQUIRED_COLS}
            </div>
            <div className="text-[12px] text-taco-muted mt-1.5">
              <code>catalog_category</code> harus salah satu dari:{" "}
              {CATALOG_CATEGORIES.join(" / ")}.{" "}
              <code>product_line</code> harus salah satu dari 8 lini:{" "}
              {PRODUCT_LINES.map((p) => p.slug).join(", ")}.
            </div>
          </div>

          {error && (
            <div className="text-[13px] text-taco-error bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {busy && (
            <div className="text-[13px] text-taco-sub">Menjalankan dry-run…</div>
          )}
        </>
      )}

      {step === "preview" && preview && (
        <>
          <div className="text-[13px] text-taco-sub">
            Pratinjau{" "}
            <span className="font-medium text-taco-text">{preview.filename}</span>{" "}
            · {preview.total_rows} baris
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge tone="ok">Baru: {preview.new_count}</Badge>
            <Badge tone="warn">Update: {preview.update_count}</Badge>
            <Badge tone={preview.error_count > 0 ? "err" : "muted"}>
              Error: {preview.error_count}
            </Badge>
          </div>

          <div className="border border-taco-border rounded-xl overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-taco-page border-b border-taco-border">
                  {["Baris", "Kode", "Nama", "Kategori", "Lini", "Status"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 text-[11px] font-semibold text-taco-muted uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 25).map((r) => (
                  <tr
                    key={r.row}
                    className="border-b border-taco-divider last:border-0"
                  >
                    <td className="px-3 py-2 text-taco-muted font-mono">
                      {r.row}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-taco-sub">
                      {r.code || "—"}
                    </td>
                    <td className="px-3 py-2 text-taco-text truncate max-w-[200px]">
                      {r.name || "—"}
                    </td>
                    <td className="px-3 py-2 text-taco-sub">
                      {r.catalog_category || "—"}
                    </td>
                    <td className="px-3 py-2 text-taco-sub">
                      {r.product_line || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        tone={
                          r.status === "new"
                            ? "ok"
                            : r.status === "update"
                              ? "warn"
                              : "err"
                        }
                      >
                        {r.status === "new"
                          ? "Baru"
                          : r.status === "update"
                            ? "Update"
                            : "Error"}
                      </Badge>
                      {r.errors && (
                        <div className="text-[11px] text-taco-error mt-1">
                          {r.errors.join(", ")}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 25 && (
            <div className="text-[12px] text-taco-muted">
              Menampilkan 25 dari {preview.rows.length} baris dalam pratinjau
            </div>
          )}
          {preview.error_count > 0 && (
            <div className="text-[12px] text-taco-error">
              Perbaiki {preview.error_count} baris error sebelum impor.
            </div>
          )}
          {error && (
            <div className="text-[13px] text-taco-error bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </>
      )}

      {step === "done" && result && (
        <div className="py-4 text-center">
          <div className="text-[20px] font-bold text-taco-success mb-2">
            ✓ Impor Selesai
          </div>
          <div className="text-[14px] text-taco-text">
            {result.imported} SKU diimpor
            {result.failed > 0 && (
              <span className="text-taco-error">, {result.failed} gagal</span>
            )}
            .
          </div>
          <div className="text-[12px] text-taco-muted mt-2">
            Embedding pgvector akan digenerate di background.
          </div>
        </div>
      )}
    </Modal>
  );
}
