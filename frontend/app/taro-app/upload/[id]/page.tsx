"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  ChevronLeftIcon,
  CloseIcon,
  PencilIcon,
  PinIcon,
  SearchIcon,
  StoreIcon,
} from "../../_components/icons";
import {
  MOCK_INVOICE_DETAIL,
  confidenceTone,
  formatIdr,
} from "@/app/admin/taro-invoices/_components/mockData";

interface TacoSkuRow {
  id: string;
  code: string;
  name: string;
  category: string;
}

function fallback(id: string): TaroInvoiceDetail {
  const cached = MOCK_INVOICE_DETAIL[id];
  if (cached) return cached;
  return Object.values(MOCK_INVOICE_DETAIL)[0];
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

export default function TaroUploadReviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { ready } = useTaroGuard();
  const [invoice, setInvoice] = useState<TaroInvoiceDetail | null>(null);
  const [editing, setEditing] = useState<TaroInvoiceLine | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    try {
      const res = await getTaroInvoice(id);
      if (res.data && (res.data as TaroInvoiceDetail).id) {
        setInvoice(res.data as TaroInvoiceDetail);
        return;
      }
      setInvoice(fallback(id));
    } catch {
      setInvoice(fallback(id));
    }
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    refetch();
  }, [ready, refetch]);

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

  if (!ready || !invoice) {
    return (
      <div className="min-h-screen bg-taco-page flex items-center justify-center text-[13px] text-taco-muted">
        Memuat invoice…
      </div>
    );
  }

  const lines = invoice.line_items ?? [];

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[96px]">
        <TopBar
          title={`Invoice ${invoice.short_id}`}
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

        {/* Invoice meta */}
        <div className="bg-white border-b border-taco-divider px-4 py-3">
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
                {invoice.region_display ?? "Tanpa Region"}
              </div>
              <div className="text-[12px] text-taco-sub flex items-center gap-1 mt-0.5">
                <PinIcon size={12} />
                <span className="truncate">
                  Diunggah {timeFmt(invoice.uploaded_at)}
                </span>
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
              Belum ada baris terdeteksi.
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

        {/* Inline finish CTA — page-level so it scrolls with content */}
        <div className="px-4 pt-5">
          <button
            type="button"
            onClick={() => router.push("/taro-app/home")}
            className="w-full min-h-[52px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark transition-colors"
          >
            Selesai
          </button>
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
        // Inline minimal fallback so dropdown shows something.
        setSkus([
          {
            id: "fallback-1",
            code: "TH-001-12-MAP",
            name: "TACO HPL Maple Solid 12mm",
            category: "HPL",
          },
          {
            id: "fallback-2",
            code: "TI-008-3-WAL",
            name: "TIero HPL Walnut Premium 3mm",
            category: "HPL",
          },
          {
            id: "fallback-3",
            code: "ES-002-3-NTR",
            name: "ECO HPL Natural Oak 3mm",
            category: "ECO_HPL",
          },
          {
            id: "fallback-4",
            code: "TE-2MM-W",
            name: "TACO Edging ABS 2mm Walnut",
            category: "EDGING",
          },
          {
            id: "fallback-5",
            code: "FD-MDF-9MM",
            name: "FIDECO MDF 9mm 1220x2440",
            category: "SHEET",
          },
        ]);
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
    try {
      try {
        await updateTaroLineItem(line.id, {
          matched_sku_id: selectedSku.id,
          ...(skuChanged ? { reason: reason.trim() } : {}),
        });
      } catch {
        /* swallow — mock-friendly */
      }
      onSaved({
        ...line,
        matched_sku_id: selectedSku.id,
        matched_sku_code: selectedSku.code,
        matched_sku_name: selectedSku.name,
        confidence: skuChanged ? 1 : line.confidence,
        quantity: Number(quantity) || line.quantity,
        unit_price: Number(price) || line.unit_price,
      });
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
