"use client";

/** TACO v2 — Admin invoice detail + line-item resolution.
 *  Layout mirrors v1 `app/taro/invoices/[id]`: photo LEFT (col-span-5),
 *  meta + line-items RIGHT (col-span-7). The ONLY v2 additions are the
 *  extended ResolveModal (TACO / Competitor tabs with mismatch-reason capture)
 *  and the v2 9-bucket classification display. v1 is FROZEN — untouched. */

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
import { Badge, TableHeader, EmptyRow } from "@/app/admin/_components/CrudShell";
import { ZoomInIcon } from "@/app/admin/_components/icons";

interface TacoSkuRow {
  id: string;
  code: string;
  name: string;
}

// ── Classification helpers ──────────────────────────────────────────────────
type Family = "taco" | "not_taco" | "unknown";

function classFamily(c: LineClassificationV2): Family {
  if (c.startsWith("taco_")) return "taco";
  if (c.startsWith("not_taco_")) return "not_taco";
  return "unknown";
}

/** Authoritative "still needs a human" signal — the BE `needs_review` flag on
 *  the line, NOT a FE re-derivation from matched_sku_id/classification (that
 *  re-derivation disagreed with the BE on auto-accepted low-confidence lines and
 *  wrongly flagged invoices — KC AC-1). */
function lineNeedsReview(li: InvoiceLineItemV2): boolean {
  return li.needs_review === true;
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
  needsHuman: boolean;
}

function lineDisplay(li: InvoiceLineItemV2): LineDisplay {
  const family = classFamily(li.classification);
  // Authoritative: the BE needs_review flag takes priority. A line can have a
  // matched_sku_id AND still need human review (e.g. taco_low_verify where the
  // auto-match confidence is low). Never let matched_sku_id mask a needs_review flag.
  if (lineNeedsReview(li)) {
    return { tone: "warn", badge: "Perlu Dicek", title: CLASS_LABEL[li.classification], family, needsHuman: true };
  }
  if (li.matched_sku_id) {
    return { tone: "ok", badge: "TACO", title: li.matched_sku?.name ?? li.matched_sku?.code ?? "Produk TACO", family, needsHuman: false };
  }
  if (li.is_competitor) {
    if (li.brand_id || li.brand_name) {
      return { tone: "ok", badge: "Kompetitor", title: li.brand_name ? `Kompetitor · ${li.brand_name}` : "Produk kompetitor", family, needsHuman: false };
    }
    return { tone: "ok", badge: "Non-TACO", title: "Bukan produk TACO (tidak diketahui)", family, needsHuman: false };
  }
  return { tone: family === "taco" ? "ok" : "neutral", badge: family === "taco" ? "TACO (auto)" : "Bukan TACO (auto)", title: CLASS_LABEL[li.classification], family, needsHuman: false };
}

function isResolvedLine(li: InvoiceLineItemV2): boolean {
  return !lineDisplay(li).needsHuman;
}

function recomputeStatus(lines: InvoiceLineItemV2[], current: InvoiceV2Status): InvoiceV2Status {
  if (current === "validating" || current === "ocr_processing" || current === "failed") return current;
  if (lines.length === 0) return current;
  return lines.every(isResolvedLine) ? "done" : "needs_review";
}

function toneChipCls(tone: Tone): string {
  if (tone === "ok") return "bg-emerald-50 text-taco-success border-emerald-100";
  if (tone === "warn") return "bg-amber-50 text-taco-warning border-amber-100";
  return "bg-taco-page text-taco-sub border-taco-border";
}

function statusBadge(status: InvoiceV2Status) {
  switch (status) {
    case "done": return <Badge tone="ok">Selesai</Badge>;
    case "needs_review": return <Badge tone="warn">Perlu Review</Badge>;
    case "validating":
    case "ocr_processing": return <Badge tone="info">Proses OCR</Badge>;
    case "failed": return <Badge tone="err">Gagal</Badge>;
    default: return <Badge tone="muted">Antrian</Badge>;
  }
}

