"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  InvoiceCameraView,
  InvoiceCard,
  InvoiceResultsList,
  type OcrLine,
} from "@/components/mobile";
import { useAuthStore } from "@/lib/store";
import {
  getInvoice,
  getInvoiceStatus,
  getVisit,
  getVisitInvoices,
  retakeInvoice,
  updateLineItem,
  uploadInvoice,
  type InvoiceLineItem,
  type InvoiceRecord,
} from "@/lib/api";

type State =
  | "empty"
  | "list"
  | "camera"
  | "processing"
  | "results"
  | "failed";

function fmtVisitDate(s?: string) {
  if (!s) return "";
  try {
    const d = new Date(s);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function InvoicePage() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const visitId = params?.id as string;
  const mode: "competitor" | "foto_katalog" =
    search?.get("mode") === "foto_katalog" ? "foto_katalog" : "competitor";
  const { user } = useAuthStore();

  const [visitMeta, setVisitMeta] = useState<{
    storeName: string;
    visitStartedAt?: string;
  }>({ storeName: "" });

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [stage, setStage] = useState<State>("empty");
  const [activeInvoice, setActiveInvoice] = useState<InvoiceRecord | null>(null);
  const [lines, setLines] = useState<OcrLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoPreview = useRef<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [vRes, iRes] = await Promise.all([
        getVisit(visitId),
        getVisitInvoices(visitId),
      ]);
      const v =
        (vRes.data as { data?: { store?: { name?: string }; started_at?: string } })
          ?.data ?? (vRes.data as { store?: { name?: string }; started_at?: string });
      setVisitMeta({
        storeName: v?.store?.name ?? "",
        visitStartedAt: v?.started_at,
      });

      const list =
        (iRes.data as { data?: InvoiceRecord[] })?.data ??
        (iRes.data as InvoiceRecord[]);
      const arr = Array.isArray(list) ? list : [];
      const filtered = arr.filter((x) =>
        mode === "foto_katalog" ? x.mode === "foto_katalog" : x.mode !== "foto_katalog"
      );
      setInvoices(filtered);
      setStage(filtered.length === 0 ? "empty" : "list");
    } catch {
      setInvoices([]);
      setStage("empty");
    }
  }, [visitId, mode]);

  useEffect(() => {
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    loadAll();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (photoPreview.current) URL.revokeObjectURL(photoPreview.current);
    };
  }, [user, router, loadAll]);

  const totals = (() => {
    let products = 0;
    const brands = new Set<string>();
    let review = 0;
    for (const inv of invoices) {
      products += inv.product_count ?? inv.line_items?.length ?? 0;
      if (inv.brands?.length) inv.brands.forEach((b) => brands.add(b));
      else if (inv.brand) brands.add(inv.brand);
      review += inv.needs_review ?? 0;
    }
    return { products, brands: brands.size, review };
  })();

  const handleCapture = async (file: File) => {
    if (photoPreview.current) URL.revokeObjectURL(photoPreview.current);
    photoPreview.current = URL.createObjectURL(file);
    setStage("processing");
    setProgress(8);
    setError(null);
    try {
      const res = await uploadInvoice(visitId, file, mode);
      const raw = res.data as InvoiceRecord & { id?: string };
      const invoiceId = raw?.id;
      if (!invoiceId) {
        setError("Foto tidak terbaca");
        setStage("failed");
        return;
      }
      pollInvoice(invoiceId);
    } catch {
      setError("Foto tidak terbaca");
      setStage("failed");
    }
  };

  const pollInvoice = useCallback(
    (invoiceId: string) => {
      const tick = async () => {
        try {
          const sRes = await getInvoiceStatus(invoiceId);
          const status = sRes.data?.status;
          const prog = sRes.data?.progress;
          if (typeof prog === "number") setProgress(prog);
          else setProgress((p) => Math.min(95, p + 12));

          if (status === "done") {
            const iRes = await getInvoice(invoiceId);
            const inv = iRes.data as InvoiceRecord;
            setActiveInvoice(inv);
            const items = (inv.line_items ?? []) as InvoiceLineItem[];
            setLines(
              items.map((li) => ({
                id: li.id,
                product_name: li.product_name,
                brand: li.brand,
                qty: li.qty,
                uom: li.uom,
                harga_beli: li.harga_beli,
                confidence: li.confidence,
                taco_sku_id: li.taco_sku_id,
                unclear: li.unclear,
                raw_text: li.raw_text,
                notes: li.notes,
                skipped: li.skipped,
              }))
            );
            setStage("results");
            return;
          }
          if (status === "failed") {
            setError("Foto tidak terbaca");
            setStage("failed");
            return;
          }
          pollTimer.current = setTimeout(tick, 1500);
        } catch {
          pollTimer.current = setTimeout(tick, 2500);
        }
      };
      pollTimer.current = setTimeout(tick, 800);
    },
    []
  );

  const updateLine = (idx: number, next: OcrLine) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? next : l)));
    // best-effort persist
    if (activeInvoice) {
      updateLineItem(activeInvoice.id, next.id, {
        brand: next.brand,
        taco_sku_id: next.taco_sku_id,
        notes: next.notes,
        skipped: next.skipped,
      }).catch(() => {});
    }
  };

  const handleSaveInvoice = async () => {
    if (!activeInvoice) return;
    setSaving(true);
    try {
      // Snapshot pending state on each line — relies on per-edit PATCH above.
      await loadAll();
      setStage(invoices.length + 1 === 0 ? "empty" : "list");
    } finally {
      setSaving(false);
      setActiveInvoice(null);
      setLines([]);
    }
  };

  const handleRetake = () => {
    if (activeInvoice) {
      retakeInvoice(activeInvoice.id).catch(() => {});
    }
    setActiveInvoice(null);
    setError(null);
    setStage("camera");
  };

  // ────────── render ──────────
  const headerTitle =
    mode === "foto_katalog" ? "Foto Katalog TACO" : "Invoice Kompetitor";
  const headerSub = (() => {
    const visitLine =
      visitMeta.visitStartedAt &&
      `Kunjungan • ${fmtVisitDate(visitMeta.visitStartedAt)}`;
    const countLine = `${invoices.length} invoice tersimpan`;
    return [visitMeta.storeName, visitLine, countLine].filter(Boolean).join(" · ");
  })();

  if (stage === "camera") {
    return (
      <InvoiceCameraView
        onCancel={() => setStage(invoices.length ? "list" : "empty")}
        onCapture={handleCapture}
      />
    );
  }

  if (stage === "processing") {
    return (
      <div className="min-h-screen bg-taco-page flex flex-col">
        <div className="phone-shell flex flex-col min-h-screen">
          <div className="bg-white border-b border-taco-divider px-5 pt-3 pb-3.5">
            <div className="text-[15px] text-taco-text font-semibold">
              Menganalisis invoice…
            </div>
            <div className="text-[13px] text-taco-sub mt-0.5">
              AI sedang membaca foto Anda
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
            {photoPreview.current && (
              <div className="w-full max-w-[260px] rounded-[14px] overflow-hidden border border-taco-border shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview.current}
                  alt="Foto invoice"
                  className="w-full h-auto"
                />
              </div>
            )}
            <div className="w-12 h-12 rounded-full border-2 border-taco-border border-t-taco-text taco-spin" />
            <div className="w-full max-w-[280px] h-2 rounded-full bg-taco-border overflow-hidden">
              <div
                className="h-full bg-taco-text transition-all"
                style={{ width: `${Math.min(progress, 95)}%` }}
              />
            </div>
            <div className="text-[14px] text-taco-sub">
              Biasanya selesai dalam 5–10 detik
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "results") {
    return (
      <div className="min-h-screen bg-taco-page flex flex-col">
        <div className="phone-shell flex flex-col min-h-screen pb-[140px]">
          <div className="bg-white border-b border-taco-divider px-5 pt-3 pb-3.5">
            <div className="flex items-center justify-between min-h-[36px]">
              <button
                type="button"
                onClick={handleRetake}
                className="inline-flex items-center gap-1 text-taco-sub text-[15px] min-h-[44px] -ml-1"
              >
                <ChevronLeft size={18} />
                Ambil ulang
              </button>
              {photoPreview.current && (
                <div className="w-9 h-9 rounded-md overflow-hidden border border-taco-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview.current}
                    alt="Thumbnail"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
            <div className="text-[17px] font-semibold text-taco-text mt-1">
              Hasil OCR
            </div>
            <div className="text-[13px] text-taco-sub mt-0.5">
              {visitMeta.storeName}
              {visitMeta.visitStartedAt
                ? ` · Kunjungan ${fmtVisitDate(visitMeta.visitStartedAt)}`
                : ""}
            </div>
          </div>

          <div className="flex-1 px-3.5 pt-3.5">
            <InvoiceResultsList
              lines={lines}
              onChange={updateLine}
              mode={mode}
            />
          </div>

          <div className="fixed bottom-0 left-0 right-0 phone-shell mx-auto bg-white border-t border-taco-divider px-5 pt-3.5 pb-8 z-30">
            <button
              type="button"
              onClick={handleSaveInvoice}
              disabled={saving}
              className="w-full h-14 rounded-xl bg-taco-text text-white text-[16px] font-semibold disabled:opacity-50"
            >
              {saving ? "Menyimpan…" : "Simpan Invoice"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "failed") {
    return (
      <div className="min-h-screen bg-taco-page flex flex-col">
        <div className="phone-shell flex flex-col min-h-screen">
          <div className="bg-white border-b border-taco-divider px-5 pt-3 pb-3.5">
            <div className="text-[15px] text-taco-text font-semibold">
              Foto tidak terbaca
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-taco-error">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="text-[16px] font-semibold text-taco-text">
              {error ?? "AI tidak bisa membaca foto ini"}
            </div>
            <div className="text-[14px] text-taco-sub max-w-[280px] leading-relaxed">
              Pastikan foto cukup terang, fokus, dan seluruh teks terlihat.
            </div>
            <button
              type="button"
              onClick={handleRetake}
              className="mt-4 h-14 rounded-xl bg-taco-accent text-white text-[16px] font-semibold w-full max-w-[280px]"
            >
              Foto ulang
            </button>
            <button
              type="button"
              onClick={() => setStage(invoices.length ? "list" : "empty")}
              className="h-11 text-[14px] text-taco-sub"
            >
              Kembali
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ───── empty + list (Screen 03a / 03e) ─────
  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[140px]">
        <div className="bg-white border-b border-taco-divider px-5 pt-3 pb-3.5">
          <div className="flex items-center justify-between min-h-[36px]">
            <button
              type="button"
              onClick={() => router.push(`/app/visit/${visitId}`)}
              className="inline-flex items-center gap-1 text-taco-sub text-[15px] min-h-[44px] -ml-1"
            >
              <ChevronLeft size={18} />
              Kembali ke Kunjungan
            </button>
            <span className="text-[11px] font-semibold tracking-wide text-taco-sub uppercase">
              {mode === "foto_katalog" ? "D — Foto Katalog" : "E — Kompetitor"}
            </span>
          </div>
          <div className="text-[18px] font-semibold text-taco-text mt-1">
            {visitMeta.storeName || headerTitle}
          </div>
          <div className="text-[13px] text-taco-sub mt-0.5 leading-snug">
            {headerSub || headerTitle}
          </div>
          {invoices.length > 0 && (
            <div className="text-[12px] text-taco-muted mt-1">
              {totals.products} produk · {totals.brands} brand
              {totals.review > 0 ? ` · ${totals.review} perlu review` : ""}
            </div>
          )}
        </div>

        <div className="flex-1 px-3.5 pt-3.5">
          {stage === "empty" || invoices.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 bg-taco-page rounded-2xl flex items-center justify-center mx-auto mb-4 text-taco-muted">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div className="text-[16px] font-semibold text-taco-text mb-1.5">
                Belum ada invoice
              </div>
              <div className="text-[14px] text-taco-sub leading-relaxed max-w-[280px] mx-auto">
                {mode === "foto_katalog"
                  ? "Foto katalog TACO untuk merekam harga di toko ini."
                  : "Foto invoice kompetitor atau katalog TACO untuk merekam harga di toko ini."}
              </div>
              <div className="text-[12px] text-taco-muted mt-2">
                Setiap invoice disimpan terpisah
              </div>
            </div>
          ) : (
            <div>
              {invoices.map((inv) => (
                <InvoiceCard key={inv.id} invoice={inv} />
              ))}
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 phone-shell mx-auto bg-white border-t border-taco-divider px-5 pt-3.5 pb-8 z-30">
          <button
            type="button"
            onClick={() => setStage("camera")}
            className="w-full h-14 rounded-xl bg-taco-accent text-white text-[16px] font-semibold flex items-center justify-center gap-2 active:bg-taco-accent-dark"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Tambah Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
