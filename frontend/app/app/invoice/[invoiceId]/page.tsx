"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Camera,
  Plus,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import {
  getVisitInvoices,
  uploadInvoice,
  getInvoice,
  updateLineItem,
  getTacoSkus,
} from "@/lib/api";
import { Invoice, InvoiceLineItem, TacoSku } from "@/lib/types";
import { OcrLineItemRow } from "@/components/OcrLineItem";
import { cn } from "@/lib/utils";

type Screen =
  | "list"
  | "camera"
  | "processing"
  | { type: "results"; invoice: Invoice };

export default function InvoicePage() {
  const params = useParams();
  const visitId = params.invoiceId as string; // route param is actually visitId
  const router = useRouter();
  const { user } = useAuthStore();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [screen, setScreen] = useState<Screen>("list");
  const [tacoSkus, setTacoSkus] = useState<TacoSku[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await getVisitInvoices(visitId);
      const raw = res.data;
      const arr = Array.isArray(raw) ? raw : raw?.data ?? [];
      setInvoices(arr as unknown as Invoice[]);
    } catch {
      setInvoices([]);
    }
  }, [visitId]);

  useEffect(() => {
    if (!user) { router.replace("/auth/login"); return; }
    fetchInvoices();
    getTacoSkus().then((r) => setTacoSkus(r.data?.data ?? r.data ?? [])).catch(() => {});
  }, [user, router, fetchInvoices]);

  const handleFileSelect = async (file: File) => {
    setScreen("processing");
    try {
      const res = await uploadInvoice(visitId, file);
      const invoiceId = res.data.id;
      // Poll until done
      let attempts = 0;
      while (attempts < 15) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusRes = await getInvoice(invoiceId);
        const inv = statusRes.data as Invoice;
        if (inv.status === "done") {
          await fetchInvoices();
          setScreen({ type: "results", invoice: inv });
          return;
        }
        if (inv.status === "failed") {
          setScreen("camera");
          return;
        }
        attempts++;
      }
      // Timeout
      setScreen("camera");
    } catch {
      setScreen("camera");
    }
  };

  const handleLineItemUpdate = async (
    invoiceId: string,
    lineItemId: string,
    updates: Partial<InvoiceLineItem>
  ) => {
    try {
      await updateLineItem(invoiceId, lineItemId, updates);
      await fetchInvoices();
    } catch {
      // silent
    }
  };

  // Camera screen
  if (screen === "camera") {
    return (
      <div className="min-h-screen bg-taco-page flex flex-col phone-shell">
        <div className="bg-white border-b border-taco-divider px-5 py-3 flex items-center gap-3">
          <button onClick={() => setScreen("list")} className="p-1">
            <ChevronLeft size={22} className="text-taco-sub" />
          </button>
          <div className="text-[18px] font-semibold">Foto Invoice</div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <div className="w-full aspect-[3/4] bg-gray-900 rounded-2xl flex items-center justify-center">
            <Camera size={48} className="text-white/40" />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-[56px] bg-taco-accent text-white font-semibold text-[16px] rounded-xl flex items-center justify-center gap-2"
          >
            <Camera size={20} />
            Ambil Foto Invoice
          </button>
          <button onClick={() => setScreen("list")} className="text-[14px] text-taco-sub">
            Batal
          </button>
        </div>
      </div>
    );
  }

  // Processing screen
  if (screen === "processing") {
    return (
      <div className="min-h-screen bg-taco-page flex flex-col phone-shell">
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
          <div className="w-12 h-12 border-4 border-taco-accent border-t-transparent rounded-full animate-spin" />
          <div className="text-[18px] font-semibold text-taco-text">Memproses invoice…</div>
          <div className="text-[14px] text-taco-sub text-center">
            AI sedang membaca dan mengekstrak data dari foto invoice
          </div>
        </div>
      </div>
    );
  }

  // OCR Results screen
  if (typeof screen === "object" && screen.type === "results") {
    const inv = screen.invoice;
    const lineItems = inv.line_items ?? [];
    return (
      <div className="min-h-screen bg-taco-page flex flex-col phone-shell">
        <div className="bg-white border-b border-taco-divider px-5 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setScreen("list")} className="p-1">
            <ChevronLeft size={22} className="text-taco-sub" />
          </button>
          <div className="flex-1">
            <div className="text-[18px] font-semibold">Hasil OCR</div>
            <div className="text-[13px] text-taco-sub">{lineItems.length} item ditemukan</div>
          </div>
        </div>
        <div className="flex-1 px-4 py-4 space-y-2 overflow-y-auto no-scrollbar pb-32">
          {lineItems.map((item, i) => (
            <OcrLineItemRow
              key={item.id}
              item={item}
              tacoSkus={tacoSkus}
              rowIndex={i}
              prevPrice={i > 0 ? lineItems[i - 1].unit_price : undefined}
              onUpdate={(updates) => handleLineItemUpdate(inv.id, item.id, updates)}
            />
          ))}
          {lineItems.length === 0 && (
            <div className="text-center py-8 text-taco-sub text-[14px]">
              Foto tidak terbaca — coba ambil ulang
            </div>
          )}
        </div>
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-taco-divider px-5 pb-8 pt-3 phone-shell mx-auto">
          <button
            onClick={async () => {
              await fetchInvoices();
              setScreen("list");
            }}
            className="w-full h-[56px] bg-taco-text text-white font-semibold text-[16px] rounded-xl"
          >
            Simpan Invoice
          </button>
        </div>
      </div>
    );
  }

  // Invoice list (main screen)
  return (
    <div className="min-h-screen bg-taco-page flex flex-col phone-shell">
      <div className="bg-white border-b border-taco-divider px-5 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-1">
          <ChevronLeft size={22} className="text-taco-sub" />
        </button>
        <div className="flex-1">
          <div className="text-[18px] font-semibold">Kompetitor Hub</div>
          <div className="text-[13px] text-taco-sub">S8 — Invoice kompetitor</div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto no-scrollbar pb-32">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-taco-page border border-taco-border flex items-center justify-center">
              <Camera size={28} className="text-taco-muted" />
            </div>
            <div className="text-[16px] text-taco-text font-medium">Belum ada invoice</div>
            <div className="text-[14px] text-taco-sub text-center">
              Foto invoice kompetitor untuk mengekstrak data harga otomatis
            </div>
          </div>
        ) : (
          invoices.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              expanded={expandedId === inv.id}
              onToggle={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
              tacoSkus={tacoSkus}
              onUpdateItem={(lineItemId, updates) => handleLineItemUpdate(inv.id, lineItemId, updates)}
            />
          ))
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-taco-divider px-5 pb-8 pt-3 phone-shell mx-auto">
        <button
          onClick={() => setScreen("camera")}
          className="w-full h-[56px] bg-taco-accent text-white font-semibold text-[16px] rounded-xl flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Tambah Invoice
        </button>
      </div>
    </div>
  );
}