function formatIdr(value?: number | string | null) {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { message?: string | string[]; error?: string } | undefined;
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
  const [zoom, setZoom] = useState(false);

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
      setStatus(recomputeStatus(ls, inv.status));
      const imgs = inv.images ?? [];
      if (imgs.length > 0) {
        const urls = await Promise.all(
          imgs.map((img) => (img.url ? Promise.resolve(img.url) : getV2ImageUrl(img.id)))
        );
        setInvoice((prev) =>
          prev ? { ...prev, images: (prev.images ?? []).map((img, i) => ({ ...img, url: urls[i] ?? img.url ?? null })) } : prev
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

  const applyResolved = useCallback(
    (lineId: string, patch: Partial<InvoiceLineItemV2>, next?: InvoiceV2Status) => {
      setLines((prev) => {
        const updated = prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l));
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

  if (loading) {
    return <div className="text-[13px] text-taco-muted">Memuat invoice…</div>;
  }

  if (!invoice) {
    return (
      <div className="space-y-3">
        {error && (
          <div className="text-[13px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <Link href="/taro/v2/invoices" className="text-[12px] text-taco-sub hover:text-taco-text">
          ← Kembali ke Antrian Invoice
        </Link>
      </div>
    );
  }

  const primaryImageUrl = (invoice.images ?? [])[0]?.url ?? null;
  const storeName = invoice.store?.name ?? invoice.store_name ?? null;
  const areaName = invoice.area?.name ?? invoice.area_name ?? null;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/taro/v2/invoices" className="text-[12px] text-taco-sub hover:text-taco-text">
          ← Kembali ke Antrian Invoice
        </Link>
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-[12px] text-taco-error">{error}</span>
          )}
          <div className="text-[12px] text-taco-sub">
            Diunggah {formatDateTime(invoice.created_at)}
          </div>
        </div>
      </div>

      {/* Split layout: image left (~45%), meta + line items right (~55%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:h-[calc(100vh-160px)]">
        {/* LEFT — Image preview, full height, click to zoom */}
        <div className="lg:col-span-5 lg:sticky lg:top-4 lg:self-start lg:h-full">
          <button
            type="button"
            onClick={() => primaryImageUrl && setZoom(true)}
            className="relative w-full h-[420px] lg:h-full bg-[#1A1A1A] border border-taco-border rounded-xl overflow-hidden group flex items-center justify-center"
            aria-label="Klik untuk perbesar"
          >
            {primaryImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={primaryImageUrl}
                alt={`Invoice ${id.slice(0, 8)}`}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-taco-page/60 animate-pulse">
                <div className="w-16 h-16 rounded-full border border-taco-page/30 flex items-center justify-center">
                  <ZoomInIcon size={28} />
                </div>
                <div className="text-[12px]">Memuat pratinjau invoice…</div>
              </div>
            )}
            {primaryImageUrl && (
              <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur-sm text-white rounded-full text-[11px] opacity-0 group-hover:opacity-100 transition-opacity">
                <ZoomInIcon size={12} /> Klik untuk perbesar
              </div>
            )}
            {(invoice.images ?? []).length > 1 && (
              <div className="absolute bottom-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 bg-black/60 text-white rounded-full text-[11px]">
                {(invoice.images ?? []).length} foto
              </div>
            )}
          </button>
        </div>

        {/* RIGHT — Meta (top) + Line items (bottom, scrollable) */}
        <div className="lg:col-span-7 flex flex-col gap-4 lg:h-full lg:overflow-hidden">
          {/* META */}
          <div className="bg-white border border-taco-border rounded-xl p-5 flex-shrink-0">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h1 className="text-[18px] font-bold text-taco-text leading-tight truncate">
                  Invoice {id.slice(0, 8)}
                </h1>
                {storeName && (
                  <div className="text-[13px] text-taco-text font-medium mt-0.5 truncate">
                    {storeName}
                  </div>
                )}
              </div>
              {statusBadge(status)}
            </div>

            <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-[12px]">
              <div className="text-taco-sub">Area</div>
              <div className="text-taco-text truncate">{areaName ?? <span className="text-taco-muted italic">Tanpa Area</span>}</div>

              <div className="text-taco-sub">Toko</div>
              <div className="text-taco-text truncate">{storeName ?? <span className="text-taco-muted italic">Tanpa Toko</span>}</div>

              {invoice.uploaded_by_name && (
                <>
                  <div className="text-taco-sub">Diunggah oleh</div>
                  <div className="text-taco-text truncate">{invoice.uploaded_by_name}</div>
                </>
              )}

              <div className="text-taco-sub">Jumlah baris</div>
              <div className="text-taco-text">{summary.total}</div>

              {invoice.total_amount != null && (
                <>
                  <div className="text-taco-sub">Total nilai</div>
                  <div className="text-taco-text font-semibold">{formatIdr(invoice.total_amount)}</div>
                </>
              )}
            </div>

            {/* Review summary chips */}
            <div className="mt-3 pt-3 border-t border-taco-divider flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider mr-1">
                Status Baris
              </span>
              {/* AC-4: the "Perlu Review" badge renders ONLY when ≥1 row needs
                  review (driven by the BE needs_review flag, never re-derived). */}
              {summary.open > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#FFF5E6] text-taco-warning text-[11px] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#E07B00" }} />
                  {summary.open} perlu review
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#E6F7F2] text-taco-success text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#1D9E75" }} />
                {summary.ready} siap
              </span>
              <span className="ml-auto text-[12px] text-taco-text">
                Total{" "}
                <span className="font-semibold">{summary.total}</span>
              </span>
            </div>
          </div>

          {/* LINE ITEMS — Scrollable */}
          <div className="bg-white border border-taco-border rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-3 border-b border-taco-divider flex-shrink-0 flex items-center justify-between">
              <div className="text-[14px] font-semibold text-taco-text">
                Line Items ({lines.length})
              </div>
              <div className="text-[11px] text-taco-muted">
                Klik <span className="text-taco-text font-medium">Resolusi</span> untuk koreksi SKU atau tandai kompetitor
              </div>
            </div>
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full">
                <TableHeader cols={["Raw OCR", "Jenis", "Qty", "Total", ""]} />
                <tbody>
                  {lines.length === 0 ? (
                    <EmptyRow colSpan={5} label="Belum ada line item." />
                  ) : (
                    lines.map((li) => {
                      const d = lineDisplay(li);
                      const accent = d.needsHuman
                        ? "border-l-[3px] border-l-taco-warning"
                        : d.tone === "ok"
                          ? "border-l-[3px] border-l-transparent"
                          : "border-l-[3px] border-l-transparent";
                      return (
                        <tr
                          key={li.id}
                          className={`${accent} border-b border-taco-divider last:border-0 hover:bg-taco-page`}
                        >
                          <td className="px-3 py-2.5 text-[12px] text-taco-sub max-w-[160px]">
                            <div className="flex items-center gap-2">
                              {li.line_no != null && (
                                <span className="text-taco-muted text-[10px] font-mono">
                                  {li.line_no}
                                </span>
                              )}
                              <div className="truncate" title={li.raw_text}>
                                {li.raw_text}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-[12px] max-w-[200px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${toneChipCls(d.tone)}`}
                              >
                                {d.badge}
                              </span>
                            </div>
                            <div className="text-[11px] text-taco-sub mt-0.5 truncate" title={d.title}>
                              {d.title}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-taco-text whitespace-nowrap">
                            {li.quantity != null ? (
                              <>
                                {li.quantity}
                                <span className="text-taco-muted text-[10px] ml-0.5">{li.unit}</span>
                              </>
                            ) : (
                              <span className="text-taco-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-taco-text whitespace-nowrap">
                            {li.unit_price != null ? (
                              <>
                                <div className="font-semibold">{formatIdr(li.unit_price)}</div>
                              </>
                            ) : (
                              <span className="text-taco-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => setEditing(li)}
                              className="h-[26px] px-2 border border-taco-border rounded-md text-[11px] text-taco-sub hover:text-taco-text hover:border-taco-text"
                            >
                              {d.needsHuman ? "Resolusi" : "Edit"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Zoom modal */}
      {zoom && primaryImageUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6"
          onClick={() => setZoom(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center text-[16px]"
            onClick={() => setZoom(false)}
            aria-label="Tutup"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={primaryImageUrl}
            alt={`Invoice ${id.slice(0, 8)}`}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {editing && (
        <ResolveModal
          line={editing}
          onClose={() => setEditing(null)}
          onResolved={applyResolved}
        />
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

  const [skus, setSkus] = useState<TacoSkuRow[]>([]);
  const [skuSearch, setSkuSearch] = useState("");
  const [selectedSku, setSelectedSku] = useState<TacoSkuRow | null>(null);

  const [brands, setBrands] = useState<CompetitorBrand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);

  const [mismatchReason, setMismatchReason] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (tab !== "taco" || skus.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getTacoSkus();
        const data =
          ((res.data as { data?: TacoSkuRow[] })?.data ?? (res.data as TacoSkuRow[])) ?? [];
        if (!cancelled) {
          setSkus(data);
          if (line.matched_sku_id) {
            const cur = data.find((s) => s.id === line.matched_sku_id);
            if (cur) setSelectedSku(cur);
          }
        }
      } catch (err) {
        if (!cancelled) setError(`Tidak bisa memuat SKU: ${extractErrorMessage(err)}`);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, skus.length, line.matched_sku_id]);

  useEffect(() => {
    if (tab !== "competitor" || brands.length > 0) return;
    let cancelled = false;
    setBrandsLoading(true);
    (async () => {
      try {
        const res = await getCompetitorBrands();
        const raw =
          ((res.data as { data?: CompetitorBrand[] })?.data ?? (res.data as CompetitorBrand[])) ?? [];
        const active = raw.filter((b) => b.is_active !== false).sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setBrands(active);
      } catch (err) {
        if (!cancelled) setError(`Tidak bisa memuat merek: ${extractErrorMessage(err)}`);
      } finally {
        if (!cancelled) setBrandsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, brands.length]);

  const filteredSkus = useMemo(() => {
    if (!skuSearch.trim()) return skus.slice(0, 15);
    const q = skuSearch.toLowerCase();
    return skus.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)).slice(0, 15);
  }, [skus, skuSearch]);

  const tacoIsFlip = systemFamily === "not_taco" || systemFamily === "unknown";
  const competitorIsFlip = systemFamily === "taco";

  const finish = (patch: Partial<InvoiceLineItemV2>, next?: InvoiceV2Status) =>
    onResolved(line.id, patch, next);

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
        reason: tacoIsFlip ? mismatchReason.trim() : "Dipetakan oleh admin.",
        ...(tacoIsFlip ? { mismatch_reason: mismatchReason.trim() } : {}),
      });
      finish({
        matched_sku_id: selectedSku.id,
        matched_sku: { id: selectedSku.id, code: selectedSku.code, name: selectedSku.name },
        brand_id: null,
        brand_name: null,
        is_competitor: false,
        ...(tacoIsFlip ? { mismatch_reason: mismatchReason.trim() } : {}),
      }, readInvoiceStatus(resp));
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
      finish({
        brand_id: brand.id,
        brand_name: brand.name,
        is_competitor: true,
        matched_sku_id: null,
        matched_sku: null,
        ...(competitorIsFlip ? { mismatch_reason: mismatchReason.trim() } : {}),
      }, readInvoiceStatus(resp));
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
      finish({
        is_competitor: true,
        brand_id: null,
        brand_name: null,
        matched_sku_id: null,
        matched_sku: null,
        ...(competitorIsFlip ? { mismatch_reason: mismatchReason.trim() } : {}),
      }, readInvoiceStatus(resp));
    } catch (err) {
      setBusyKey(null);
      setError(`Gagal menyimpan: ${extractErrorMessage(err)}`);
    }
  };

  const showFlipReason =
    (tab === "taco" && tacoIsFlip) || (tab === "competitor" && competitorIsFlip);

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
            <div className="text-[11px] uppercase tracking-wider text-taco-muted font-semibold">Teks OCR</div>
            <div className="text-[14px] text-taco-text mt-1">{line.raw_text}</div>
          </div>

          <div className="grid grid-cols-2 gap-1 bg-taco-page border border-taco-border rounded-xl p-1">
            {(["taco", "competitor"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setError(null); }}
                className={`min-h-[40px] rounded-lg text-[13px] font-medium transition-colors ${
                  tab === t ? "bg-white text-taco-text shadow-sm" : "text-taco-sub"
                }`}
              >
                {t === "taco" ? "Produk TACO" : "Kompetitor"}
              </button>
            ))}
          </div>

          {showFlipReason && (
            <div>
              <label className="block text-[13px] font-medium text-taco-text mb-1.5">
                Alasan koreksi <span className="text-taco-error">*</span>
              </label>
              <textarea
                value={mismatchReason}
                onChange={(e) => setMismatchReason(e.target.value)}
                rows={2}
                placeholder={tab === "taco" ? "Sistem mengira bukan TACO — jelaskan kenapa ini TACO" : "Sistem mengira TACO — jelaskan kenapa ini bukan TACO"}
                className="w-full border border-taco-border rounded-xl px-3 py-2.5 text-[14px] text-taco-text bg-white outline-none focus:border-taco-text resize-none"
              />
            </div>
          )}

          {tab === "taco" ? (
            <div>
              <label className="block text-[13px] font-medium text-taco-text mb-1.5">Pilih SKU TACO</label>
              <input
                type="text"
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                placeholder="Cari kode atau nama SKU…"
                className="w-full h-[44px] px-3 border border-taco-border rounded-xl text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
              />
              <div className="mt-2 max-h-[260px] overflow-y-auto border border-taco-divider rounded-xl divide-y divide-taco-divider">
                {filteredSkus.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-taco-muted">Tidak ada SKU cocok.</div>
                ) : (
                  filteredSkus.map((s) => {
                    const active = selectedSku?.id === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSku(s)}
                        className={`w-full text-left px-3 py-2.5 active:bg-taco-page ${active ? "bg-taco-accent-tint" : "bg-white"}`}
                      >
                        <div className="font-mono text-[11px] text-taco-muted">{s.code}</div>
                        <div className="text-[14px] text-taco-text">{s.name}</div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[13px] font-medium text-taco-text mb-1.5">Merek kompetitor</label>
              {brandsLoading ? (
                <div className="py-6 text-center text-[13px] text-taco-muted">Memuat merek…</div>
              ) : (
                <>
                  <div className="border border-taco-divider rounded-xl divide-y divide-taco-divider overflow-hidden max-h-[240px] overflow-y-auto">
                    {brands.length === 0 ? (
                      <div className="px-3 py-3 text-[12px] text-taco-muted">Belum ada merek aktif.</div>
                    ) : (
                      brands.map((b) => {
                        const active = b.id === line.brand_id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => pickBrand(b)}
                            disabled={!!busyKey}
                            className={`w-full text-left px-3 min-h-[48px] flex items-center justify-between gap-2 active:bg-taco-page disabled:opacity-50 ${active ? "bg-taco-accent-tint" : "bg-white"}`}
                          >
                            <div className="min-w-0">
                              <div className="text-[14px] text-taco-text truncate">{b.name}</div>
                              {b.country && <div className="text-[11px] text-taco-sub truncate">{b.country}</div>}
                            </div>
                            {busyKey === b.id && <span className="text-[11px] text-taco-sub">…</span>}
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
