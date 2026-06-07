"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  MicButton,
  PicMultiPicker,
  VisitContextChips,
  VisitObjectivePicker,
  type PicEntry,
  type ContextOption,
  type ObjectiveOption,
} from "@/components/mobile";
import { useAuthStore } from "@/lib/store";
import {
  getVisit,
  getVisitContexts,
  getVisitObjectives,
  updateVisitSection,
  uploadVoiceRecording,
} from "@/lib/api";

interface InfoSectionData {
  pics?: PicEntry[];
  objective_id?: string | null;
  context_ids?: string[];
  notes?: string;
  audio_url?: string | null;
  audio_duration_sec?: number | null;
}

function mmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function InfoKunjunganPage() {
  const router = useRouter();
  const params = useParams();
  const visitId = params?.id as string;
  const { user } = useAuthStore();

  const [pics, setPics] = useState<PicEntry[]>([]);
  const [objectiveId, setObjectiveId] = useState<string | null>(null);
  const [contextIds, setContextIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDur, setAudioDur] = useState<number | null>(null);

  const [objectives, setObjectives] = useState<ObjectiveOption[]>([]);
  const [contexts, setContexts] = useState<ContextOption[]>([]);
  const [loadingDicts, setLoadingDicts] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const load = useCallback(async () => {
    try {
      const [vRes, oRes, cRes] = await Promise.all([
        getVisit(visitId),
        getVisitObjectives().catch(() => null),
        getVisitContexts().catch(() => null),
      ]);
      const v =
        (vRes.data as { data?: { sections?: { section_key: string; data?: InfoSectionData }[] } })?.data ??
        (vRes.data as { sections?: { section_key: string; data?: InfoSectionData }[] });
      const section = v?.sections?.find(
        (s) => s.section_key === "s1_generic" || s.section_key === "info"
      );
      const d = (section?.data ?? {}) as InfoSectionData;
      if (Array.isArray(d.pics)) setPics(d.pics);
      if (typeof d.objective_id === "string") setObjectiveId(d.objective_id);
      if (Array.isArray(d.context_ids)) setContextIds(d.context_ids);
      if (typeof d.notes === "string") setNotes(d.notes);
      if (typeof d.audio_url === "string") setAudioUrl(d.audio_url);
      if (typeof d.audio_duration_sec === "number")
        setAudioDur(d.audio_duration_sec);

      const oList =
        ((oRes?.data as { data?: ObjectiveOption[] })?.data as ObjectiveOption[]) ??
        ((oRes?.data as ObjectiveOption[]) ?? []);
      setObjectives(
        Array.isArray(oList)
          ? oList.map((x) => ({
              id: String(x.id),
              label: String((x as { label?: string; name?: string }).label ?? (x as { name?: string }).name ?? x.id),
            }))
          : []
      );
      const cList =
        ((cRes?.data as { data?: ContextOption[] })?.data as ContextOption[]) ??
        ((cRes?.data as ContextOption[]) ?? []);
      setContexts(
        Array.isArray(cList)
          ? cList.map((x) => ({
              id: String(x.id),
              label: String((x as { label?: string; name?: string }).label ?? (x as { name?: string }).name ?? x.id),
            }))
          : []
      );
    } catch {
      setError("Gagal memuat data kunjungan.");
    } finally {
      setLoading(false);
      setLoadingDicts(false);
    }
  }, [visitId]);

  useEffect(() => {
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    load();
  }, [user, router, load]);

  const canSave = useMemo(() => pics.length > 0 || notes.trim().length > 0, [
    pics,
    notes,
  ]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: InfoSectionData = {
        pics,
        objective_id: objectiveId,
        context_ids: contextIds,
        notes,
        audio_url: audioUrl,
        audio_duration_sec: audioDur,
      };
      await updateVisitSection(visitId, "s1_generic", payload as Record<string, unknown>);
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
          const res = await uploadVoiceRecording(visitId, blob, "info");
          const data = res.data as { audio_url?: string; duration_sec?: number };
          if (data?.audio_url) {
            setAudioUrl(data.audio_url);
            setAudioDur(data.duration_sec ?? null);
          }
        } catch {
          setError("Gagal mengunggah rekaman. Coba lagi.");
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      setError("Tidak dapat mengakses mikrofon. Cek izin browser.");
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
            Info Kunjungan
          </div>
        </div>

        <div className="flex-1 px-3.5 pt-3.5 space-y-3">
          {/* Card 1 — PIC */}
          <div className="bg-white border border-taco-border rounded-2xl p-4">
            <PicMultiPicker value={pics} onChange={setPics} />
          </div>

          {/* Card 2 — Objective */}
          <div className="bg-white border border-taco-border rounded-2xl p-4">
            <VisitObjectivePicker
              options={objectives}
              value={objectiveId}
              onChange={setObjectiveId}
              loading={loadingDicts}
            />
          </div>

          {/* Card 3 — Context chips */}
          <div className="bg-white border border-taco-border rounded-2xl p-4">
            <VisitContextChips
              options={contexts}
              value={contextIds}
              onChange={setContextIds}
              loading={loadingDicts}
            />
          </div>

          {/* Card 4 — Notes + mic */}
          <div className="bg-white border border-taco-border rounded-2xl p-4">
            <label className="block text-[14px] font-medium text-taco-sub mb-2">
              Catatan penting
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Hal menarik dari kunjungan ini…"
              className="w-full min-h-[80px] border-[1.5px] border-taco-border rounded-[10px] px-3.5 py-3 text-[15px] text-taco-text bg-white outline-none resize-y focus:border-taco-sub"
            />
            <div className="mt-2.5">
              <MicButton
                size="md"
                label={recording ? "Berhenti merekam" : "Rekam catatan"}
                active={recording}
                onClick={recording ? stopRecording : startRecording}
              />
            </div>
            {audioUrl && (
              <div className="mt-3 flex items-center gap-2 text-[13px] text-taco-sub">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>
                  Putar rekaman{" "}
                  {typeof audioDur === "number" ? `(${mmSs(audioDur)})` : ""}
                </span>
              </div>
            )}
          </div>

          {error && (
            <div className="text-[13px] text-taco-error">{error}</div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 phone-shell mx-auto bg-white border-t border-taco-divider px-5 pt-3.5 pb-8 z-30">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
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
