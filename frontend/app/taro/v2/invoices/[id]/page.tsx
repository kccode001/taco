"use client";

/** TACO v2 — Admin invoice detail + line-item resolution (Pair A FE, Tile).
 *  Copy-and-ADAPTED from the v1 PWA resolve UI (`app/taro-app/upload/[id]/page.tsx`)
 *  — the v1 original is FROZEN and untouched. Differences vs v1:
 *   - lines carry the 9-bucket `classification` enum (not a confidence-derived kind);
 *   - resolve hits the v2 contract `PATCH /api/v2/invoice-line-items/:id`
 *     ({ matched_sku_id, reason } | { brand_id, is_competitor } | { is_competitor } );
 *   - adds the `mismatch_reason` capture when the admin flips a line across the
 *     TACO ↔ not-TACO boundary (feeds the recommendation engine);
 *   - desktop-first (lives under Mosaic's `taro/v2` admin layout), not the PWA shell.
 *  Reuses the shared catalog endpoints (taco-skus, competitor-brands) since v2
 *  line items reference the same TacoSku / CompetitorBrand tables. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AxiosError } from "axios";
import {
  getCompetitorBrands,
  getTacoSkus,
  type CompetitorBrand,
} from "@/lib/api";
import {
  getV2Invoice,
  getV2ImageUrl,
  patchV2LineItem,
  readInvoiceStatus,
  type InvoiceV2,
  type InvoiceLineItemV2,
  type InvoiceV2Status,
  type LineClassificationV2,
} from "@/lib/v2/invoices";

interface TacoSkuRow {
  id: string;
  code: string;
  name: string;
}

// ── Classification helpers (9-bucket taxonomy) ─────────────────────────────
type Family = "taco" | "not_taco" | "unknown";

function classFamily(c: LineClassificationV2): Family {
  if (c.startsWith("taco_")) return "taco";
  if (c.startsWith("not_taco_")) return "not_taco";
  return "unknown";
}

/** Review queue = low_verify + unreadable_guess + unknown. */
function isReviewBucket(c: LineClassificationV2): boolean {
  return (
    c.endsWith("low_verify") ||
    c.endsWith("unreadable_guess") ||
    c === "unknown_needs_human"
  );
}

const CLASS_LABEL: Record<LineClassificationV2, string> = {
  taco_very_high: "TACO · sangat yakin",
  taco_high: "TACO · yakin",
  taco_low_verify: "TACO · perlu cek",
  taco_unreadable_guess: "TACO · tidak terbaca",
  not_taco_very_high: "Bukan TACO · sangat yakin",
  not_taco_high: "Bukan TACO · yakin",
  not_taco_low_verify: "Bukan TACO · perlu cek",
  not_taco_unreadable_guess: "Bukan TACO · tidak terbaca",
  unknown_needs_human: "Tidak diketahui · perlu manusia",
};

type Tone = "ok" | "warn" | "neutral";

interface LineDisplay {
  tone: Tone;
  badge: string;
  title: string;
  family: Family;
  /** still in the review queue and not yet explicitly resolved by an admin */
  needsHuman: boolean;
}

function lineDisplay(li: InvoiceLineItemV2): LineDisplay {
  const family = classFamily(li.classification);
  if (li.matched_sku_id) {
    return {
      tone: "ok",
      badge: "TACO",
      title: li.matched_sku?.name ?? li.matched_sku?.code ?? "Produk TACO",
      family,
      needsHuman: false,
    };
  }
  if (li.is_competitor) {
    if (li.brand_id || li.brand_name) {
      return {
        tone: "ok",
        badge: "Kompetitor",
        title: li.brand_name
          ? `Kompetitor · ${li.brand_name}`
          : "Produk kompetitor",
        family,
        needsHuman: false,
      };
    }
    return {
      tone: "ok",
      badge: "Non-TACO",
      title: "Bukan produk TACO (tidak diketahui)",
      family,
      needsHuman: false,
    };
  }
  // No explicit admin resolution yet — drive off the classification bucket.
  if (isReviewBucket(li.classification)) {
    return {
      tone: "warn",
      badge: "Perlu Dicek",
      title: CLASS_LABEL[li.classification],
      family,
      needsHuman: true,
    };
  }
  // Auto-accepted (very/high) — resolved, but still editable.
  return {
    tone: family === "taco" ? "ok" : "neutral",
    badge: family === "taco" ? "TACO (auto)" : "Bukan TACO (auto)",
    title: CLASS_LABEL[li.classification],
    family,
    needsHuman: false,
  };
}

