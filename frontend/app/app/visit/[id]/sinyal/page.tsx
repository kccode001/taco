"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  BurningQuestionCard,
  DemandSignalChips,
  MicButton,
  ProjectInquiry,
  SentimenPicker,
  EMPTY_PROJECT,
  type DemandCategory,
  type ProjectData,
  type SentimenLevel,
} from "@/components/mobile";
import { useAuthStore } from "@/lib/store";
import {
  getBurningQuestionsForStore,
  getVisit,
  updateVisitSection,
  uploadVoiceRecording,
} from "@/lib/api";

interface SinyalSectionData {
  burning?: Record<string, string>;
  sentimen?: { level: SentimenLevel | null; notes: string };
  demand?: { categories: DemandCategory[]; detail: string };
  project?: ProjectData;
  peluang?: string;
  audio_url?: string | null;
}

interface BurningQuestionItem {
  id: string;
  text: string;
}

export default function SinyalPasarPage() {
  const router = useRouter();
  const params = useParams();
  const visitId = params?.id as string;
  const { user } = useAuthStore();

  const [storeId, setStoreId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<BurningQuestionItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [sentimenLevel, setSentimenLevel] = useState<SentimenLevel | null>(null);
  const [sentimenNotes, setSentimenNotes] = useState("");

  const [demand, setDemand] = useState<DemandCategory[]>([]);
  const [demandDetail, setDemandDetail] = useState("");

  const [project, setProject] = useState<ProjectData>(EMPTY_PROJECT);
  const [peluang, setPeluang] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const load = useCallback(async () => {
    try {
      const vRes = await getVisit(visitId);
      const v =
        (vRes.data as { data?: { store_id?: string; sections?: { section_key: string; data?: SinyalSectionData }[] } })?.data ??
        (vRes.data as { store_id?: string; sections?: { section_key: string; data?: SinyalSectionData }[] });
      if (v?.store_id) setStoreId(v.store_id);

      const section = v?.sections?.find(
        (s) => s.section_key === "s9_demand" || s.section_key === "sinyal"
      );
      const d = (section?.data ?? {}) as SinyalSectionData;
      if (d.burning) setAnswers(d.burning);
      if (d.sentimen) {
        setSentimenLevel(d.sentimen.level ?? null);
        setSentimenNotes(d.sentimen.notes ?? "");
      }
      if (d.demand) {
        setDemand(d.demand.categories ?? []);
        setDemandDetail(d.demand.detail ?? "");
      }
      if (d.project) setProject(d.project);
      if (typeof d.peluang === "string") setPeluang(d.peluang);

      if (v?.store_id) {
        try {
          const bqRes = await getBurningQuestionsForStore(v.store_id);
          const list =
            ((bqRes.data as { data?: BurningQuestionItem[] })?.data as BurningQuestionItem[]) ??
            ((bqRes.data as BurningQuestionItem[]) ?? []);
          setQuestions(
            Array.isArray(list)
              ? list.map((q) => ({ id: String(q.id), text: String(q.text) }))
              : []
          );
        } catch {
          setQuestions([]);
        }
      }
    } catch {
      setError("Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => {
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    load();
  }, [user, router, load]);

  void storeId;

  // AC-10: Burning Qs required when assigned
  const burningComplete = useMemo(
    () =>
      questions.length === 0 ||
      questions.every((q) => (answers[q.id] ?? "").trim().length > 0),
    [questions, answers]
  );

  const canSave = burningComplete;

  const handleSave = async () => {
    if (!canSave) {
      setError(
        "Jawab semua pertanyaan wajib (Burning Questions) sebelum menyimpan."
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: SinyalSectionData = {
        burning: answers,
        sentimen: { level: sentimenLevel, notes: sentimenNotes },
        demand: { categories: demand, detail: demandDetail },
        project,
        peluang,
      };
      await updateVisitSection(
        visitId,
        "s9_demand",
        payload as unknown as Record<string, unknown>
      );
      router.push(`/app/visit/${visitId}`);
    } catch {
      setError("Gagal menyimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        try {
          await uploadVoiceRecording(visitId, blob, "sinyal");
        } catch {
          setError("Gagal mengunggah rekaman.");
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      setError("Tidak dapat mengakses mikrofon.");
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-taco-page flex items-center justify-center">
        <div className="w-11 h-11 rounded-full border-2 border-taco-border border-t-taco-text taco-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[180px]">
        {/* Header */}
        <div className="bg-white border-b border-taco-divider px-5 pt-3 pb-3.5">
          <div className="flex items-center justify-between min-h-[36px]">
            <button
              type="button"
              onClick={() => router.push(`/app/visit/${visitId}`)}
              className="inline-flex items-center gap-1 text-taco-sub text-[15px] min-h-[44px] -ml-1"
            >
              <ChevronLeft size={18} />
              Kembali
            </button>
            <MicButton
              size="sm"
              label={recording ? "Berhenti" : "Rekam Suara"}
              active={recording}
              onClick={recording ? stopRecording : startRecording}
            />
          </div>
          <div className="text-[18px] font-semibold text-taco-text mt-1">
            Sinyal Pasar
          </div>
        </div>

        <div className="flex-1 px-3.5 pt-3.5 space-y-3.5">
          {/* Burning Questions — FIRST, RED */}
          {questions.length > 0 && (
            <div
              className="bg-[#FFF5F5] border border-red-200 rounded-[12px] p-4"
              style={{ borderLeftWidth: 3, borderLeftColor: "#D32F2F" }}
            >
              <div className="flex items-center gap-1.5 mb-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D32F2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                </svg>
                <span className="text-[14px] font-bold text-[#B91C1C]">
                  Harus Dijawab — {questions.length} pertanyaan wajib
                </span>
              </div>
              {questions.map((q) => (
                <BurningQuestionCard
                  key={q.id}
                  questionId={q.id}
                  text={q.text}
                  answer={answers[q.id] ?? ""}
                  onAnswerChange={(s) =>
                    setAnswers((prev) => ({ ...prev, [q.id]: s }))
                  }
                />
              ))}
            </div>
          )}

          {/* Sinyal Toko — merged */}
          <div className="bg-white border border-taco-border rounded-2xl p-4">
            <div className="text-[16px] font-bold text-taco-text mb-1">
              Sinyal Toko
            </div>
            <div className="text-[13px] text-taco-sub mb-4">
              Kondisi toko dan sinyal pasar dari percakapan dengan pemilik
            </div>

            {/* 2a Sentimen */}
            <div className="mb-5">
              <SentimenPicker
                value={sentimenLevel}
                onChange={setSentimenLevel}
                notes={sentimenNotes}
                onNotesChange={setSentimenNotes}
              />
            </div>

            <div className="h-px bg-taco-divider mb-5" />

            {/* 2b Demand */}
            <div className="mb-5">
              <DemandSignalChips
                value={demand}
                onChange={setDemand}
                detail={demandDetail}
                onDetailChange={setDemandDetail}
              />
            </div>

            <div className="h-px bg-taco-divider mb-5" />

            {/* 2c Project */}
            <div className="mb-5">
              <ProjectInquiry value={project} onChange={setProject} />
            </div>

            <div className="h-px bg-taco-divider mb-5" />

            {/* 2d Peluang */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-[15px] font-semibold text-taco-text">
                  Peluang atau catatan lain
                </div>
                <MicButton
                  size="sm"
                  label="Rekam"
                  active={recording}
                  onClick={recording ? stopRecording : startRecording}
                />
              </div>
              <textarea
                value={peluang}
                onChange={(e) => setPeluang(e.target.value)}
                placeholder="Hal lain yang perlu diperhatikan manajemen…"
                className="w-full min-h-[80px] border-[1.5px] border-taco-border rounded-[10px] px-3.5 py-3 text-[15px] text-taco-text bg-white outline-none resize-y focus:border-taco-sub"
              />
            </div>
          </div>

          {error && (
            <div className="text-[13px] text-taco-error">{error}</div>
          )}
          {!burningComplete && questions.length > 0 && (
            <div className="text-[12px] text-taco-warning">
              Lengkapi {questions.length} pertanyaan wajib di atas sebelum
              menyimpan.
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 phone-shell mx-auto bg-white border-t border-taco-divider px-5 pt-3.5 pb-8 z-30">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave}
            className="w-full h-14 rounded-xl bg-taco-accent text-white text-[16px] font-semibold disabled:opacity-50 active:bg-taco-accent-dark"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/app/visit/${visitId}`)}
            className="w-full h-11 mt-1.5 text-[15px] text-taco-sub"
          >
            Kembali
          </button>
        </div>
      </div>
    </div>
  );
}
