"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Mic,
  CheckCircle,
  AlertCircle,
  Pencil,
  Camera,
  Plus,
  Trash2,
  Copy,
} from "lucide-react";
import { useAuthStore, useVisitDraftStore } from "@/lib/store";
import {
  createVisit,
  updateVisitSection,
  submitVisit,
  getVisitInvoices,
  getVisitObjectives,
  getVisitContexts,
  getBurningQuestions,
  getPosm,
} from "@/lib/api";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "s1_generic", label: "S1 — Informasi Umum", short: "Info Kunjungan" },
  { key: "s2_notable", label: "S2 — Hal Penting", short: "Hal Penting" },
  { key: "s3_burning", label: "S3 — Burning Questions", short: "Burning Q" },
  { key: "s4_pricing", label: "S4 — Harga TACO", short: "Harga TACO" },
  { key: "s5_volume", label: "S5 — Volume TACO", short: "Volume TACO" },
  { key: "s6_stock", label: "S6 — Stok & Kondisi", short: "Stok TACO" },
  { key: "s7_posm", label: "S7 — POSM Audit", short: "POSM" },
  { key: "s8_competitor", label: "S8 — Kompetitor Hub", short: "Kompetitor" },
  { key: "s9_demand", label: "S9 — Sinyal Pasar", short: "Sinyal Pasar" },
  { key: "s10_sentiment", label: "S10 — Sentimen Pemilik", short: "Sentimen" },
];

type ViewMode = "overview" | "voice_entry" | "recording" | "processing" | string;