function InvoiceCard({
  invoice,
  expanded,
  onToggle,
  tacoSkus,
  onUpdateItem,
}: {
  invoice: Invoice;
  expanded: boolean;
  onToggle: () => void;
  tacoSkus: TacoSku[];
  onUpdateItem: (lineItemId: string, updates: Partial<InvoiceLineItem>) => void;
}) {
  const itemCount = invoice.line_items?.length ?? 0;
  const unclear = invoice.line_items?.filter((i) => i.is_unclear).length ?? 0;

  return (
    <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[64px] text-left"
      >
        <div className="w-12 h-12 rounded-lg bg-taco-page border border-taco-border flex items-center justify-center flex-shrink-0">
          <Camera size={20} className="text-taco-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-taco-text truncate">
            {invoice.competitor_brand ?? "Invoice Kompetitor"}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[13px] text-taco-sub">{itemCount} item</span>
            {unclear > 0 && (
              <span className="flex items-center gap-1 text-[12px] text-taco-warning">
                <AlertTriangle size={11} />
                {unclear} perlu review
              </span>
            )}
            <span
              className={cn(
                "text-[12px] px-2 py-0.5 rounded-full font-medium",
                invoice.status === "done"
                  ? "bg-emerald-50 text-taco-success"
                  : invoice.status === "processing"
                  ? "bg-amber-50 text-taco-warning"
                  : "bg-red-50 text-taco-error"
              )}
            >
              {invoice.status === "done" ? "Tersimpan" : invoice.status === "processing" ? "Diproses" : "Gagal"}
            </span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={18} className="text-taco-muted flex-shrink-0" />
        ) : (
          <ChevronDown size={18} className="text-taco-muted flex-shrink-0" />
        )}
      </button>

      {expanded && invoice.line_items && (
        <div className="border-t border-taco-divider px-4 py-3 space-y-2">
          {invoice.line_items.map((item, i) => (
            <OcrLineItemRow
              key={item.id}
              item={item}
              tacoSkus={tacoSkus}
              rowIndex={i}
              prevPrice={i > 0 ? invoice.line_items![i - 1].unit_price : undefined}
              onUpdate={(updates) => onUpdateItem(item.id, updates)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