function isResolvedLine(li: InvoiceLineItemV2): boolean {
  return !lineDisplay(li).needsHuman;
}

/** Fallback for the header badge when the BE doesn't echo a status — every line
 *  resolved → done, else needs_review. Never overrides in-flight states. */
function recomputeStatus(
  lines: InvoiceLineItemV2[],
  current: InvoiceV2Status
): InvoiceV2Status {
  if (
    current === "validating" ||
    current === "ocr_processing" ||
    current === "failed"
  )
    return current;
  if (lines.length === 0) return current;
  return lines.every(isResolvedLine) ? "done" : "needs_review";
}

const STATUS_META: Record<
  InvoiceV2Status,
  { label: string; cls: string }
> = {
  validating: {
    label: "Validasi",
    cls: "bg-blue-50 text-taco-info border-blue-100",
  },
  ocr_processing: {
    label: "Proses OCR",
    cls: "bg-blue-50 text-taco-info border-blue-100",
  },
  needs_review: {
    label: "Perlu Review",
    cls: "bg-amber-50 text-taco-warning border-amber-100",
  },
  done: {
    label: "Selesai",
    cls: "bg-emerald-50 text-taco-success border-emerald-100",
  },
  failed: {
    label: "Gagal",
    cls: "bg-red-50 text-taco-error border-red-100",
  },
};

function toneChipCls(tone: Tone): string {
  if (tone === "ok") return "bg-emerald-50 text-taco-success border-emerald-100";
  if (tone === "warn") return "bg-amber-50 text-taco-warning border-amber-100";
  return "bg-taco-page text-taco-sub border-taco-border";
}

function formatIdr(value?: number | string | null) {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as
      | { message?: string | string[]; error?: string }
      | undefined;
    const msg = data?.message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string") return msg;
    if (data?.error) return data.error;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Terjadi kesalahan tidak diketahui.";
}

