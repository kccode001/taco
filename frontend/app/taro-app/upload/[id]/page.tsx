"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AxiosError } from "axios";
import {
  getCompetitorBrands,
  getInvoiceImageUrl,
  getTacoSkus,
  getTaroInvoice,
  resolveInvoiceLineItem,
  updateTaroLineItem,
  type CompetitorBrand,
  type ResolveLineItemResponse,
  type TaroInvoiceDetail,
  type TaroInvoiceLine,
  type TaroInvoiceStatus,
} from "@/lib/api";
import { TopBar } from "../../_components/TopBar";
import { BottomNav } from "../../_components/BottomNav";
import { useTaroGuard } from "../../_components/useTaroGuard";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  PencilIcon,
  PinIcon,
  SearchIcon,
  SpinnerIcon,
  StoreIcon,
  XCircleIcon,
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

type LineKind =
  | "resolved_taco"
  | "resolved_competitor"
  | "resolved_unknown"
  | "perlu_dicek"
  | "belum_cocok";

interface LineResolution {
  kind: LineKind;
  tone: "ok" | "warn" | "err";
  /** Status chip label shown on the card. */
  badge: string;
  dot: string;
  /** What to render as the line's primary title. */
  title: string;
}

// Classify a line into one of the resolution states. The BE truth for whether
// a matched line still needs review is `needs_review` — the resolve endpoint
// clears it (false) once the line is confirmed/matched, so a resolved line
// reads as "Yakin" regardless of its OCR confidence (BUG-1 fix, Scout hard
// gate 2026-06-10). Confidence is only a fallback warn-band signal for
// un-actioned lines whose `needs_review` flag the BE hasn't populated, so
// legacy rows never regress. Explicit resolution fields (brand_id / is_unknown)
// still win outright.
function resolveLine(li: TaroInvoiceLine): LineResolution {
  if (li.brand_id || li.brand_name) {
    return {
      kind: "resolved_competitor",
      tone: "ok",
      badge: "Kompetitor",
      dot: "#1D9E75",
      title: li.brand_name
        ? `Kompetitor · ${li.brand_name}`
        : "Produk kompetitor",
    };
  }
  if (li.is_unknown) {
    return {
      kind: "resolved_unknown",
      tone: "ok",
      badge: "Non-TACO",
      dot: "#1D9E75",
      title: "Bukan produk TACO (tidak diketahui)",
    };
  }
  const hasMatch = !!li.matched_sku_id;
  // BE-authoritative: a cleared flag (false) means resolved regardless of
  // confidence; a set flag (true) means it still needs a look. When the BE
  // omits the flag, fall back to the confidence warn-band.
  const needsReview =
    typeof li.needs_review === "boolean"
      ? li.needs_review
      : confidenceTone(li.confidence).tone === "warn";
  if (hasMatch && needsReview) {
    return {
      kind: "perlu_dicek",
      tone: "warn",
      badge: "Perlu Dicek",
      dot: "#E07B00",
      title: li.matched_sku_name ?? "Perlu dicek",
    };
  }
  if (hasMatch) {
    return {
      kind: "resolved_taco",
      tone: "ok",
      badge: "Yakin",
      dot: "#1D9E75",
      title: li.matched_sku_name ?? "Cocok",
    };
  }
  return {
    kind: "belum_cocok",
    tone: "err",
    badge: "Belum cocok",
    dot: "#D0342C",
    title: "Belum cocok",
  };
}

function isLineResolved(li: TaroInvoiceLine): boolean {
  return resolveLine(li).tone === "ok";
}

