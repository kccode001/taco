"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  bulkUploadTaroInvoices,
  getRegionAreas,
  type RegionArea,
} from "@/lib/api";
import { UploadIcon, CloseIcon } from "../../../admin/_components/icons";
import { RegionSelector } from "../../../admin/taro-invoices/_components/RegionSelector";
import {
  InProgressPanel,
  pushLocalUploads,
  type LocalUpload,
} from "../../../admin/taro-invoices/_components/InProgressPanel";
import { MOCK_REGION_AREAS } from "../../../admin/taro-invoices/_components/mockData";

type FileStatus = "pending" | "uploading" | "failed";

interface QueueItem {
  id: string;
  file: File;
  status: FileStatus;
  thumbnail?: string;
  error?: string;
}

const ACCEPTED = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
const ACCEPT_ATTR = "image/jpeg,image/png,application/pdf";

export default function TaroInvoiceUploadPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regionAreas, setRegionAreas] = useState<RegionArea[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [regionDisplay, setRegionDisplay] = useState<string | null>(null);
  const [progressNonce, setProgressNonce] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getRegionAreas();
        const data =
          ((res.data as { data?: RegionArea[] })?.data ??
            (res.data as RegionArea[])) ?? [];
        if (!alive) return;
        setRegionAreas(data.length ? data : MOCK_REGION_AREAS);
      } catch {
        if (!alive) return;
        setRegionAreas(MOCK_REGION_AREAS);
      } finally {
        if (alive) setRegionsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => ACCEPTED.includes(f.type));
    const items: QueueItem[] = list.map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      status: "pending",
      thumbnail: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));
    setQueue((q) => [...q, ...items]);
    setError(null);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!regionId) {
      setError("Pilih wilayah dulu sebelum melepas file.");
      return;
    }
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const removeItem = (id: string) =>
    setQueue((q) => q.filter((i) => i.id !== id));

  const handleSubmit = async () => {
    if (!regionId) {
      setError("Pilih wilayah ASM dulu — invoice harus terikat ke satu area.");
      return;
    }
    const pending = queue.filter((q) => q.status === "pending");
    if (!pending.length) return;
    setSubmitting(true);
    setError(null);
    setQueue((q) =>
      q.map((i) => (i.status === "pending" ? { ...i, status: "uploading" } : i))
    );

    let invoiceIds: string[] = [];
    try {
      const res = await bulkUploadTaroInvoices(
        pending.map((p) => p.file),
        regionId
      );
      invoiceIds = res.data?.invoice_ids ?? [];
    } catch {
      invoiceIds = pending.map((p) => `local-${p.id}`);
    }

    if (invoiceIds.length < pending.length) {
      const extra = pending
        .slice(invoiceIds.length)
        .map((p) => `local-${p.id}`);
      invoiceIds = [...invoiceIds, ...extra];
    }

    const local: LocalUpload[] = pending.map((p, idx) => ({
      id: invoiceIds[idx],
      file_name: p.file.name,
      uploaded_at: new Date().toISOString(),
      region_display: regionDisplay ?? undefined,
    }));
    pushLocalUploads(local);

    setQueue([]);
    setProgressNonce((n) => n + 1);
    setSubmitting(false);
  };

  const pendingCount = queue.filter((q) => q.status === "pending").length;
  const canSubmit = !!regionId && pendingCount > 0 && !submitting;

  return (
    <div className="space-y-5 max-w-[1100px]">
      <div>
        <Link
          href="/taro/invoices"
          className="text-[12px] text-taco-sub hover:text-taco-text"
        >
          ← Kembali ke Daftar Invoice
        </Link>
        <h1 className="text-[20px] font-bold text-taco-text leading-tight mt-2">
          Upload Invoice Taro
        </h1>
        <p className="text-[13px] text-taco-sub mt-1">
          Admin testing tool — agent melakukan upload melalui PWA. OCR +
          pencocokan SKU otomatis dijalankan setelah upload.
        </p>
      </div>

      <div className="bg-white border border-taco-border rounded-xl p-5">
        <RegionSelector
          value={regionId}
          areas={regionAreas}
          loading={regionsLoading}
          onChange={(id, area) => {
            setRegionId(id);
            setRegionDisplay(area.display_path);
            setError(null);
          }}
        />
        {regionId && regionDisplay && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-taco-page border border-taco-border rounded-full text-[12px] text-taco-text">
            <span className="w-1.5 h-1.5 rounded-full bg-taco-success" />
            <span className="font-medium">Wilayah:</span>
            <span>{regionDisplay}</span>
            <button
              type="button"
              onClick={() => {
                setRegionId(null);
                setRegionDisplay(null);
              }}
              className="ml-1 text-taco-info hover:underline text-[12px] font-medium"
            >
              Ubah
            </button>
          </div>
        )}
        {!regionId && (
          <p className="mt-2 text-[12px] text-taco-muted">
            Setiap invoice harus terikat ke satu wilayah ASM. Upload terbuka
            setelah wilayah dipilih.
          </p>
        )}
      </div>

      <div
        onDragOver={(e) => {
          if (!regionId) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => {
          if (!regionId) {
            setError("Pilih wilayah ASM dulu sebelum mengunggah file.");
            return;
          }
          inputRef.current?.click();
        }}
        className={`min-h-[260px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-colors px-6 py-10 ${
          !regionId
            ? "border-taco-border bg-taco-page/40 cursor-not-allowed opacity-70"
            : dragOver
            ? "border-taco-text bg-taco-page cursor-pointer"
            : "border-taco-border bg-white hover:border-taco-sub hover:bg-taco-page cursor-pointer"
        }`}
        aria-disabled={!regionId}
      >
        <div className="w-14 h-14 rounded-full bg-taco-page flex items-center justify-center text-taco-sub mb-4">
          <UploadIcon size={26} />
        </div>
        <div className="text-[16px] font-semibold text-taco-text mb-1">
          {regionId
            ? "Letakkan gambar invoice di sini, atau klik untuk pilih file"
            : "Pilih wilayah ASM dulu untuk membuka upload"}
        </div>
        <div className="text-[13px] text-taco-sub max-w-[480px]">
          Mendukung JPG, PNG, dan PDF. Bisa banyak file sekaligus.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="bg-[#FEE2E2] border border-taco-error/30 text-taco-error text-[12px] rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {queue.length > 0 && (
        <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-taco-divider flex items-center gap-3">
            <div className="text-[14px] font-semibold text-taco-text">
              Antrian Upload ({queue.length})
            </div>
            <div className="text-[12px] text-taco-muted">
              {pendingCount} menunggu unggah
            </div>
            {pendingCount > 0 && (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="ml-auto h-[40px] px-4 bg-taco-accent text-white rounded-lg text-[13px] font-semibold hover:bg-taco-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? "Mengunggah…"
                  : `Mulai Upload (${pendingCount})`}
              </button>
            )}
          </div>
          <ul>
            {queue.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-4 px-4 py-3 border-b border-taco-divider last:border-0"
              >
                <div className="w-12 h-12 rounded-md bg-taco-page border border-taco-divider flex-shrink-0 overflow-hidden flex items-center justify-center text-taco-muted">
                  {item.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-semibold">PDF</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-taco-text truncate">
                    {item.file.name}
                  </div>
                  <div className="text-[11px] text-taco-muted">
                    {(item.file.size / 1024).toFixed(0)} KB ·{" "}
                    {item.file.type || "file"}
                  </div>
                </div>
                <div className="text-[12px] font-medium text-taco-muted">
                  {item.status === "uploading" ? "Mengunggah…" : "Menunggu"}
                </div>
                {item.status === "pending" && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1 text-taco-muted hover:text-taco-error"
                    aria-label="Hapus dari antrian"
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <InProgressPanel
        refreshNonce={progressNonce}
        onRetry={() => {
          setError(
            "Untuk mencoba ulang, pilih ulang file dari Antrian Upload di atas."
          );
        }}
      />
    </div>
  );
}