// ───────────────────────────────────────────────────────────────────────────
export default function AdminV2InvoiceDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  const [invoice, setInvoice] = useState<InvoiceV2 | null>(null);
  const [lines, setLines] = useState<InvoiceLineItemV2[]>([]);
  const [status, setStatus] = useState<InvoiceV2Status>("needs_review");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<InvoiceLineItemV2 | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const inv = await getV2Invoice(id);
      if (!inv) {
        setError("Invoice tidak ditemukan.");
        return;
      }
      setInvoice(inv);
      const ls = inv.line_items ?? [];
      setLines(ls);
      // Recompute on load so the header never contradicts the line states.
      setStatus(recomputeStatus(ls, inv.status));
      // Images are served behind JWT — resolve a signed URL per image so the
      // <img> tags can load them. BE findOne returns file_path, not a URL.
      const imgs = inv.images ?? [];
      if (imgs.length > 0) {
        const urls = await Promise.all(
          imgs.map((img) => (img.url ? Promise.resolve(img.url) : getV2ImageUrl(img.id)))
        );
        setInvoice((prev) =>
          prev
            ? {
                ...prev,
                images: (prev.images ?? []).map((img, i) => ({
                  ...img,
                  url: urls[i] ?? img.url ?? null,
                })),
              }
            : prev
        );
      }
    } catch (err) {
      setError(`Gagal memuat invoice: ${extractErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  // Apply a resolved line + recomputed status without a full reload.
  const applyResolved = useCallback(
    (lineId: string, patch: Partial<InvoiceLineItemV2>, next?: InvoiceV2Status) => {
      setLines((prev) => {
        const updated = prev.map((l) =>
          l.id === lineId ? { ...l, ...patch } : l
        );
        setStatus(next ?? recomputeStatus(updated, status));
        return updated;
      });
      setEditing(null);
    },
    [status]
  );

  const summary = useMemo(() => {
    const total = lines.length;
    const open = lines.filter((l) => lineDisplay(l).needsHuman).length;
    return { total, open, ready: total - open };
  }, [lines]);

  const statusMeta = STATUS_META[status] ?? STATUS_META.needs_review;
  const images = invoice?.images ?? [];

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/taro/v2/invoices"
            className="text-[13px] text-taco-sub hover:text-taco-text inline-flex items-center gap-1"
          >
            ← Kembali ke Antrian Invoice
          </Link>
          <h1 className="text-[20px] font-semibold text-taco-text mt-1">
            Invoice #{id.slice(0, 8)}
          </h1>
          {invoice && (
            <div className="text-[13px] text-taco-sub mt-0.5">
              {invoice.store?.name ?? invoice.store_name ?? "Toko —"} ·{" "}
              {invoice.area?.name ?? invoice.area_name ?? "Area —"}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[12px] font-medium px-3 py-1.5 rounded-full border ${statusMeta.cls}`}
          >
            {statusMeta.label}
          </span>
          <button
            type="button"
            onClick={load}
            className="text-[13px] font-medium px-3 py-1.5 rounded-lg border border-taco-border bg-white text-taco-sub hover:bg-taco-page"
          >
            Muat ulang
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 text-[13px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!loading && invoice && (
        <div className="mt-5 bg-white border border-taco-border rounded-xl p-5">
          <div className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider mb-3">
            Ringkasan Invoice
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6 text-[13px]">
            <div>
              <div className="text-taco-muted text-[12px]">Toko</div>
              <div className="text-taco-text font-medium mt-0.5">
                {invoice.store?.name ?? invoice.store_name ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-taco-muted text-[12px]">Area</div>
              <div className="text-taco-text font-medium mt-0.5">
                {invoice.area?.name ?? invoice.area_name ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-taco-muted text-[12px]">Diunggah oleh</div>
              <div className="text-taco-text font-medium mt-0.5">
                {invoice.uploaded_by_name ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-taco-muted text-[12px]">Tanggal upload</div>
              <div className="text-taco-text font-medium mt-0.5">
                {invoice.created_at
                  ? new Date(invoice.created_at).toLocaleString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-taco-muted text-[12px]">Total baris</div>
              <div className="text-taco-text font-semibold mt-0.5">
                {summary.total}
              </div>
            </div>
            <div>
              <div className="text-taco-muted text-[12px]">Perlu review</div>
              <div
                className={`font-semibold mt-0.5 ${
                  summary.open > 0 ? "text-taco-warning" : "text-taco-text"
                }`}
              >
                {summary.open}
              </div>
            </div>
            <div>
              <div className="text-taco-muted text-[12px]">Siap</div>
              <div className="text-taco-success font-semibold mt-0.5">
                {summary.ready}/{summary.total}
              </div>
            </div>
            <div>
              <div className="text-taco-muted text-[12px]">Total nilai</div>
              <div className="text-taco-text font-semibold mt-0.5">
                {formatIdr(invoice.total_amount)}
              </div>
            </div>
          </div>
          {invoice.error_message && (
            <div className="mt-3 text-[12px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {invoice.error_message}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="mt-8 text-[13px] text-taco-muted">Memuat invoice…</div>
      ) : (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left: images */}
          <div className="space-y-3">
            <div className="text-[13px] font-medium text-taco-sub">
              Foto Invoice ({images.length})
            </div>
            {images.length === 0 ? (
              <div className="text-[13px] text-taco-muted bg-white border border-taco-border rounded-xl px-4 py-6 text-center">
                Tidak ada gambar.
              </div>
            ) : (
              <div className="space-y-3">
                {images.map((img) =>
                  img.url ? (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setZoomUrl(img.url ?? null)}
                      className="block w-full group relative"
                      title="Klik untuk perbesar"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={img.file_name ?? "invoice"}
                        className="w-full rounded-xl border border-taco-border bg-white object-contain group-hover:border-taco-text transition-colors"
                      />
                      <span className="absolute bottom-2 right-2 text-[11px] bg-black/60 text-white px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        Perbesar
                      </span>
                    </button>
                  ) : (
                    <div
                      key={img.id}
                      className="text-[12px] text-taco-muted bg-white border border-taco-border rounded-xl px-4 py-6 text-center"
                    >
                      {img.file_name ?? "Gambar"} — pratinjau tidak tersedia
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Right: line items */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-[13px] font-medium text-taco-sub">
                Baris Invoice ({summary.total})
              </div>
              <div className="text-[12px] text-taco-muted">
                {summary.open} perlu review · {summary.ready}/{summary.total} siap
              </div>
            </div>

            {lines.length === 0 ? (
              <div className="text-[13px] text-taco-muted bg-white border border-taco-border rounded-xl px-4 py-8 text-center">
                Belum ada baris. Jalankan OCR atau tunggu proses selesai.
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((li) => {
                  const d = lineDisplay(li);
                  return (
                    <div
                      key={li.id}
                      className={`bg-white border rounded-xl p-3.5 ${
                        d.needsHuman ? "border-amber-200" : "border-taco-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${toneChipCls(
                                d.tone
                              )}`}
                            >
                              {d.badge}
                            </span>
                            {li.line_no != null && (
                              <span className="text-[11px] text-taco-muted">
                                #{li.line_no}
                              </span>
                            )}
                          </div>
                          <div className="text-[14px] font-medium text-taco-text mt-1.5 truncate">
                            {d.title}
                          </div>
                          <div className="text-[12px] text-taco-sub mt-0.5 line-clamp-2">
                            <span className="text-taco-muted">OCR:</span>{" "}
                            {li.raw_text}
                          </div>
                          {(li.quantity != null || li.unit_price != null) && (
                            <div className="text-[12px] text-taco-muted mt-1">
                              {li.quantity ?? "—"} {li.unit ?? ""} ·{" "}
                              {formatIdr(li.unit_price)}
                            </div>
                          )}
                          {li.mismatch_reason && (
                            <div className="text-[11px] text-taco-sub mt-1.5 bg-taco-page border border-taco-divider rounded-md px-2 py-1">
                              <span className="text-taco-muted">Alasan:</span>{" "}
                              {li.mismatch_reason}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditing(li)}
                          className="text-[13px] font-medium px-3 py-2 rounded-lg border border-taco-border bg-white text-taco-text hover:bg-taco-page shrink-0"
                        >
                          {d.needsHuman ? "Resolusi" : "Edit"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <ResolveModal
          line={editing}
          onClose={() => setEditing(null)}
          onResolved={applyResolved}
        />
      )}

      {zoomUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setZoomUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomUrl}
            alt="Invoice diperbesar"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setZoomUrl(null)}
            aria-label="Tutup"
            className="fixed top-5 right-6 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white text-[20px] leading-none flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ── Resolve modal ───────────────────────────────────────────────────────────
function ResolveModal({
  line,
  onClose,
  onResolved,
}: {
  line: InvoiceLineItemV2;
  onClose: () => void;
  onResolved: (
    lineId: string,
    patch: Partial<InvoiceLineItemV2>,
    next?: InvoiceV2Status
  ) => void;
}) {
  const systemFamily = classFamily(line.classification);
  const initialTab: "taco" | "competitor" =
    line.is_competitor || systemFamily === "not_taco" ? "competitor" : "taco";

  const [tab, setTab] = useState<"taco" | "competitor">(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // TACO tab
  const [skus, setSkus] = useState<TacoSkuRow[]>([]);
  const [skuSearch, setSkuSearch] = useState("");
  const [selectedSku, setSelectedSku] = useState<TacoSkuRow | null>(null);

  // Competitor tab
  const [brands, setBrands] = useState<CompetitorBrand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);

  // Mismatch reason — required only when the admin's action flips the line
  // across the TACO ↔ not-TACO boundary the system predicted.
  const [mismatchReason, setMismatchReason] = useState("");

  // Close on Esc (state-driven; no history funnel — avoids the v1 BUG-6 trap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load SKUs when the TACO tab is first needed.
  useEffect(() => {
    if (tab !== "taco" || skus.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getTacoSkus();
        const data =
          ((res.data as { data?: TacoSkuRow[] })?.data ??
            (res.data as TacoSkuRow[])) ?? [];
        if (!cancelled) {
          setSkus(data);
          if (line.matched_sku_id) {
            const cur = data.find((s) => s.id === line.matched_sku_id);
            if (cur) setSelectedSku(cur);
          }
        }
      } catch (err) {
        if (!cancelled)
          setError(`Tidak bisa memuat SKU: ${extractErrorMessage(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, skus.length, line.matched_sku_id]);

  // Load brands when the competitor tab is first needed.
  useEffect(() => {
    if (tab !== "competitor" || brands.length > 0) return;
    let cancelled = false;
    setBrandsLoading(true);
    (async () => {
      try {
        const res = await getCompetitorBrands();
        const raw =
          ((res.data as { data?: CompetitorBrand[] })?.data ??
            (res.data as CompetitorBrand[])) ?? [];
        const active = raw
          .filter((b) => b.is_active !== false)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setBrands(active);
      } catch (err) {
        if (!cancelled)
          setError(`Tidak bisa memuat merek: ${extractErrorMessage(err)}`);
      } finally {
        if (!cancelled) setBrandsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, brands.length]);

  const filteredSkus = useMemo(() => {
    if (!skuSearch.trim()) return skus.slice(0, 15);
    const q = skuSearch.toLowerCase();
    return skus
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [skus, skuSearch]);

  // A flip happens when the chosen action disagrees with the system family.
  const tacoIsFlip = systemFamily === "not_taco" || systemFamily === "unknown";
  const competitorIsFlip = systemFamily === "taco";

  const finish = (
    patch: Partial<InvoiceLineItemV2>,
    next?: InvoiceV2Status
  ) => onResolved(line.id, patch, next);

  const saveAsTaco = async () => {
    if (!selectedSku || busyKey) return;
    if (tacoIsFlip && !mismatchReason.trim()) {
      setError("Isi alasan: sistem mengira ini bukan TACO.");
      return;
    }
    setBusyKey("taco");
    setError(null);
    try {
      const resp = await patchV2LineItem(line.id, {
        matched_sku_id: selectedSku.id,
        reason: tacoIsFlip
          ? mismatchReason.trim()
          : "Dipetakan oleh admin.",
        ...(tacoIsFlip ? { mismatch_reason: mismatchReason.trim() } : {}),
      });
      finish(
        {
          matched_sku_id: selectedSku.id,
          matched_sku: { id: selectedSku.id, code: selectedSku.code, name: selectedSku.name },
          brand_id: null,
          brand_name: null,
          is_competitor: false,
          ...(tacoIsFlip ? { mismatch_reason: mismatchReason.trim() } : {}),
        },
        readInvoiceStatus(resp)
      );
    } catch (err) {
      setBusyKey(null);
      setError(`Gagal menyimpan: ${extractErrorMessage(err)}`);
    }
  };

  const pickBrand = async (brand: CompetitorBrand) => {
    if (busyKey) return;
    if (competitorIsFlip && !mismatchReason.trim()) {
      setError("Isi alasan: sistem mengira ini produk TACO.");
      return;
    }
    setBusyKey(brand.id);
    setError(null);
    try {
      const resp = await patchV2LineItem(line.id, {
        brand_id: brand.id,
        is_competitor: true,
        ...(competitorIsFlip ? { mismatch_reason: mismatchReason.trim() } : {}),
      });
      finish(
        {
          brand_id: brand.id,
          brand_name: brand.name,
          is_competitor: true,
          matched_sku_id: null,
          matched_sku: null,
          ...(competitorIsFlip ? { mismatch_reason: mismatchReason.trim() } : {}),
        },
        readInvoiceStatus(resp)
      );
    } catch (err) {
      setBusyKey(null);
      setError(`Gagal menyimpan merek: ${extractErrorMessage(err)}`);
    }
  };

  const pickUnknown = async () => {
    if (busyKey) return;
    if (competitorIsFlip && !mismatchReason.trim()) {
      setError("Isi alasan: sistem mengira ini produk TACO.");
      return;
    }
    setBusyKey("unknown");
    setError(null);
    try {
      const resp = await patchV2LineItem(line.id, {
        is_competitor: true,
        ...(competitorIsFlip ? { mismatch_reason: mismatchReason.trim() } : {}),
      });
      finish(
        {
          is_competitor: true,
          brand_id: null,
          brand_name: null,
          matched_sku_id: null,
          matched_sku: null,
          ...(competitorIsFlip ? { mismatch_reason: mismatchReason.trim() } : {}),
        },
        readInvoiceStatus(resp)
      );
    } catch (err) {
      setBusyKey(null);
      setError(`Gagal menyimpan: ${extractErrorMessage(err)}`);
    }
  };

  const showFlipReason =
    (tab === "taco" && tacoIsFlip) ||
    (tab === "competitor" && competitorIsFlip);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-taco-divider flex items-start justify-between">
          <div>
            <div className="text-[16px] font-semibold text-taco-text">
              Resolusi Baris {line.line_no != null ? `#${line.line_no}` : ""}
            </div>
            <div className="text-[12px] text-taco-sub mt-0.5">
              Prediksi sistem: {CLASS_LABEL[line.classification]}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busyKey}
            aria-label="Tutup"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-taco-sub hover:bg-taco-page disabled:opacity-40 text-[18px] leading-none"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
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

          {/* Tab switch */}
          <div className="grid grid-cols-2 gap-1 bg-taco-page border border-taco-border rounded-xl p-1">
            <button
              type="button"
              onClick={() => {
                setTab("taco");
                setError(null);
              }}
              className={`min-h-[40px] rounded-lg text-[13px] font-medium transition-colors ${
                tab === "taco"
                  ? "bg-white text-taco-text shadow-sm"
                  : "text-taco-sub"
              }`}
            >
              Produk TACO
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("competitor");
                setError(null);
              }}
              className={`min-h-[40px] rounded-lg text-[13px] font-medium transition-colors ${
                tab === "competitor"
                  ? "bg-white text-taco-text shadow-sm"
                  : "text-taco-sub"
              }`}
            >
              Kompetitor
            </button>
          </div>

          {/* Mismatch reason (shown on a TACO↔not-TACO flip) */}
          {showFlipReason && (
            <div>
              <label className="block text-[13px] font-medium text-taco-text mb-1.5">
                Alasan koreksi <span className="text-taco-error">*</span>
              </label>
              <textarea
                value={mismatchReason}
                onChange={(e) => setMismatchReason(e.target.value)}
                rows={2}
                placeholder={
                  tab === "taco"
                    ? "Sistem mengira bukan TACO — jelaskan kenapa ini TACO"
                    : "Sistem mengira TACO — jelaskan kenapa ini bukan TACO"
                }
                className="w-full border border-taco-border rounded-xl px-3 py-2.5 text-[14px] text-taco-text bg-white outline-none focus:border-taco-text resize-none"
              />
              <div className="text-[11px] text-taco-muted mt-1">
                Disimpan untuk rekomendasi sistem (mis. tambah sinonim / SKU baru).
              </div>
            </div>
          )}

          {tab === "taco" ? (
            <div>
              <label className="block text-[13px] font-medium text-taco-text mb-1.5">
                Pilih SKU TACO
              </label>
              <input
                type="text"
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                placeholder="Cari kode atau nama SKU…"
                className="w-full h-[44px] px-3 border border-taco-border rounded-xl text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
              />
              <div className="mt-2 max-h-[260px] overflow-y-auto border border-taco-divider rounded-xl divide-y divide-taco-divider">
                {filteredSkus.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-taco-muted">
                    Tidak ada SKU cocok.
                  </div>
                ) : (
                  filteredSkus.map((s) => {
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
          ) : (
            <div>
              <label className="block text-[13px] font-medium text-taco-text mb-1.5">
                Merek kompetitor
              </label>
              {brandsLoading ? (
                <div className="py-6 text-center text-[13px] text-taco-muted">
                  Memuat merek…
                </div>
              ) : (
                <>
                  <div className="border border-taco-divider rounded-xl divide-y divide-taco-divider overflow-hidden max-h-[240px] overflow-y-auto">
                    {brands.length === 0 ? (
                      <div className="px-3 py-3 text-[12px] text-taco-muted">
                        Belum ada merek aktif.
                      </div>
                    ) : (
                      brands.map((b) => {
                        const active = b.id === line.brand_id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => pickBrand(b)}
                            disabled={!!busyKey}
                            className={`w-full text-left px-3 min-h-[48px] flex items-center justify-between gap-2 active:bg-taco-page disabled:opacity-50 ${
                              active ? "bg-taco-accent-tint" : "bg-white"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-[14px] text-taco-text truncate">
                                {b.name}
                              </div>
                              {b.country && (
                                <div className="text-[11px] text-taco-sub truncate">
                                  {b.country}
                                </div>
                              )}
                            </div>
                            {busyKey === b.id && (
                              <span className="text-[11px] text-taco-sub">…</span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={pickUnknown}
                    disabled={!!busyKey}
                    className="mt-2 w-full min-h-[48px] rounded-xl border border-dashed border-taco-border bg-taco-page text-[14px] font-medium text-taco-text active:bg-taco-divider disabled:opacity-50"
                  >
                    {busyKey === "unknown" ? "Menyimpan…" : "Tidak diketahui"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-5 pt-3 pb-4 border-t border-taco-divider flex flex-col gap-2">
          {tab === "taco" && (
            <button
              type="button"
              onClick={saveAsTaco}
              disabled={!selectedSku || !!busyKey}
              className="w-full min-h-[48px] rounded-xl bg-taco-accent text-white font-semibold text-[15px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors"
            >
              {busyKey === "taco" ? "Menyimpan…" : "Simpan sebagai TACO"}
            </button>
          )}
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
