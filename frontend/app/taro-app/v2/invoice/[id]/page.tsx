"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AxiosError } from "axios";
import {
  getV2Invoice,
  getV2ImageUrl,
  v2StatusLabel,
  v2IsProcessing,
  confidenceView,
  type InvoiceV2,
  type InvoiceLineItemV2,
  type InvoiceImageV2,
  type ConfidenceTone,
} from "@/lib/v2/invoices";
import { TopBar } from "../../../_components/TopBar";
import { useTaroGuard } from "../../../_components/useTaroGuard";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronLeftIcon,
  ExpandIcon,
  PinIcon,
  SpinnerIcon,
  StoreIcon,
  XCircleIcon,
} from "../../../_components/icons";
import { BottomNavV2 } from "@/components/pwa-v2/BottomNavV2";
import { ImageLightboxV2 } from "@/components/pwa-v2/ImageLightboxV2";

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

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function formatIdr(value: string | number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num(value));
}

function timeFmt(iso?: string) {
  if (!iso) return "—";
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

interface LineView {
  tone: "ok" | "warn" | "err";
  badge: string;
  dot: string;
  title: string;
}

/** Rep-facing classification of one OCR line. The PWA is read-only (resolution
 *  lives in the admin dashboard), so this only summarises what the system read. */
function lineView(li: InvoiceLineItemV2): LineView {
  const cls = li.classification ?? "";
  if (li.is_competitor || li.brand_name) {
    return {
      tone: "ok",
      badge: "Kompetitor",
      dot: "#1D9E75",
      title: li.brand_name ? `Kompetitor · ${li.brand_name}` : "Produk kompetitor",
    };
  }
  if (cls === "unknown_needs_human") {
    return {
      tone: "err",
      badge: "Perlu Review",
      dot: "#D0342C",
      title: "Belum dikenali",
    };
  }
  if (cls.startsWith("not_taco")) {
    return {
      tone: "ok",
      badge: "Non-TACO",
      dot: "#1D9E75",
      title: "Bukan produk TACO",
    };
  }
  // taco_* bucket
  if (li.needs_review) {
    return {
      tone: "warn",
      badge: "Perlu Dicek",
      dot: "#E07B00",
      title: li.raw_text || "Produk TACO",
    };
  }
  return {
    tone: "ok",
    badge: "Yakin",
    dot: "#1D9E75",
    title: li.raw_text || "Produk TACO",
  };
}

/** Tailwind classes for the per-row confidence chip (band + numeric score). */
function confChipCls(tone: ConfidenceTone): string {
  if (tone === "ok") return "bg-emerald-50 text-taco-success border border-emerald-100";
  if (tone === "warn") return "bg-amber-50 text-taco-warning border border-amber-100";
  if (tone === "err") return "bg-red-50 text-taco-error border border-red-100";
  return "bg-taco-page text-taco-sub border border-taco-border";
}

function ImageThumb({
  image,
  onOpen,
}: {
  image: InvoiceImageV2;
  onOpen: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getV2ImageUrl(image.id).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [image.id]);

  if (!url) {
    return (
      <div className="w-16 h-16 rounded-lg bg-taco-page border border-taco-border flex items-center justify-center text-taco-muted shrink-0">
        <StoreIcon size={20} />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      aria-label="Lihat foto invoice"
      className="relative w-16 h-16 rounded-lg bg-taco-page border border-taco-border overflow-hidden shrink-0 active:opacity-80"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Foto invoice" className="w-full h-full object-cover" />
      <span className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-md bg-black/55 text-white flex items-center justify-center pointer-events-none">
        <ExpandIcon size={12} />
      </span>
    </button>
  );
}

export default function TaroV2InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { ready } = useTaroGuard();
  const [invoice, setInvoice] = useState<InvoiceV2 | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const data = await getV2Invoice(id);
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
    setLoading(true);
    refetch();
  }, [ready, refetch]);

  // Poll while the pipeline is still running so rows appear the moment OCR
  // finishes (feedback #3 — spinner while validation/processing runs).
  useEffect(() => {
    if (!ready || !invoice) return;
    if (!v2IsProcessing(invoice.status)) return;
    const t = window.setTimeout(refetch, 3000);
    return () => window.clearTimeout(t);
  }, [ready, invoice, refetch]);

  const lines = useMemo(() => invoice?.line_items ?? [], [invoice]);
  const images = useMemo(() => invoice?.images ?? [], [invoice]);
  const summary = useMemo(() => {
    let yakin = 0;
    let cek = 0;
    let review = 0;
    for (const l of lines) {
      const t = lineView(l).tone;
      if (t === "ok") yakin += 1;
      else if (t === "warn") cek += 1;
      else review += 1;
    }
    return { yakin, cek, review, total: lines.length };
  }, [lines]);

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
              onClick={() => {
                setLoading(true);
                refetch();
              }}
              className="mt-4 px-4 py-2 rounded-lg bg-taco-text text-white text-[14px] font-medium"
            >
              Coba lagi
            </button>
            <button
              type="button"
              onClick={() => router.push("/taro-app/v2/home")}
              className="mt-2 text-[13px] text-taco-sub"
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
        <BottomNavV2 />
      </div>
    );
  }

  const status = invoice.status;
  const processing = v2IsProcessing(status);
  const isDone = status === "done";
  const isNeedsReview = status === "needs_review";
  const isFailed = status === "failed";

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[96px]">
        <TopBar
          title="Detail Invoice"
          right={
            <button
              type="button"
              onClick={() => router.push("/taro-app/v2/home")}
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
              Invoice sudah diproses dan semua baris terkonfirmasi.
            </div>
          </div>
        )}
        {isNeedsReview && (
          <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <span className="text-taco-warning mt-0.5">
              <AlertTriangleIcon size={16} />
            </span>
            <div className="text-[12px] text-taco-text leading-relaxed">
              Hasil OCR sudah masuk. Sebagian baris menunggu review admin sebelum
              dianggap selesai.
            </div>
          </div>
        )}
        {processing && (
          <div className="mx-4 mt-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <span className="text-taco-info mt-0.5 animate-spin">
              <SpinnerIcon size={16} />
            </span>
            <div className="text-[12px] text-taco-info leading-relaxed">
              {status === "validating"
                ? "Memvalidasi foto…"
                : "OCR berjalan…"}{" "}
              hasil akan muncul otomatis.
            </div>
          </div>
        )}
        {isFailed && (
          <div className="mx-4 mt-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <span className="text-taco-error mt-0.5">
              <XCircleIcon size={16} />
            </span>
            <div className="text-[12px] text-taco-error leading-relaxed">
              {invoice.error_message || "Pemrosesan gagal. Coba upload ulang."}
            </div>
          </div>
        )}

        {/* Invoice meta + photos */}
        <div className="bg-white border-b border-taco-divider px-4 py-3 mt-3">
          <div className="flex items-start gap-3">
            {images.length > 0 ? (
              <ImageThumb image={images[0]} onOpen={setPreview} />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-taco-page border border-taco-border flex items-center justify-center text-taco-muted shrink-0">
                <StoreIcon size={22} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-taco-text truncate">
                {invoice.store?.name ?? "Toko Tidak Disebutkan"}
              </div>
              {invoice.area?.name && (
                <div className="text-[12px] text-taco-sub flex items-center gap-1 mt-0.5">
                  <PinIcon size={12} />
                  <span className="truncate">{invoice.area.name}</span>
                </div>
              )}
              <div className="text-[12px] text-taco-muted mt-0.5 truncate">
                Diunggah {timeFmt(invoice.created_at)} ·{" "}
                <span className="font-medium text-taco-sub">
                  {v2StatusLabel(status)}
                </span>
              </div>
            </div>
          </div>

          {/* Extra photos (preview each) */}
          {images.length > 1 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {images.slice(1).map((img) => (
                <ImageThumb key={img.id} image={img} onOpen={setPreview} />
              ))}
            </div>
          )}
        </div>

        {/* OCR summary */}
        {lines.length > 0 && (
          <div className="px-4 pt-3">
            <div className="bg-white border border-taco-border rounded-xl p-3">
              <div className="text-[12px] text-taco-sub mb-2">Ringkasan OCR</div>
              <div className="flex items-center gap-3 text-[13px] flex-wrap">
                <SummaryPill color="bg-taco-success" label="Yakin" value={summary.yakin} />
                <SummaryPill color="bg-taco-warning" label="Perlu Cek" value={summary.cek} />
                <SummaryPill color="bg-taco-error" label="Perlu Review" value={summary.review} />
                <div className="ml-auto text-[12px] text-taco-sub">
                  {summary.total} baris
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Line items — render ALL extracted rows (feedback #3) */}
        <section className="px-4 pt-4 flex-1">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-[15px] font-semibold text-taco-text">
              Item Invoice ({lines.length})
            </h2>
          </div>

          {lines.length === 0 ? (
            <div className="bg-white border border-taco-border rounded-xl p-5 text-center text-[14px] text-taco-muted flex flex-col items-center gap-2">
              {processing ? (
                <>
                  <span className="animate-spin text-taco-info">
                    <SpinnerIcon size={20} />
                  </span>
                  Menunggu hasil OCR…
                </>
              ) : (
                "Belum ada baris terdeteksi."
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {lines.map((li) => {
                const v = lineView(li);
                const leftBorder =
                  v.tone === "err"
                    ? "border-l-[3px] border-l-taco-error"
                    : v.tone === "warn"
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
                          {v.title}
                        </div>
                      </div>
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          background:
                            v.tone === "ok"
                              ? "#ECFDF5"
                              : v.tone === "warn"
                                ? "#FFFBEB"
                                : "#FEF2F2",
                          color: v.dot,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: v.dot }}
                        />
                        {v.badge}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] text-taco-sub">
                        {num(li.quantity)} {li.unit ?? ""}
                      </span>
                      <span className="text-[12px] text-taco-sub">·</span>
                      <span className="text-[12px] text-taco-text font-medium">
                        {formatIdr(li.unit_price)}
                      </span>
                      {num(li.total_price) > 0 && (
                        <span className="ml-auto text-[12px] text-taco-sub">
                          Total {formatIdr(li.total_price)}
                        </span>
                      )}
                    </div>
                    {/* Confidence indicator (band + numeric score) — on EVERY
                        row (KC: was missing on every OCR row). */}
                    {(() => {
                      const c = confidenceView(li);
                      return (
                        <div className="mt-2">
                          <span
                            className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${confChipCls(c.tone)}`}
                          >
                            Keyakinan: {c.text}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Bottom CTA */}
        <div className="px-4 pt-5">
          <button
            type="button"
            onClick={() => router.push("/taro-app/v2/home")}
            className="w-full min-h-[52px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark transition-colors"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>

      <BottomNavV2 />

      {preview && (
        <ImageLightboxV2 src={preview} onClose={() => setPreview(null)} />
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
