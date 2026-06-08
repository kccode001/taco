"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  getRegionAreas,
  getTacoSkus,
  getTaroInvoice,
  updateTaroLineItem,
  type RegionArea,
  type TaroInvoiceDetail,
  type TaroInvoiceLine,
} from "@/lib/api";
import { Badge, TableHeader, EmptyRow } from "../../../admin/_components/CrudShell";
import { Modal } from "../../../admin/_components/Modal";
import {
  MOCK_INVOICE_DETAIL,
  MOCK_REGION_AREAS,
  confidenceTone,
  formatDateTime,
  formatIdr,
} from "../../../admin/taro-invoices/_components/mockData";
import type { TacoSkuRow } from "../../../admin/taco-skus/_components/SkuTable";
import { MapIcon, SearchIcon, ZoomInIcon } from "../../../admin/_components/icons";

function FallbackInvoice(id: string): TaroInvoiceDetail {
  const cached = MOCK_INVOICE_DETAIL[id];
  if (cached) return cached;
  return Object.values(MOCK_INVOICE_DETAIL)[0];
}

function statusBadge(status: TaroInvoiceDetail["status"]) {
  switch (status) {
    case "done":
      return <Badge tone="ok">Selesai</Badge>;
    case "needs_review":
      return <Badge tone="warn">Perlu Review</Badge>;
    case "processing":
      return <Badge tone="info">Proses</Badge>;
    case "failed":
      return <Badge tone="err">Gagal</Badge>;
    case "pending":
    default:
      return <Badge tone="muted">Menunggu</Badge>;
  }
}