// Mirror of the BE recompute rule (invoices.service.ts): every line resolved →
// done/Selesai, otherwise needs_review/Perlu Review. Used for the live badge so
// no full reload is needed. Never overrides in-flight (processing) states.
function recomputeStatus(
  lines: TaroInvoiceLine[],
  current: TaroInvoiceStatus
): TaroInvoiceStatus {
  if (
    current === "processing" ||
    current === "queued" ||
    current === "pending" ||
    current === "failed"
  ) {
    return current;
  }
  if (lines.length === 0) return current;
  return lines.every(isLineResolved) ? "done" : "needs_review";
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
  // Line whose competitor-brand picker sheet is open ("Bukan produk TACO").
  const [classifying, setClassifying] = useState<TaroInvoiceLine | null>(null);
  // id of the line whose "Sudah benar" action is in flight (inline spinner).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Signed image URL — fetched once invoice loads so the browser can render
  // `<img>` without an Authorization header. See BE commit a1b3de77.
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getTaroInvoice(id);
      const data = res.data as TaroInvoiceDetail | null;
      if (data && data.id) {
        // Belt-and-suspenders: recompute the invoice-level status from the live
        // line items on initial load — same rule used post-mutation — so the
        // banner, per-line badges, and summary count agree on first render. If a
        // stray "done" payload still carries needs_review lines (e.g. before
        // Grout's seed fix lands), the FE corrects to needs_review instead of
        // contradicting itself. recomputeStatus is a no-op for in-flight
        // (processing/queued/pending/failed) states.
        setInvoice({
          ...data,
          status: recomputeStatus(data.line_items ?? [], data.status),
        });
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

  // Fetch a fresh signed image URL once the invoice resolves. Token is valid
  // for 15min — long enough for a review session.
  useEffect(() => {
    if (!invoice?.id) return;
    let cancelled = false;
    setImageUrl(null);
    (async () => {
      try {
        const url = await getInvoiceImageUrl(invoice.id);
        if (!cancelled) setImageUrl(url);
      } catch (e) {
        if (!cancelled) console.error("Failed to load signed image URL", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoice?.id]);

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
      const t = resolveLine(l);
      if (t.tone === "ok") yakin += 1;
      else if (t.tone === "warn") perluCek += 1;
      else perluReview += 1;
    }
    return { yakin, perluCek, perluReview, total: lines.length };
  }, [invoice]);

  const applyLineUpdate = (updated: TaroInvoiceLine) => {
    setInvoice((inv) => {
      if (!inv) return inv;
      const line_items = inv.line_items.map((li) =>
        li.id === updated.id ? updated : li
      );
      return {
        ...inv,
        line_items,
        status: recomputeStatus(line_items, inv.status),
      };
    });
  };

  // Merge a resolution into local state and reflect the invoice status badge
  // live (AC-5). Prefers the BE-returned status, falling back to the local
  // recompute so the badge updates even if the field is absent.
  const applyResolution = (
    lineId: string,
    patch: Partial<TaroInvoiceLine>,
    resp?: ResolveLineItemResponse
  ) => {
    setInvoice((inv) => {
      if (!inv) return inv;
      const line_items = inv.line_items.map((li) =>
        li.id === lineId ? { ...li, ...patch } : li
      );
      const serverStatus =
        resp?.invoice_status ?? resp?.status ?? resp?.invoice?.status;
      const status =
        serverStatus ?? recomputeStatus(line_items, inv.status);
      return { ...inv, line_items, status };
    });
  };

  // "Sudah benar" — accept the current match as-is for a "Perlu dicek" line.
  const handleConfirmAsIs = async (li: TaroInvoiceLine) => {
    setConfirmingId(li.id);
    setActionError(null);
    try {
      const res = await resolveInvoiceLineItem(li.id, { confirm_as_is: true });
      applyResolution(
        li.id,
        {
          // Mirror the BE: "Sudah benar" clears needs_review, which is the
          // authoritative resolved signal the classifier reads. This persists
          // across reload (BE returns needs_review=false), unlike the old
          // in-session confidence bump that BUG-1 flagged.
          needs_review: false,
        },
        res.data
      );
    } catch (err) {
      setActionError(
        `Gagal menandai "Sudah benar": ${extractErrorMessage(err)}`
      );
    } finally {
      setConfirmingId(null);
    }
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
  const reviewCount = summary.perluCek + summary.perluReview;

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

        {/* Status banners — status-aware */}
        {isDone && (
          <div className="mx-4 mt-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <span className="text-taco-success mt-0.5">
              <CheckIcon size={16} />
            </span>
            <div className="text-[12px] text-taco-text leading-relaxed">
              Invoice ini sudah diproses dan semua baris terkonfirmasi pada{" "}
              {timeFmt(invoice.uploaded_at)}. Edit baris masih bisa dilakukan.
            </div>
          </div>
        )}
        {isNeedsReview && (
          <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <span className="text-taco-warning mt-0.5">
              <AlertTriangleIcon size={16} />
            </span>
            <div className="text-[12px] text-taco-text leading-relaxed">
              Invoice butuh review. <strong>{reviewCount}</strong> dari{" "}
              <strong>{summary.total}</strong> baris perlu dicek manual sebelum
              dianggap selesai.
            </div>
          </div>
        )}
        {isProcessing && (
          <div className="mx-4 mt-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <span className="text-taco-info mt-0.5 animate-spin">
              <SpinnerIcon size={16} />
            </span>
            <div className="text-[12px] text-taco-info leading-relaxed">
              OCR berjalan… hasil akan muncul otomatis.
            </div>
          </div>
        )}
        {isFailed && (
          <div className="mx-4 mt-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <span className="text-taco-error mt-0.5">
              <XCircleIcon size={16} />
            </span>
            <div className="text-[12px] text-taco-error leading-relaxed">
              OCR gagal. Coba upload ulang.
            </div>
          </div>
        )}

        {/* Invoice meta */}
        <div className="bg-white border-b border-taco-divider px-4 py-3 mt-3">
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 rounded-lg bg-taco-page border border-taco-border flex items-center justify-center text-taco-muted flex-shrink-0 overflow-hidden">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
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
            <div className="flex items-center gap-3 text-[13px] flex-wrap">
              <SummaryPill
                color="bg-taco-success"
                label="Yakin"
                value={summary.yakin}
              />
              <SummaryPill
                color="bg-taco-warning"
                label="Perlu Cek"
                value={summary.perluCek}
              />
              <SummaryPill
                color="bg-taco-error"
                label="Perlu Review"
                value={summary.perluReview}
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
          {actionError && (
            <div className="mb-2 text-[12px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-2">
              <span className="mt-0.5">
                <XCircleIcon size={14} />
              </span>
              <span className="flex-1">{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                aria-label="Tutup"
                className="text-taco-error/70"
              >
                <CloseIcon size={14} />
              </button>
            </div>
          )}
          {lines.length === 0 ? (
            <div className="bg-white border border-taco-border rounded-xl p-5 text-center text-[14px] text-taco-muted">
              {isProcessing
                ? "Menunggu hasil OCR…"
                : "Belum ada baris terdeteksi."}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {lines.map((li) => {
                const r = resolveLine(li);
                const leftBorder =
                  r.tone === "err"
                    ? "border-l-[3px] border-l-taco-error"
                    : r.tone === "warn"
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
                          {r.title}
                        </div>
                        {li.matched_sku_code &&
                          r.kind !== "resolved_competitor" &&
                          r.kind !== "resolved_unknown" && (
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
                            r.tone === "ok"
                              ? "#ECFDF5"
                              : r.tone === "warn"
                                ? "#FFFBEB"
                                : "#FEF2F2",
                          color: r.dot,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: r.dot }}
                        />
                        {r.badge}
                      </span>
                      <span className="text-[12px] text-taco-sub">
                        {li.quantity} {li.unit}
                      </span>
                      <span className="text-[12px] text-taco-sub">·</span>
                      <span className="text-[12px] text-taco-text font-medium">
                        {formatIdr(li.unit_price)}
                      </span>
                      {r.kind !== "resolved_competitor" &&
                        r.kind !== "resolved_unknown" && (
                          <span className="ml-auto text-[12px] text-taco-sub">
                            {Math.round(li.confidence * 100)}%
                          </span>
                        )}
                    </div>

                    {/* Resolution actions — state-specific */}
                    {r.kind === "belum_cocok" && (
                      <div className="mt-2.5 pt-2.5 border-t border-taco-divider">
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setClassifying(li);
                          }}
                          className="w-full min-h-[44px] rounded-xl border border-taco-border bg-taco-page text-[14px] font-medium text-taco-text active:bg-taco-divider flex items-center justify-center gap-1.5"
                        >
                          <XCircleIcon size={16} />
                          Bukan produk TACO
                        </button>
                      </div>
                    )}
                    {r.kind === "perlu_dicek" && (
                      <div className="mt-2.5 pt-2.5 border-t border-taco-divider grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(li)}
                          className="min-h-[44px] rounded-xl border border-taco-border bg-white text-[14px] font-medium text-taco-text active:bg-taco-page flex items-center justify-center gap-1.5"
                        >
                          <PencilIcon size={15} />
                          Edit SKU
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmAsIs(li)}
                          disabled={confirmingId === li.id}
                          className="min-h-[44px] rounded-xl bg-taco-success text-white text-[14px] font-semibold active:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {confirmingId === li.id ? (
                            <span className="animate-spin">
                              <SpinnerIcon size={15} />
                            </span>
                          ) : (
                            <CheckIcon size={15} />
                          )}
                          Sudah benar
                        </button>
                      </div>
                    )}
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
              className="w-full min-h-[52px] rounded-xl bg-taco-page text-taco-info border border-blue-100 font-semibold text-[16px] flex items-center justify-center gap-2"
            >
              <span className="animate-spin">
                <SpinnerIcon size={16} />
              </span>
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
            <div className="space-y-2">
              <button
                type="button"
                disabled
                title="Selesaikan semua baris yang masih perlu review terlebih dahulu"
                className="w-full min-h-[52px] rounded-xl bg-taco-page text-taco-warning border border-amber-200 font-semibold text-[16px] flex items-center justify-center gap-2 cursor-not-allowed opacity-90"
              >
                <AlertTriangleIcon size={16} />
                <span>Tandai Selesai ({reviewCount} baris belum siap)</span>
              </button>
              <div className="text-center text-[11px] text-taco-sub">
                Edit baris bertanda <strong>Perlu Review</strong> di atas untuk
                mengaktifkan tombol ini.
              </div>
            </div>
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

      {classifying && (
        <CompetitorPickerSheet
          line={classifying}
          onClose={() => setClassifying(null)}
          onResolved={(patch, resp) => {
            applyResolution(classifying.id, patch, resp);
            setClassifying(null);
          }}
          onError={(msg) => {
            setActionError(msg);
            setClassifying(null);
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
        // Setting the match clears needs_review on the BE — reflect that as the
        // resolved signal so the line reads "Yakin" and survives reload.
        needs_review: false,
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

// "Bukan produk TACO" — competitor brand picker. Pure tap-list (no text input,
// so no on-screen keyboard) + a "Tidak diketahui" (Unknown) escape hatch.
function CompetitorPickerSheet({
  line,
  onClose,
  onResolved,
  onError,
}: {
  line: TaroInvoiceLine;
  onClose: () => void;
  onResolved: (
    patch: Partial<TaroInvoiceLine>,
    resp?: ResolveLineItemResponse
  ) => void;
  onError: (msg: string) => void;
}) {
  const [brands, setBrands] = useState<CompetitorBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The pending selection: a brand id, or "unknown", or null when idle.
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getCompetitorBrands();
        const raw =
          ((res.data as { data?: CompetitorBrand[] })?.data ??
            (res.data as CompetitorBrand[])) ?? [];
        // Active only, name-sorted (BE already sorts, but be defensive).
        const active = raw
          .filter((b) => b.is_active !== false)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setBrands(active);
      } catch (err) {
        if (!cancelled)
          setLoadError(
            `Tidak bisa memuat daftar merek: ${extractErrorMessage(err)}`
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickBrand = async (brand: CompetitorBrand) => {
    if (busyKey) return;
    setBusyKey(brand.id);
    try {
      const res = await resolveInvoiceLineItem(line.id, { brand_id: brand.id });
      onResolved(
        {
          brand_id: brand.id,
          brand_name: brand.name,
          is_unknown: false,
          needs_review: false,
        },
        res.data
      );
    } catch (err) {
      setBusyKey(null);
      onError(`Gagal menyimpan merek: ${extractErrorMessage(err)}`);
    }
  };

  const pickUnknown = async () => {
    if (busyKey) return;
    setBusyKey("unknown");
    try {
      const res = await resolveInvoiceLineItem(line.id, { is_unknown: true });
      onResolved(
        {
          is_unknown: true,
          brand_id: null,
          brand_name: null,
          needs_review: false,
        },
        res.data
      );
    } catch (err) {
      setBusyKey(null);
      onError(`Gagal menyimpan: ${extractErrorMessage(err)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="bg-white w-full phone-shell rounded-t-2xl max-h-[85vh] flex flex-col">
        <div className="px-4 pt-3 pb-2 border-b border-taco-divider flex items-center justify-between">
          <div>
            <div className="text-[16px] font-semibold text-taco-text">
              Bukan produk TACO
            </div>
            <div className="text-[12px] text-taco-sub mt-0.5">
              Baris #{line.line_no} · pilih merek kompetitor
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busyKey}
            aria-label="Tutup"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-taco-sub hover:bg-taco-page disabled:opacity-40"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1">
          <div className="bg-taco-page border border-taco-divider rounded-lg px-3 py-2 mb-3">
            <div className="text-[11px] uppercase tracking-wider text-taco-muted font-semibold">
              Teks OCR
            </div>
            <div className="text-[14px] text-taco-text mt-0.5">
              {line.raw_text}
            </div>
          </div>

          {loading ? (
            <div className="py-8 flex items-center justify-center text-[13px] text-taco-muted gap-2">
              <span className="animate-spin">
                <SpinnerIcon size={16} />
              </span>
              Memuat merek…
            </div>
          ) : loadError ? (
            <div className="text-[13px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              {loadError}
            </div>
          ) : (
            <>
              <div className="text-[13px] font-medium text-taco-text mb-1.5">
                Merek kompetitor
              </div>
              <div className="border border-taco-divider rounded-xl divide-y divide-taco-divider overflow-hidden">
                {brands.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-taco-muted">
                    Belum ada merek aktif.
                  </div>
                ) : (
                  brands.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => pickBrand(b)}
                      disabled={!!busyKey}
                      className="w-full text-left px-3 min-h-[52px] flex items-center justify-between gap-2 bg-white active:bg-taco-page disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <div className="text-[15px] text-taco-text truncate">
                          {b.name}
                        </div>
                        {b.country && (
                          <div className="text-[11px] text-taco-sub truncate">
                            {b.country}
                          </div>
                        )}
                      </div>
                      {busyKey === b.id && (
                        <span className="animate-spin text-taco-sub flex-shrink-0">
                          <SpinnerIcon size={16} />
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={pickUnknown}
                disabled={!!busyKey}
                className="mt-3 w-full min-h-[52px] rounded-xl border border-dashed border-taco-border bg-taco-page text-[14px] font-medium text-taco-text active:bg-taco-divider disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busyKey === "unknown" ? (
                  <span className="animate-spin">
                    <SpinnerIcon size={16} />
                  </span>
                ) : (
                  <AlertTriangleIcon size={16} />
                )}
                Tidak diketahui
              </button>
              <div className="text-[11px] text-taco-muted mt-1.5 text-center">
                Pilih ini bila merek kompetitor tidak jelas.
              </div>
            </>
          )}
        </div>

        <div className="px-4 pt-2 pb-4 border-t border-taco-divider">
          <button
            type="button"
            onClick={onClose}
            disabled={!!busyKey}
            className="w-full min-h-[44px] rounded-xl text-[14px] font-medium text-taco-sub bg-white border border-taco-border disabled:opacity-40"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
