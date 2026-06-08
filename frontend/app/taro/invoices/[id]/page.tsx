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

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/taro/invoices"
          className="text-[12px] text-taco-sub hover:text-taco-text"
        >
          ← Kembali ke Daftar Invoice
        </Link>
        <h1 className="text-[20px] font-bold text-taco-text leading-tight mt-2">
          Invoice {invoice.short_id}
        </h1>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {regionDisplay ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-taco-page border border-taco-border rounded-full text-[12px] text-taco-text">
              <span className="text-taco-muted">
                <MapIcon size={12} />
              </span>
              <span className="font-medium">Wilayah ASM:</span>
              <span>{regionDisplay}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-taco-page border border-taco-border rounded-full text-[12px] text-taco-muted italic">
              <span>
                <MapIcon size={12} />
              </span>
              Tanpa Region
            </span>
          )}
          <span className="text-[12px] text-taco-sub">
            · Diunggah {formatDateTime(invoice.uploaded_at)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <div className="bg-white border border-taco-border rounded-xl p-5 space-y-3">
          <div className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider">
            Ringkasan Invoice
          </div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-[13px]">
            <div className="text-taco-sub">Wilayah ASM</div>
            <div className="text-taco-text">
              {regionDisplay ?? (
                <span className="text-taco-muted italic">Tanpa Region</span>
              )}
            </div>
            <div className="text-taco-sub">Tanggal invoice</div>
            <div className="text-taco-text">{invoice.invoice_date ?? "—"}</div>
            <div className="text-taco-sub">Total</div>
            <div className="text-taco-text font-semibold">
              {formatIdr(invoice.total_amount)}
            </div>
            <div className="text-taco-sub">Jumlah baris</div>
            <div className="text-taco-text">{invoice.line_count}</div>
            <div className="text-taco-sub">Kepercayaan rata-rata</div>
            <div>
              <span className="inline-flex items-center gap-2 text-[13px] text-taco-text">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: confidenceTone(invoice.avg_confidence).dot }}
                />
                {confidenceTone(invoice.avg_confidence).label}{" "}
                <span className="text-taco-muted">
                  ({Math.round(invoice.avg_confidence * 100)}%)
                </span>
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setZoom(true)}
          className="bg-white border border-taco-border rounded-xl p-3 flex flex-col items-center justify-center text-taco-muted hover:border-taco-text transition-colors"
        >
          <div className="w-full aspect-[3/4] rounded-md bg-taco-page border border-taco-divider flex items-center justify-center text-taco-muted">
            {invoice.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={invoice.image_url}
                alt="Invoice"
                className="max-w-full max-h-full object-contain rounded-md"
              />
            ) : (
              <span className="text-[11px]">Preview tidak tersedia</span>
            )}
          </div>
          <div className="text-[12px] mt-2 flex items-center gap-1.5 text-taco-sub">
            <ZoomInIcon size={12} /> Klik untuk perbesar
          </div>
        </button>
      </div>

      <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-taco-divider text-[14px] font-semibold text-taco-text">
          Line Items ({invoice.line_items.length})
        </div>
        <table className="w-full">
          <TableHeader
            cols={[
              "#",
              "Raw OCR",
              "Matched SKU",
              "Confidence",
              "Qty",
              "Unit",
              "Harga",
              "Total",
              "Aksi",
            ]}
          />
          <tbody>
            {invoice.line_items.length === 0 ? (
              <EmptyRow colSpan={9} label="Belum ada line item." />
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
                    <td className="px-4 py-3 text-[12px] text-taco-muted font-mono">
                      {li.line_no}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-taco-sub max-w-[180px]">
                      <div className="truncate" title={li.raw_text}>
                        {li.raw_text}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-taco-text max-w-[220px]">
                      {li.matched_sku_id ? (
                        <div>
                          <div className="font-mono text-[11px] text-taco-muted">
                            {li.matched_sku_code}
                          </div>
                          <div className="truncate">{li.matched_sku_name}</div>
                        </div>
                      ) : (
                        <Badge tone="err">Belum cocok</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 text-[12px] text-taco-text">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: c.dot }}
                        />
                        {Math.round(li.confidence * 100)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap">
                      {li.quantity}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-taco-sub whitespace-nowrap">
                      {li.unit}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap">
                      {formatIdr(li.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap font-semibold">
                      {formatIdr(li.total)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditing(li)}
                        className="h-[28px] px-2.5 border border-taco-border rounded-md text-[12px] text-taco-sub hover:text-taco-text hover:border-taco-text"
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

      {zoom && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6"
          onClick={() => setZoom(false)}
        >
          <div className="bg-white rounded-xl p-6 max-w-[640px] w-full text-center text-taco-sub text-[13px]">
            Preview invoice akan muncul di sini setelah backend mengirim
            <code className="text-taco-text mx-1">image_url</code>.
          </div>
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
