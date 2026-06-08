"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AxiosError } from "axios";
import {
  getTacoSkus,
  getTaroInvoice,
  updateTaroLineItem,
  type TaroInvoiceDetail,
  type TaroInvoiceLine,
} from "@/lib/api";
import { TopBar } from "../../_components/TopBar";
import { BottomNav } from "../../_components/BottomNav";
import { useTaroGuard } from "../../_components/useTaroGuard";
import {
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  PencilIcon,
  PinIcon,
  SearchIcon,
  StoreIcon,
} from "../../_components/icons";

interface TacoSkuRow {
  id: string;
  code: string;
  name: string;
  category: string;
}

function confidenceTone(
  c: number
): { tone: "ok" | "warn" | "err"; label: string; dot: string } {
  if (c >= 0.85) return { tone: "ok", label: "Yakin", dot: "#1D9E75" };
  if (c >= 0.7) return { tone: "warn", label: "Perlu Cek", dot: "#E07B00" };
  return { tone: "err", label: "Perlu Review", dot: "#D0342C" };
}

function formatIdr(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function timeFmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    const msg = data?.message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string") return msg;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Terjadi kesalahan tidak diketahui.";
}

export default function TaroUploadReviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { ready } = useTaroGuard();
  const [invoice, setInvoice] = useState<TaroInvoiceDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TaroInvoiceLine | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getTaroInvoice(id);
      const data = res.data as TaroInvoiceDetail | null;
      if (data && data.id) {
        setInvoice(data);
      } else {
        setLoadError("Invoice tidak ditemukan.");
      }
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    refetch();
  }, [ready, refetch]);

  // Poll while invoice is still processing so the review page reveals lines
  // the moment the OCR worker finishes.
  useEffect(() => {
    if (!ready || !invoice) return;
    const stillRunning =
      invoice.status === "pending" ||
      invoice.status === "processing" ||
      (invoice.status as string) === "queued" ||
      (invoice.status as string) === "ocr" ||
      (invoice.status as string) === "mapping";
    if (!stillRunning) return;
    const t = window.setTimeout(refetch, 3000);
    return () => window.clearTimeout(t);
  }, [ready, invoice, refetch]);

  const summary = useMemo(() => {
    if (!invoice) return { yakin: 0, perluCek: 0, perluReview: 0, total: 0 };
    const lines = invoice.line_items ?? [];
    let yakin = 0;
    let perluCek = 0;
    let perluReview = 0;
    for (const l of lines) {
      const t = confidenceTone(l.confidence);
      if (t.tone === "ok") yakin += 1;
      else if (t.tone === "warn") perluCek += 1;
      else perluReview += 1;
    }
    return { yakin, perluCek, perluReview, total: lines.length };
  }, [invoice]);

  const applyLineUpdate = (updated: TaroInvoiceLine) => {
    setInvoice((inv) =>
      inv
        ? {
            ...inv,
            line_items: inv.line_items.map((li) =>
              li.id === updated.id ? updated : li
            ),
          }
        : inv
    );
  };

  if (!ready || (loading && !invoice)) {
    return (
      <div className="min-h-screen bg-taco-page flex items-center justify-center text-[13px] text-taco-muted">
        Memuat invoice…
      </div>
    );
  }

  if (loadError || !invoice) {
    return (
      <div className="min-h-screen bg-taco-page flex flex-col">
        <div className="phone-shell flex flex-col min-h-screen pb-[96px]">
          <TopBar title="Invoice" />
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="text-[15px] font-semibold text-taco-error">
              Gagal memuat invoice
            </div>
            <div className="text-[13px] text-taco-sub mt-1 max-w-[280px]">
              {loadError ?? "Tidak ada data."}
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 px-4 py-2 rounded-lg bg-taco-text text-white text-[14px] font-medium"
            >
              Coba lagi
            </button>
            <button
              type="button"
              onClick={() => router.push("/taro-app/home")}
              className="mt-2 text-[13px] text-taco-sub"
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const lines = invoice.line_items ?? [];
  const status = invoice.status as string;
  const isDone = status === "done";
  const isProcessing =
    status === "pending" ||
    status === "processing" ||
    status === "queued" ||
    status === "ocr" ||
    status === "mapping";
  const isFailed = status === "failed";
  const isNeedsReview = status === "needs_review";

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[96px]">
        <TopBar
          title={`Invoice ${invoice.short_id ?? ""}`}
          right={
            <button
              type="button"
              onClick={() => router.push("/taro-app/home")}
              className="inline-flex items-center gap-1 text-[13px] text-taco-sub px-2 py-1 -mr-2"
            >
              <ChevronLeftIcon size={16} />
              Beranda
            </button>
          }
        />

        {/* Status banners */}
        {isDone && (
          <div className="mx-4 mt-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <span className="text-taco-success mt-0.5">
              <CheckIcon size={16} />
            </span>
            <div className="text-[12px] text-taco-text leading-relaxed">
              Invoice ini sudah diproses pada {timeFmt(invoice.uploaded_at)}.
              Edit baris masih bisa dilakukan.
            </div>
          </div>
        )}
        {isProcessing && (
          <div className="mx-4 mt-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-[12px] text-taco-info">
            Invoice sedang diproses oleh OCR. Hasil akan muncul otomatis.
          </div>
        )}
        {isFailed && (
          <div className="mx-4 mt-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-[12px] text-taco-error">
            OCR gagal memproses invoice ini. Coba upload ulang.
          </div>
        )}

        {/* Invoice meta */}
        <div className="bg-white border-b border-taco-divider px-4 py-3 mt-3">
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 rounded-lg bg-taco-page border border-taco-border flex items-center justify-center text-taco-muted flex-shrink-0">
              {invoice.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={invoice.image_url}
                  alt="Invoice"
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <StoreIcon size={22} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-taco-text truncate">
                {(invoice as TaroInvoiceDetail & { store_name?: string | null })
                  .store_name ?? "Toko Tidak Disebutkan"}
              </div>
              {invoice.region_display && (
                <div className="text-[12px] text-taco-sub flex items-center gap-1 mt-0.5">
                  <PinIcon size={12} />
                  <span className="truncate">{invoice.region_display}</span>
                </div>
              )}
              <div className="text-[12px] text-taco-muted mt-0.5 truncate">
                Diunggah {timeFmt(invoice.uploaded_at)}
              </div>
            </div>
          </div>
        </div>

        {/* Confidence summary */}
        <div className="px-4 pt-3">
          <div className="bg-white border border-taco-border rounded-xl p-3">
            <div className="text-[12px] text-taco-sub mb-2">Ringkasan OCR</div>
            <div className="flex items-center gap-3 text-[13px]">
              <SummaryPill
                color="bg-taco-success"
                label="Yakin"
                value={summary.yakin}
              />
              <SummaryPill
                color="bg-taco-warning"
                label="Perlu cek"
                value={summary.perluCek + summary.perluReview}
              />
              <div className="ml-auto text-[12px] text-taco-sub">
                {summary.yakin}/{summary.total} baris siap
              </div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <section className="px-4 pt-4 flex-1">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-[15px] font-semibold text-taco-text">
              Item Invoice ({lines.length})
            </h2>
          </div>
          {lines.length === 0 ? (
            <div className="bg-white border border-taco-border rounded-xl p-5 text-center text-[14px] text-taco-muted">
              {isProcessing
                ? "Menunggu hasil OCR…"
                : "Belum ada baris terdeteksi."}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {lines.map((li) => {
                const c = confidenceTone(li.confidence);
                const leftBorder =
                  c.tone === "err"
                    ? "border-l-[3px] border-l-taco-error"
                    : c.tone === "warn"
                      ? "border-l-[3px] border-l-taco-warning"
                      : "border-l-[3px] border-l-taco-success";
                return (
                  <div
                    key={li.id}
                    className={`bg-white border border-taco-border rounded-xl p-3 ${leftBorder}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-taco-muted truncate">
                          Baris #{li.line_no} · {li.raw_text}
                        </div>
                        <div className="text-[15px] font-medium text-taco-text mt-1 truncate">
                          {li.matched_sku_name ?? "Belum cocok"}
                        </div>
                        {li.matched_sku_code && (
                          <div className="text-[11px] text-taco-sub font-mono mt-0.5">
                            {li.matched_sku_code}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditing(li)}
                        aria-label="Edit baris"
                        className="w-9 h-9 rounded-lg bg-taco-page border border-taco-border flex items-center justify-center text-taco-sub active:bg-taco-divider flex-shrink-0"
                      >
                        <PencilIcon size={16} />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background:
                            c.tone === "ok"
                              ? "#ECFDF5"
                              : c.tone === "warn"
                                ? "#FFFBEB"
                                : "#FEF2F2",
                          color: c.dot,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: c.dot }}
                        />
                        {c.label}
                      </span>
                      <span className="text-[12px] text-taco-sub">
                        {li.quantity} {li.unit}
                      </span>
                      <span className="text-[12px] text-taco-sub">·</span>
                      <span className="text-[12px] text-taco-text font-medium">
                        {formatIdr(li.unit_price)}
                      </span>
                      <span className="ml-auto text-[12px] text-taco-sub">
                        {Math.round(li.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Bottom CTA — status-aware */}
        <div className="px-4 pt-5">
          {isDone ? (
            <button
              type="button"
              disabled
              className="w-full min-h-[52px] rounded-xl bg-taco-page text-taco-success border border-emerald-200 font-semibold text-[16px] flex items-center justify-center gap-2"
            >
              <CheckIcon size={18} />
              <span>Sudah Selesai</span>
            </button>
          ) : isProcessing ? (
            <button
              type="button"
              disabled
              className="w-full min-h-[52px] rounded-xl bg-taco-page text-taco-info border border-blue-100 font-semibold text-[16px]"
            >
              Memproses…
            </button>
          ) : isFailed ? (
            <button
              type="button"
              onClick={() => router.push("/taro-app/upload")}
              className="w-full min-h-[52px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark transition-colors"
            >
              Upload Ulang
            </button>
          ) : isNeedsReview ? (
            <button
              type="button"
              onClick={() => router.push("/taro-app/home")}
              className="w-full min-h-[52px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark transition-colors"
            >
              Selesai
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/taro-app/home")}
              className="w-full min-h-[52px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark transition-colors"
            >
              Selesai
            </button>
          )}
        </div>
      </div>

      <BottomNav />

      {editing && (
        <EditLineSheet
          line={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            applyLineUpdate(updated);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SummaryPill({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[13px] text-taco-text font-medium">{value}</span>
      <span className="text-[12px] text-taco-sub">{label}</span>
    </div>
  );
}

function EditLineSheet({
  line,
  onClose,
  onSaved,
}: {
  line: TaroInvoiceLine;
  onClose: () => void;
  onSaved: (updated: TaroInvoiceLine) => void;
}) {
  const [search, setSearch] = useState("");
  const [skus, setSkus] = useState<TacoSkuRow[]>([]);
  const [selectedSku, setSelectedSku] = useState<TacoSkuRow | null>(null);
  const [quantity, setQuantity] = useState<string>(String(line.quantity ?? ""));
  const [price, setPrice] = useState<string>(
    String(line.unit_price ?? "")
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getTacoSkus();
        const data =
          ((res.data as { data?: TacoSkuRow[] })?.data ??
            (res.data as TacoSkuRow[])) ?? [];
        setSkus(data);
        if (line.matched_sku_id) {
          const cur = data.find((s) => s.id === line.matched_sku_id);
          if (cur) setSelectedSku(cur);
        }
      } catch (err) {
        setError(`Tidak bisa memuat daftar SKU: ${extractErrorMessage(err)}`);
      }
    })();
  }, [line.matched_sku_id]);

  const filtered = useMemo(() => {
    if (!search.trim()) return skus.slice(0, 12);
    const q = search.toLowerCase();
    return skus
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [skus, search]);

  const skuChanged = !!selectedSku && selectedSku.id !== line.matched_sku_id;
  const canSave =
    !!selectedSku && (!skuChanged || reason.trim().length > 0);

  const handleSave = async () => {
    if (!selectedSku || !canSave) return;
    setBusy(true);
    setError(null);
    try {
      await updateTaroLineItem(line.id, {
        matched_sku_id: selectedSku.id,
        ...(skuChanged ? { reason: reason.trim() } : {}),
      });
      onSaved({
        ...line,
        matched_sku_id: selectedSku.id,
        matched_sku_code: selectedSku.code,
        matched_sku_name: selectedSku.name,
        confidence: skuChanged ? 1 : line.confidence,
        quantity: Number(quantity) || line.quantity,
        unit_price: Number(price) || line.unit_price,
      });
    } catch (err) {
      setError(`Gagal menyimpan: ${extractErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="bg-white w-full phone-shell rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="px-4 pt-3 pb-2 border-b border-taco-divider flex items-center justify-between">
          <div className="text-[16px] font-semibold text-taco-text">
            Edit Baris #{line.line_no}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-taco-sub hover:bg-taco-page"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="px-4 py-4 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="text-[12px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="bg-taco-page border border-taco-divider rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wider text-taco-muted font-semibold">
              Teks OCR
            </div>
            <div className="text-[14px] text-taco-text mt-1">{line.raw_text}</div>
          </div>

          {/* SKU search */}
          <div>
            <label className="block text-[13px] font-medium text-taco-text mb-1.5">
              Pilih SKU TACO
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted">
                <SearchIcon size={16} />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode atau nama SKU…"
                className="w-full h-[48px] pl-10 pr-3 border border-taco-border rounded-xl text-[15px] text-taco-text bg-white outline-none focus:border-taco-text"
              />
            </div>
            <div className="mt-2 max-h-[220px] overflow-y-auto border border-taco-divider rounded-xl divide-y divide-taco-divider">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-[12px] text-taco-muted">
                  Tidak ada SKU cocok.
                </div>
              ) : (
                filtered.map((s) => {
                  const active = selectedSku?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSku(s)}
                      className={`w-full text-left px-3 py-2.5 active:bg-taco-page ${
                        active ? "bg-taco-accent-tint" : "bg-white"
                      }`}
                    >
                      <div className="font-mono text-[11px] text-taco-muted">
                        {s.code}
                      </div>
                      <div className="text-[14px] text-taco-text">{s.name}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Quantity + price */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[13px] font-medium text-taco-text mb-1.5">
                Kuantitas
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={[
                  "w-full h-[48px] border rounded-xl px-3 text-[15px] text-taco-text bg-white outline-none focus:border-taco-text",
                  Number(quantity) !== line.quantity && quantity !== ""
                    ? "border-l-[3px] border-l-taco-delta bg-emerald-50 border-taco-border"
                    : "border-taco-border",
                ].join(" ")}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-taco-text mb-1.5">
                Harga Satuan
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={[
                  "w-full h-[48px] border rounded-xl px-3 text-[15px] text-taco-text bg-white outline-none focus:border-taco-text",
                  Number(price) !== line.unit_price && price !== ""
                    ? "border-l-[3px] border-l-taco-delta bg-emerald-50 border-taco-border"
                    : "border-taco-border",
                ].join(" ")}
              />
            </div>
          </div>

          {/* Reason required when SKU changed */}
          {skuChanged && (
            <div>
              <label className="block text-[13px] font-medium text-taco-text mb-1.5">
                Alasan koreksi <span className="text-taco-error">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Mis. invoice menulis WLN — sebenarnya Walnut"
                className="w-full border border-taco-border rounded-xl px-3 py-2.5 text-[15px] text-taco-text bg-white outline-none focus:border-taco-text resize-none"
              />
              <div className="text-[11px] text-taco-muted mt-1">
                Sistem belajar dari koreksi Anda untuk meningkatkan akurasi.
              </div>
            </div>
          )}
        </div>

        <div className="px-4 pt-2 pb-4 border-t border-taco-divider flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || busy}
            className="w-full min-h-[52px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors"
          >
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-xl text-[14px] font-medium text-taco-sub bg-white border border-taco-border"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