export default function TaroInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [invoice, setInvoice] = useState<TaroInvoiceDetail | null>(null);
  const [editing, setEditing] = useState<TaroInvoiceLine | null>(null);
  const [zoom, setZoom] = useState(false);
  const [regions, setRegions] = useState<RegionArea[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getRegionAreas();
        const data =
          ((res.data as { data?: RegionArea[] })?.data ??
            (res.data as RegionArea[])) ?? [];
        if (alive) setRegions(data.length ? data : MOCK_REGION_AREAS);
      } catch {
        if (alive) setRegions(MOCK_REGION_AREAS);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    try {
      const res = await getTaroInvoice(id);
      const raw = res.data as unknown as Record<string, unknown> | null;
      if (!raw) {
        setInvoice(FallbackInvoice(id));
        return;
      }
      const regionObj = raw.region as
        | { id?: string; display_path?: string }
        | null
        | undefined;
      const region_id =
        regionObj?.id ?? (raw.region_id as string | null | undefined) ?? null;
      const region_display =
        regionObj?.display_path ??
        (raw.region_display as string | null | undefined) ??
        null;
      const normalized = {
        ...(raw as object),
        region_id,
        region_display,
      } as TaroInvoiceDetail;
      setInvoice(normalized);
    } catch {
      setInvoice(FallbackInvoice(id));
    }
  }, [id]);

  useEffect(() => {
    if (id) refetch();
  }, [id, refetch]);

  const regionMap = useMemo(() => {
    const m = new Map<string, RegionArea>();
    for (const r of regions) m.set(r.id, r);
    return m;
  }, [regions]);

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

  if (!invoice) {
    return <div className="text-[13px] text-taco-muted">Memuat invoice…</div>;
  }

  const regionDisplay =
    invoice.region_display ??
    (invoice.region_id ? regionMap.get(invoice.region_id)?.display_path ?? null : null);

  // Confidence summary — count line items by tier.
  const confSummary = invoice.line_items.reduce(
    (acc, li) => {
      const t = confidenceTone(li.confidence).tone;
      if (t === "ok") acc.ok += 1;
      else if (t === "warn") acc.warn += 1;
      else acc.err += 1;
      return acc;
    },
    { ok: 0, warn: 0, err: 0 }
  );

  // BE may ship `store_name`, `ocr_detected_supplier`, or `uploaded_by` —
  // surface whichever is present so the meta panel has rich context.
  const storeName =
    (invoice as unknown as { store_name?: string }).store_name ??
    (invoice as unknown as { ocr_detected_supplier?: string }).ocr_detected_supplier ??
    null;
  const agentName =
    (invoice as unknown as { uploaded_by?: { name?: string } }).uploaded_by?.name ??
    (invoice as unknown as { agent_name?: string }).agent_name ??
    null;

  return (
    <div className="space-y-4">
      {/* Breadcrumb only — title moved into meta panel to keep the split layout
          edge-to-edge from the back link. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/taro/invoices"
          className="text-[12px] text-taco-sub hover:text-taco-text"
        >
          ← Kembali ke Daftar Invoice
        </Link>
        <div className="text-[12px] text-taco-sub">
          Diunggah {formatDateTime(invoice.uploaded_at)}
        </div>
      </div>

      {/* Split layout: image on the left (~45%), meta + line items on the
          right (~55%) per KC wireframe. Collapses to stacked < lg (1024px). */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:h-[calc(100vh-160px)]">
        {/* LEFT — Image preview, full height, click to zoom */}
        <div className="lg:col-span-5 lg:sticky lg:top-4 lg:self-start lg:h-full">
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="relative w-full h-[420px] lg:h-full bg-[#1A1A1A] border border-taco-border rounded-xl overflow-hidden group flex items-center justify-center"
            aria-label="Klik untuk perbesar"
          >
            {invoice.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={invoice.image_url}
                alt={`Invoice ${invoice.short_id}`}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-taco-page/60">
                <div className="w-16 h-16 rounded-full border border-taco-page/30 flex items-center justify-center">
                  <ZoomInIcon size={28} />
                </div>
                <div className="text-[12px]">Pratinjau invoice belum tersedia</div>
              </div>
            )}
            <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur-sm text-white rounded-full text-[11px] opacity-0 group-hover:opacity-100 transition-opacity">
              <ZoomInIcon size={12} /> Klik untuk perbesar
            </div>
          </button>
        </div>

        {/* RIGHT — Meta (top ~30%) + Line items (bottom ~70%) */}
        <div className="lg:col-span-7 flex flex-col gap-4 lg:h-full lg:overflow-hidden">
          {/* META — Sticky inside right column */}
          <div className="bg-white border border-taco-border rounded-xl p-5 flex-shrink-0">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h1 className="text-[18px] font-bold text-taco-text leading-tight truncate">
                  Invoice {invoice.short_id}
                </h1>
                {storeName && (
                  <div className="text-[13px] text-taco-text font-medium mt-0.5 truncate">
                    {storeName}
                  </div>
                )}
              </div>
              {statusBadge(invoice.status)}
            </div>

            {/* Compact 2-col meta grid */}
            <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-[12px]">
              <div className="text-taco-sub">Wilayah ASM</div>
              <div className="text-taco-text">
                {regionDisplay ? (
                  <span className="inline-flex items-center gap-1 text-taco-text">
                    <span className="text-taco-muted">
                      <MapIcon size={11} />
                    </span>
                    <span className="truncate">{regionDisplay}</span>
                  </span>
                ) : (
                  <span className="text-taco-muted italic">Tanpa Region</span>
                )}
              </div>

              {agentName && (
                <>
                  <div className="text-taco-sub">Sales Agent</div>
                  <div className="text-taco-text truncate">{agentName}</div>
                </>
              )}

              <div className="text-taco-sub">Tanggal invoice</div>
              <div className="text-taco-text">{invoice.invoice_date ?? "—"}</div>

              <div className="text-taco-sub">Total</div>
              <div className="text-taco-text font-semibold">
                {formatIdr(invoice.total_amount)}
              </div>

              <div className="text-taco-sub">Jumlah baris</div>
              <div className="text-taco-text">{invoice.line_count}</div>
            </div>

            {/* Confidence summary chips */}
            <div className="mt-3 pt-3 border-t border-taco-divider flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider mr-1">
                Kepercayaan OCR
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#E6F7F2] text-taco-success text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#1D9E75" }} />
                {confSummary.ok} yakin
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#FFF5E6] text-taco-warning text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#E07B00" }} />
                {confSummary.warn} perlu cek
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#FEE2E2] text-taco-error text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#D0342C" }} />
                {confSummary.err} perlu review
              </span>
              <span className="ml-auto text-[12px] text-taco-text">
                Rata-rata{" "}
                <span className="font-semibold">
                  {Math.round(invoice.avg_confidence * 100)}%
                </span>
              </span>
            </div>
          </div>

          {/* LINE ITEMS — Scrollable inside right column */}
          <div className="bg-white border border-taco-border rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-3 border-b border-taco-divider flex-shrink-0 flex items-center justify-between">
              <div className="text-[14px] font-semibold text-taco-text">
                Line Items ({invoice.line_items.length})
              </div>
              <div className="text-[11px] text-taco-muted">
                Klik <span className="text-taco-text font-medium">Edit</span> untuk koreksi SKU
              </div>
            </div>
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full">
                <TableHeader
                  cols={[
                    "Raw OCR",
                    "Matched SKU",
                    "Conf.",
                    "Qty",
                    "Total",
                    "",
                  ]}
                />
                <tbody>
                  {invoice.line_items.length === 0 ? (
                    <EmptyRow colSpan={6} label="Belum ada line item." />
                  ) : (
                    invoice.line_items.map((li) => {
                      const c = confidenceTone(li.confidence);
                      const accent =
                        c.tone === "err"
                          ? "border-l-[3px] border-l-taco-error"
                          : c.tone === "warn"
                            ? "border-l-[3px] border-l-taco-warning"
                            : "border-l-[3px] border-l-transparent";
                      return (
                        <tr
                          key={li.id}
                          className={`${accent} border-b border-taco-divider last:border-0 hover:bg-taco-page`}
                        >
                          <td className="px-3 py-2.5 text-[12px] text-taco-sub max-w-[160px]">
                            <div className="flex items-center gap-2">
                              <span className="text-taco-muted text-[10px] font-mono">
                                {li.line_no}
                              </span>
                              <div className="truncate" title={li.raw_text}>
                                {li.raw_text}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-taco-text max-w-[200px]">
                            {li.matched_sku_id ? (
                              <div>
                                <div className="font-mono text-[10px] text-taco-muted">
                                  {li.matched_sku_code}
                                </div>
                                <div className="truncate">{li.matched_sku_name}</div>
                              </div>
                            ) : (
                              <Badge tone="err">Belum cocok</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-taco-text">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: c.dot }}
                              />
                              {Math.round(li.confidence * 100)}%
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-taco-text whitespace-nowrap">
                            {li.quantity}
                            <span className="text-taco-muted text-[10px] ml-0.5">
                              {li.unit}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-taco-text whitespace-nowrap font-semibold">
                            {formatIdr(li.total)}
                            <div className="text-[10px] text-taco-muted font-normal">
                              @ {formatIdr(li.unit_price)}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => setEditing(li)}
                              className="h-[26px] px-2 border border-taco-border rounded-md text-[11px] text-taco-sub hover:text-taco-text hover:border-taco-text"
                            >
                              Edit
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

      {zoom && (
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
          {invoice.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={invoice.image_url}
              alt={`Invoice ${invoice.short_id}`}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="bg-white rounded-xl p-6 max-w-[640px] w-full text-center text-taco-sub text-[13px]">
              Preview invoice akan muncul di sini setelah backend mengirim{" "}
              <code className="text-taco-text mx-1">image_url</code>.
            </div>
          )}
        </div>
      )}

      {editing && (
        <EditLineItemModal
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

function EditLineItemModal({
  line,
  onClose,
  onSaved,
}: {
  line: TaroInvoiceLine;
  onClose: () => void;
  onSaved: (updated: TaroInvoiceLine) => void;
}) {
  const [skuSearch, setSkuSearch] = useState("");
  const [skus, setSkus] = useState<TacoSkuRow[]>([]);
  const [selectedSku, setSelectedSku] = useState<TacoSkuRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

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
      } catch {
        setSkus([]);
      }
    })();
  }, [line.matched_sku_id]);

  const filtered = useMemo(() => {
    if (!skuSearch.trim()) return skus.slice(0, 8);
    const q = skuSearch.toLowerCase();
    return skus
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [skus, skuSearch]);

  const skuChanged = !!selectedSku && selectedSku.id !== line.matched_sku_id;
  const canSave = !!selectedSku && (!skuChanged || reason.trim().length > 0);

  const handleSave = async () => {
    if (!selectedSku || !canSave) return;
    setBusy(true);
    try {
      const payload = {
        matched_sku_id: selectedSku.id,
        ...(skuChanged ? { reason: reason.trim() } : {}),
      };
      try {
        await updateTaroLineItem(line.id, payload);
      } catch {
        /* mock-mode fallback */
      }
      onSaved({
        ...line,
        matched_sku_id: selectedSku.id,
        matched_sku_code: selectedSku.code,
        matched_sku_name: selectedSku.name,
        confidence: skuChanged ? 1 : line.confidence,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Edit Line #${line.line_no}`}
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Simpan"
      busy={busy}
      saveDisabled={!canSave}
      size="wide"
    >
      <div className="space-y-4">
        <div className="bg-taco-page border border-taco-divider rounded-lg p-3 text-[13px]">
          <div className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider mb-1">
            Raw OCR
          </div>
          <div className="text-taco-text">{line.raw_text}</div>
        </div>

        <div>
          <label className="block text-[13px] font-medium text-taco-text mb-1.5">
            Cari SKU TACO
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted">
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              value={skuSearch}
              onChange={(e) => setSkuSearch(e.target.value)}
              placeholder="Cari kode SKU, nama, atau sinonim…"
              className="w-full h-[44px] pl-9 pr-3 border border-taco-border rounded-lg text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
            />
          </div>
          <div className="mt-2 max-h-[200px] overflow-y-auto border border-taco-divider rounded-lg divide-y divide-taco-divider">
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
                    onClick={() => setSelectedSku(s)}
                    type="button"
                    className={`w-full text-left px-3 py-2 hover:bg-taco-page ${
                      active ? "bg-taco-accent-tint" : ""
                    }`}
                  >
                    <div className="font-mono text-[11px] text-taco-muted">
                      {s.code}
                    </div>
                    <div className="text-[13px] text-taco-text">{s.name}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {skuChanged && (
          <div>
            <label className="block text-[13px] font-medium text-taco-text mb-1.5">
              Alasan koreksi <span className="text-taco-error">*</span>
            </label>
            <div className="text-[12px] text-taco-muted mb-1.5">
              Sistem belajar dari alasan koreksi untuk meningkatkan akurasi OCR.
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Mis. invoice menulis singkatan WLN — sebenarnya Walnut."
              className="w-full border border-taco-border rounded-lg px-3 py-2.5 text-[14px] text-taco-text bg-white outline-none resize-none focus:border-taco-text"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