export default function VisitNewPage() {
  const params = useParams();
  const storeId = params.id as string;
  const router = useRouter();
  const { user } = useAuthStore();
  const { drafts, setDraft, updateSection, clearDraft } = useVisitDraftStore();

  const [visitId, setVisitId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [priorDaysAgo, setPriorDaysAgo] = useState<number | null>(null);
  const [isPrefilled, setIsPrefilled] = useState(false);
  const [sections, setSections] = useState<Record<string, Record<string, unknown>>>({});
  const [priorSections, setPriorSections] = useState<Record<string, Record<string, unknown>>>({});
  const [view, setView] = useState<ViewMode>("overview");
  const [submitting, setSubmitting] = useState(false);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [objectives, setObjectives] = useState<{ id: string; name: string }[]>([]);
  const [contexts, setContexts] = useState<{ id: string; name: string }[]>([]);
  const [burningQuestions, setBurningQuestions] = useState<{ id: string; text: string }[]>([]);
  const [posms, setPosms] = useState<{ id: string; name: string }[]>([]);

  const initVisit = useCallback(async () => {
    const draft = drafts[storeId];
    if (draft?.visit_id) {
      setVisitId(draft.visit_id);
      setSections(draft.sections);
      setIsPrefilled(draft.is_prefilled);
      setPriorDaysAgo(draft.prior_visit_days_ago ?? null);
    } else {
      const res = await createVisit(storeId);
      const visit = res.data;
      setVisitId(visit.id);
      setStoreName(visit.store_name ?? "");
      const sectionMap: Record<string, Record<string, unknown>> = {};
      const priorMap: Record<string, Record<string, unknown>> = {};
      for (const s of visit.sections ?? []) {
        sectionMap[s.section_key] = s.data ?? {};
        if (s.prefilled_from_visit_id) priorMap[s.section_key] = s.data ?? {};
      }
      setSections(sectionMap);
      setPriorSections(priorMap);
      setIsPrefilled(!!visit.prior_visit_id);
      const daysAgo = visit.prior_visit_days_ago;
      setPriorDaysAgo(daysAgo ?? null);
      setDraft(storeId, {
        visit_id: visit.id,
        store_id: storeId,
        sections: sectionMap,
        is_prefilled: !!visit.prior_visit_id,
        prior_visit_days_ago: daysAgo,
      });
    }
  }, [storeId, drafts, setDraft]);

  useEffect(() => {
    if (!user) { router.replace("/auth/login"); return; }
    initVisit();
    getVisitObjectives().then((r) => setObjectives(r.data ?? [])).catch(() => {});
    getVisitContexts().then((r) => setContexts(r.data ?? [])).catch(() => {});
    getBurningQuestions().then((r) => setBurningQuestions(r.data ?? [])).catch(() => {});
    getPosm().then((r) => setPosms(r.data ?? [])).catch(() => {});
  }, [user, router, initVisit]);

  useEffect(() => {
    if (visitId) {
      getVisitInvoices(visitId)
        .then((r) => {
          const raw = r.data;
          const arr = Array.isArray(raw) ? raw : raw?.data ?? [];
          setInvoiceCount(arr.length);
        })
        .catch(() => {});
    }
  }, [visitId]);

  const updateSectionData = async (
    key: string,
    data: Record<string, unknown>
  ) => {
    setSections((prev) => ({ ...prev, [key]: data }));
    updateSection(storeId, key, data);
    if (visitId) {
      updateVisitSection(visitId, key, data).catch(() => {});
    }
  };

  const isSectionComplete = (key: string): boolean => {
    const data = sections[key];
    if (!data) return false;
    switch (key) {
      case "s1_generic":
        return !!(data.pic_name && data.visit_objective_id);
      case "s3_burning":
        return burningQuestions.every((q) => data[`bq_${q.id}`]);
      case "s7_posm":
        return posms.every((p) => data[`posm_${p.id}`]);
      default:
        return Object.keys(data).length > 0;
    }
  };

  const allComplete = SECTIONS.every((s) => isSectionComplete(s.key));

  const handleSubmit = async () => {
    if (!visitId || !allComplete) return;
    setSubmitting(true);
    try {
      await submitVisit(visitId);
      clearDraft(storeId);
      router.push("/app/stores");
    } catch {
      setSubmitting(false);
    }
  };

  if (view === "voice_entry") {
    return <VoiceEntryScreen onManual={() => setView("overview")} onBack={() => setView("overview")} onRecord={() => setView("recording")} storeName={storeName} />;
  }
  if (view === "recording") {
    return <RecordingScreen onStop={() => setView("processing")} onBack={() => setView("voice_entry")} />;
  }
  if (view === "processing") {
    return <ProcessingScreen onDone={() => setView("overview")} />;
  }
  if (view.startsWith("section:")) {
    const sKey = view.replace("section:", "");
    const sec = SECTIONS.find((s) => s.key === sKey);
    return (
      <SectionDetailScreen
        sectionKey={sKey}
        sectionLabel={sec?.label ?? sKey}
        data={sections[sKey] ?? {}}
        priorData={priorSections[sKey]}
        priorDaysAgo={priorDaysAgo}
        objectives={objectives}
        contexts={contexts}
        burningQuestions={burningQuestions}
        posms={posms}
        visitId={visitId}
        onSave={(d) => { updateSectionData(sKey, d); setView("overview"); }}
        onBack={() => setView("overview")}
        onInvoice={() => visitId && router.push(`/app/invoice/${visitId}`)}
      />
    );
  }

  // Overview
  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen">
        {/* Header */}
        <div className="bg-white border-b border-taco-divider sticky top-0 z-10">
          <div className="flex items-center gap-3 px-5 py-3 min-h-[52px]">
            <button onClick={() => router.push("/app/stores")} className="p-1 text-taco-sub">
              <ChevronLeft size={22} />
            </button>
            <div className="flex-1">
              <div className="text-[18px] font-semibold text-taco-text">Kunjungan Baru</div>
              <div className="text-[13px] text-taco-sub truncate">
                {storeName || "Memuat…"}
                {priorDaysAgo !== null && ` · Data dari ${priorDaysAgo} hari lalu`}
              </div>
            </div>
          </div>
        </div>

        {/* Section list */}
        <div className="flex-1 px-4 py-4 space-y-2 no-scrollbar overflow-y-auto pb-40">
          {!isPrefilled && (
            <div className="bg-taco-page border border-taco-border rounded-xl px-4 py-3 mb-4 text-[14px] text-taco-sub">
              Kunjungan pertama — tidak ada data sebelumnya.
            </div>
          )}
          {SECTIONS.map((sec) => {
            const complete = isSectionComplete(sec.key);
            const isInvoice = sec.key === "s8_competitor";
            return (
              <button
                key={sec.key}
                onClick={() => isInvoice ? (visitId && router.push(`/app/invoice/${visitId}`)) : setView(`section:${sec.key}`)}
                className="w-full flex items-center gap-3 bg-white border border-taco-border rounded-xl px-4 py-3 min-h-[64px] text-left hover:border-taco-accent transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-medium text-taco-text">{sec.short}</span>
                    {complete ? (
                      <CheckCircle size={15} className="text-taco-success flex-shrink-0" />
                    ) : (
                      <AlertCircle size={15} className="text-taco-muted flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-[13px] text-taco-sub mt-0.5">
                    {complete
                      ? "Selesai"
                      : isInvoice
                      ? `${invoiceCount} invoice ditambahkan`
                      : "Belum selesai"}
                  </div>
                </div>
                <Pencil size={15} className="text-taco-muted flex-shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-taco-divider px-5 pb-8 pt-3 phone-shell mx-auto">
          <div className="text-[13px] text-taco-sub mb-3 text-center">
            {SECTIONS.filter((s) => isSectionComplete(s.key)).length} dari 10 bagian selesai
          </div>
          <button
            onClick={handleSubmit}
            disabled={!allComplete || submitting}
            className="w-full h-[56px] bg-taco-accent text-white font-semibold text-[16px] rounded-xl disabled:bg-taco-muted transition-colors hover:bg-taco-accent-dark"
          >
            {submitting ? "Mengirim…" : "Kirim Kunjungan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VoiceEntryScreen({ onManual, onBack, onRecord, storeName }: { onManual: () => void; onBack: () => void; onRecord: () => void; storeName: string }) {
  return (
    <div className="min-h-screen bg-taco-page flex flex-col phone-shell">
      <div className="bg-white border-b border-taco-divider px-5 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1"><ChevronLeft size={22} className="text-taco-sub" /></button>
        <div className="text-[18px] font-semibold">Rekam Kunjungan</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
        <p className="text-[15px] text-taco-sub text-center">{storeName}</p>
        <button
          onClick={onRecord}
          className="w-full border-2 border-taco-accent rounded-2xl p-6 text-center"
        >
          <Mic size={36} className="mx-auto mb-3 text-taco-accent" />
          <div className="text-[17px] font-semibold text-taco-text">Rekam Suara</div>
          <div className="text-[13px] text-taco-sub mt-1">Ceritakan kunjungan Anda</div>
        </button>
        <button onClick={onManual} className="flex items-center gap-2 text-[14px] text-taco-sub">
          <Pencil size={15} />
          Isi Manual
        </button>
      </div>
    </div>
  );
}

function RecordingScreen({ onStop, onBack }: { onStop: () => void; onBack: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return (
    <div className="min-h-screen bg-taco-page flex flex-col phone-shell">
      <div className="bg-white border-b border-taco-divider px-5 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1"><ChevronLeft size={22} className="text-taco-sub" /></button>
        <div className="text-[18px] font-semibold">Merekam…</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="w-4 h-4 rounded-full bg-taco-error animate-pulse" />
        <div className="text-[32px] font-bold text-taco-text font-mono">{fmt(seconds)}</div>
        <div className="flex gap-1 items-end h-12">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="w-2 bg-taco-accent rounded-sm animate-pulse" style={{ height: `${12 + Math.random() * 30}px`, animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
        <button onClick={onStop} className="w-full h-[56px] bg-taco-accent text-white font-semibold text-[16px] rounded-xl">
          Berhenti & Proses
        </button>
      </div>
    </div>
  );
}

function ProcessingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const steps = ["Mentranskripsi rekaman…", "Mengisi form dari audio…", "Memeriksa kualitas data…"];
  useEffect(() => {
    const t = setInterval(() => setStep((s) => {
      if (s < steps.length - 1) return s + 1;
      clearInterval(t);
      setTimeout(onDone, 800);
      return s;
    }), 1200);
    return () => clearInterval(t);
  }, [onDone, steps.length]);
  return (
    <div className="min-h-screen bg-taco-page flex flex-col phone-shell">
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="w-10 h-10 border-4 border-taco-accent border-t-transparent rounded-full animate-spin" />
        <div className="space-y-2 w-full">
          {steps.map((s, i) => (
            <div key={i} className={cn("flex items-center gap-3 text-[14px]", i <= step ? "text-taco-text" : "text-taco-muted")}>
              {i < step ? <CheckCircle size={16} className="text-taco-success flex-shrink-0" /> : <div className={cn("w-4 h-4 rounded-full border-2 flex-shrink-0", i === step ? "border-taco-accent animate-pulse" : "border-taco-muted")} />}
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface SectionDetailProps {
  sectionKey: string;
  sectionLabel: string;
  data: Record<string, unknown>;
  priorData?: Record<string, unknown>;
  priorDaysAgo: number | null;
  objectives: { id: string; name: string }[];
  contexts: { id: string; name: string }[];
  burningQuestions: { id: string; text: string }[];
  posms: { id: string; name: string }[];
  visitId: string | null;
  onSave: (data: Record<string, unknown>) => void;
  onBack: () => void;
  onInvoice: () => void;
}

function SectionDetailScreen({
  sectionKey,
  sectionLabel,
  data,
  priorData,
  priorDaysAgo,
  objectives,
  contexts,
  burningQuestions,
  posms,
  onSave,
  onBack,
  onInvoice,
}: SectionDetailProps) {
  const [localData, setLocalData] = useState<Record<string, unknown>>({ ...data });

  const set = (key: string, value: unknown) =>
    setLocalData((prev) => ({ ...prev, [key]: value }));

  const isDelta = (key: string): boolean =>
    priorData !== undefined && localData[key] !== priorData[key];

  const renderField = (
    key: string,
    label: string,
    type: string = "text",
    placeholder?: string,
    multiline = false
  ) => {
    const delta = isDelta(key);
    return (
      <div className={cn("rounded-xl border border-taco-border bg-white p-4", delta && "border-l-[3px] border-l-taco-delta")}>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-[14px] font-medium text-taco-sub">{label}</label>
          {delta && <span className="text-[11px] font-semibold text-taco-delta bg-green-50 px-1.5 py-0.5 rounded">Diperbarui</span>}
        </div>
        {multiline ? (
          <div className="flex items-start gap-2">
            <textarea
              value={String(localData[key] ?? "")}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
              rows={3}
              className="flex-1 text-[16px] text-taco-text bg-transparent outline-none resize-none placeholder:text-taco-muted"
            />
            <VoiceRecorder onTranscript={(t) => set(key, (localData[key] ? `${localData[key]} ${t}` : t))} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type={type}
              value={String(localData[key] ?? "")}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
              className="flex-1 h-[44px] text-[16px] text-taco-text bg-transparent outline-none placeholder:text-taco-muted"
            />
            {type === "text" && <VoiceRecorder onTranscript={(t) => set(key, t)} />}
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (sectionKey) {
      case "s1_generic":
        return (
          <div className="space-y-3">
            {priorDaysAgo !== null && <div className="text-[13px] text-taco-sub bg-taco-page rounded-lg px-3 py-2">Data dari {priorDaysAgo} hari lalu</div>}
            {renderField("pic_name", "Nama PIC", "text", "Nama & jabatan PIC toko")}
            <div className="rounded-xl border border-taco-border bg-white p-4">
              <label className="text-[14px] font-medium text-taco-sub mb-2 block">Tujuan Kunjungan</label>
              <select
                value={String(localData.visit_objective_id ?? "")}
                onChange={(e) => set("visit_objective_id", e.target.value)}
                className="w-full h-[44px] text-[16px] text-taco-text bg-transparent outline-none"
              >
                <option value="">Pilih tujuan…</option>
                {objectives.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div className="rounded-xl border border-taco-border bg-white p-4">
              <label className="text-[14px] font-medium text-taco-sub mb-2 block">Konteks Kunjungan</label>
              <select
                value={String(localData.visit_context_id ?? "")}
                onChange={(e) => set("visit_context_id", e.target.value)}
                className="w-full h-[44px] text-[16px] text-taco-text bg-transparent outline-none"
              >
                <option value="">Pilih konteks…</option>
                {contexts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        );

      case "s2_notable":
        return renderField("notes", "Hal penting di kunjungan ini", "text", "Ceritakan hal penting…", true);

      case "s3_burning":
        return (
          <div className="space-y-3">
            {burningQuestions.length === 0 && (
              <div className="text-[14px] text-taco-sub text-center py-8">Tidak ada burning questions aktif</div>
            )}
            {burningQuestions.map((bq) => (
              <div key={bq.id} className="rounded-xl border border-taco-error/30 bg-red-50/50 p-4">
                <div className="flex items-start gap-2 mb-3">
                  <AlertCircle size={16} className="text-taco-error flex-shrink-0 mt-0.5" />
                  <div className="text-[15px] font-medium text-taco-text">{bq.text}</div>
                </div>
                <div className="flex items-start gap-2">
                  <textarea
                    value={String(localData[`bq_${bq.id}`] ?? "")}
                    onChange={(e) => set(`bq_${bq.id}`, e.target.value)}
                    placeholder="Jawaban Anda…"
                    rows={2}
                    className="flex-1 text-[15px] text-taco-text bg-white border border-taco-border rounded-lg p-3 outline-none resize-none placeholder:text-taco-muted"
                  />
                  <VoiceRecorder onTranscript={(t) => set(`bq_${bq.id}`, t)} />
                </div>
              </div>
            ))}
          </div>
        );

      case "s4_pricing": {
        const rows = (localData.rows as { sku: string; price: string }[]) || [{ sku: "", price: "" }];
        return (
          <div className="space-y-3">
            <div className="text-[13px] text-taco-sub">Harga jual TACO di toko ini</div>
            {rows.map((row, i) => (
              <div key={i} className="bg-white border border-taco-border rounded-xl p-3 space-y-2">
                <input
                  value={row.sku}
                  onChange={(e) => {
                    const next = [...rows]; next[i] = { ...next[i], sku: e.target.value };
                    set("rows", next);
                  }}
                  placeholder="Nama SKU TACO"
                  className="w-full h-[44px] text-[15px] text-taco-text border border-taco-border rounded-lg px-3 outline-none placeholder:text-taco-muted"
                />
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={row.price}
                    onChange={(e) => {
                      const next = [...rows]; next[i] = { ...next[i], price: e.target.value };
                      set("rows", next);
                    }}
                    placeholder="Harga (Rp)"
                    className="flex-1 h-[44px] text-[15px] text-taco-text border border-taco-border rounded-lg px-3 outline-none placeholder:text-taco-muted"
                  />
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...rows]; next[i] = { ...next[i], price: rows[i - 1].price };
                        set("rows", next);
                      }}
                      className="p-2 text-taco-muted hover:text-taco-text"
                      title="Salin dari baris atas"
                    >
                      <Copy size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => set("rows", rows.filter((_, j) => j !== i))}
                    className="p-2 text-taco-muted hover:text-taco-error"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set("rows", [...rows, { sku: "", price: "" }])}
              className="w-full h-[44px] border border-dashed border-taco-border rounded-xl text-[14px] text-taco-sub flex items-center justify-center gap-2"
            >
              <Plus size={15} />
              Tambah SKU
            </button>
          </div>
        );
      }

      case "s5_volume":
        return (
          <div className="space-y-3">
            {renderField("volume_notes", "Intel volume dari distributor/toko", "text", "Ceritakan…", true)}
            {renderField("top_sku", "SKU terlaris bulan ini", "text", "Nama SKU…")}
          </div>
        );

      case "s6_stock":
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-taco-border bg-white p-4">
              <label className="text-[14px] font-medium text-taco-sub mb-2 block">Stok di toko</label>
              <select value={String(localData.stock_level ?? "")} onChange={(e) => set("stock_level", e.target.value)} className="w-full h-[44px] text-[16px] text-taco-text bg-transparent outline-none">
                <option value="">Pilih kondisi stok…</option>
                <option value="full">Penuh (stok cukup)</option>
                <option value="low">Hampir habis</option>
                <option value="out">Habis / stockout</option>
              </select>
            </div>
            {renderField("display_quality", "Kondisi display TACO", "text", "Jelaskan kondisi display…", true)}
            {renderField("shelf_count", "Jumlah shelf facing", "number", "Angka")}
          </div>
        );

      case "s7_posm":
        return (
          <div className="space-y-3">
            <div className="text-[13px] text-taco-sub">Foto wajib per aset POSM</div>
            {posms.map((p) => {
              const val = localData[`posm_${p.id}`] as string | undefined;
              return (
                <div key={p.id} className="bg-white border border-taco-border rounded-xl p-4">
                  <div className="text-[15px] font-medium text-taco-text mb-3">{p.name}</div>
                  {val ? (
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 bg-taco-page rounded-lg border border-taco-border flex items-center justify-center">
                        <CheckCircle size={24} className="text-taco-success" />
                      </div>
                      <button onClick={() => set(`posm_${p.id}`, undefined)} className="text-[13px] text-taco-error">Hapus</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => set(`posm_${p.id}`, `photo_${p.id}_placeholder`)}
                      className="w-full h-[52px] border border-dashed border-taco-border rounded-lg flex items-center justify-center gap-2 text-[14px] text-taco-sub"
                    >
                      <Camera size={18} />
                      Foto {p.name}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );

      case "s8_competitor":
        return (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <p className="text-[14px] text-taco-sub text-center">Invoice kompetitor dikelola di halaman terpisah</p>
            <button
              onClick={onInvoice}
              className="w-full h-[56px] bg-taco-accent text-white font-semibold text-[16px] rounded-xl flex items-center justify-center gap-2"
            >
              <Camera size={20} />
              Buka Invoice Hub
            </button>
          </div>
        );

      case "s9_demand":
        return (
          <div className="space-y-3">
            {renderField("owner_sentiment_note", "Sentimen pemilik toko", "text", "Bagaimana sikap pemilik?", true)}
            {renderField("demand_signals", "Sinyal permintaan pasar", "text", "Produk apa yang banyak ditanya?", true)}
            <div className="rounded-xl border border-taco-border bg-white p-4">
              <label className="text-[14px] font-medium text-taco-sub mb-2 block">Ada proyek konstruksi di sekitar toko?</label>
              <div className="flex gap-3">
                {["Ya", "Tidak", "Tidak tahu"].map((v) => (
                  <button
                    key={v}
                    onClick={() => set("nearby_project", v)}
                    className={cn("flex-1 h-[44px] rounded-lg border text-[14px] font-medium transition-colors", localData.nearby_project === v ? "border-taco-accent bg-taco-accent-tint text-taco-accent" : "border-taco-border text-taco-sub")}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case "s10_sentiment":
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-taco-border bg-white p-4">
              <div className="text-[15px] font-medium text-taco-text mb-4">Rating hubungan dengan toko (1–5)</div>
              <div className="flex gap-3 justify-center">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => set("rating", n)}
                    className={cn("w-12 h-12 rounded-xl border-2 text-[18px] font-bold transition-colors",
                      localData.rating === n ? "border-taco-accent bg-taco-accent-tint text-taco-accent" : "border-taco-border text-taco-sub"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {renderField("sentiment_note", "Catatan hubungan", "text", "Kesan Anda dengan pemilik toko…", true)}
          </div>
        );

      default:
        return (
          <div className="text-[14px] text-taco-sub text-center py-8">
            Section ini belum ada form khusus.
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen">
        <div className="bg-white border-b border-taco-divider sticky top-0 z-10">
          <div className="flex items-center gap-3 px-5 py-3 min-h-[52px]">
            <button onClick={onBack} className="p-1"><ChevronLeft size={22} className="text-taco-sub" /></button>
            <div className="flex-1 text-[18px] font-semibold text-taco-text truncate">{sectionLabel}</div>
          </div>
        </div>

        <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto no-scrollbar pb-32">
          {renderContent()}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-taco-divider px-5 pb-8 pt-3 phone-shell mx-auto">
          <button
            onClick={() => onSave(localData)}
            className="w-full h-[56px] bg-taco-accent text-white font-semibold text-[16px] rounded-xl"
          >
            Simpan Bagian Ini
          </button>
        </div>
      </div>
    </div>
  );
}
