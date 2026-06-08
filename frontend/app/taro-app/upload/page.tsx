"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { useAuthStore } from "@/lib/store";
import {
  bulkUploadTaroInvoices,
  getTaroUploadsInProgress,
  type TaroInProgressUpload,
  type TaroProgressStage,
} from "@/lib/api";
import { TopBar } from "../_components/TopBar";
import { BottomNav } from "../_components/BottomNav";
import { useTaroGuard } from "../_components/useTaroGuard";
import {
  CameraIcon,
  CheckIcon,
  CloseIcon,
  PinIcon,
  PlusIcon,
} from "../_components/icons";

type Step = 1 | 2 | 3;

interface QueueItem {
  id: string;
  file: File;
  thumbnail?: string;
}

const ACCEPTED = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
const ACCEPT_ATTR = "image/jpeg,image/png,application/pdf";

const STAGE_LABEL: Record<TaroProgressStage, string> = {
  queued: "Antrian",
  processing: "Memproses",
  ocr: "OCR berjalan",
  mapping: "Memetakan SKU",
  done: "Selesai",
  failed: "Gagal",
};

const LS_DRAFT_KEY = "taro_upload_draft_v1";

interface DraftState {
  step: Step;
  storeName: string;
  uploadIds?: string[];
  fileNames?: string[];
  startedAt?: string;
}

function readDraft(): DraftState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftState;
  } catch {
    return null;
  }
}

function writeDraft(d: DraftState | null) {
  if (typeof window === "undefined") return;
  try {
    if (!d) window.localStorage.removeItem(LS_DRAFT_KEY);
    else window.localStorage.setItem(LS_DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
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

export default function TaroUploadPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { ready } = useTaroGuard();

  const [step, setStep] = useState<Step>(1);
  const [storeName, setStoreName] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploadIds, setUploadIds] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TaroInProgressUpload[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Hydrate draft on mount so refresh mid-flow doesn't lose context.
  useEffect(() => {
    const d = readDraft();
    if (d) {
      setStep(d.step);
      setStoreName(d.storeName);
      if (d.uploadIds) setUploadIds(d.uploadIds);
      if (d.fileNames) setFileNames(d.fileNames);
    }
  }, []);

  const persistDraft = useCallback(
    (next: Partial<DraftState>) => {
      const merged: DraftState = {
        step,
        storeName,
        uploadIds,
        fileNames,
        ...next,
      };
      writeDraft(merged);
    },
    [step, storeName, uploadIds, fileNames]
  );

  // Poll real BE progress while step 3.
  useEffect(() => {
    if (step !== 3 || uploadIds.length === 0) return;
    let alive = true;
    let timer: number | undefined;
    // Drop synthetic local-* placeholder IDs from the polling set — those came
    // from a partial upload failure path and never get a real BE row.
    const realIds = uploadIds.filter((id) => !id.startsWith("local-"));

    async function tick() {
      try {
        const res = await getTaroUploadsInProgress();
        const data =
          ((res.data as { data?: TaroInProgressUpload[] })?.data ??
            (res.data as TaroInProgressUpload[])) ?? [];

        // The /uploads/in-progress endpoint only returns rows still in
        // queued/processing — when a row finishes (done/failed) it disappears.
        // So: any of our IDs missing from the response is treated as done.
        const byId = new Map(data.map((d) => [d.id, d]));
        const merged: TaroInProgressUpload[] = realIds.map((id, idx) => {
          const live = byId.get(id);
          if (live) {
            return {
              ...live,
              stage_label: live.stage_label ?? STAGE_LABEL[live.status],
            };
          }
          // Not in the active set anymore → finished.
          return {
            id,
            file_name: fileNames[idx] ?? `Invoice ${idx + 1}`,
            region_id: user?.region_id ?? null,
            region_display: user?.region_display ?? null,
            status: "done" as TaroProgressStage,
            progress_percent: 100,
            stage_label: STAGE_LABEL.done,
            uploaded_at: new Date().toISOString(),
          };
        });

        if (!alive) return;
        setProgress(merged);

        const stillRunning = merged.some(
          (r) =>
            r.status === "queued" ||
            r.status === "processing" ||
            r.status === "ocr" ||
            r.status === "mapping"
        );
        if (stillRunning) {
          timer = window.setTimeout(tick, 3000);
        } else {
          handleAllDone(merged);
        }
      } catch (err) {
        if (!alive) return;
        setError(`Tidak bisa cek status: ${extractErrorMessage(err)}`);
        // Keep polling — BE may recover.
        timer = window.setTimeout(tick, 5000);
      }
    }

    function handleAllDone(rows: TaroInProgressUpload[]) {
      writeDraft(null);
      const firstDone = rows.find((r) => r.status === "done");
      const firstId = firstDone?.id ?? rows[0]?.id ?? realIds[0];
      if (!firstId) return;
      window.setTimeout(() => {
        if (alive) router.push(`/taro-app/upload/${firstId}`);
      }, 800);
    }

    if (realIds.length === 0) {
      // Nothing real to poll — surface the error state and let the user retry.
      setError("Upload tidak menghasilkan invoice. Coba lagi.");
      return;
    }

    tick();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, uploadIds.join(",")]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => ACCEPTED.includes(f.type));
    const items: QueueItem[] = list.map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      file: f,
      thumbnail: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));
    setQueue((q) => [...q, ...items]);
    setError(null);
  }, []);

  const goStep2 = () => {
    if (!storeName.trim()) {
      setError("Isi nama toko dulu.");
      return;
    }
    setError(null);
    setStep(2);
    persistDraft({ step: 2 });
  };

  const handleStartProcess = async () => {
    if (queue.length === 0) {
      setError("Tambah minimal satu foto invoice.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await bulkUploadTaroInvoices(
        queue.map((q) => q.file),
        user?.region_id ?? undefined,
        storeName.trim()
      );
      const payload = res.data as unknown;
      // BE returns an array of {id, file_name, status, region_id, store_name}
      // — older shape returned {invoice_ids: []}. Support both.
      let ids: string[] = [];
      if (Array.isArray(payload)) {
        ids = (payload as Array<{ id?: string }>)
          .map((r) => r?.id)
          .filter((x): x is string => !!x);
      } else if (payload && typeof payload === "object") {
        const obj = payload as { invoice_ids?: string[]; data?: Array<{ id?: string }> };
        if (Array.isArray(obj.invoice_ids)) ids = obj.invoice_ids;
        else if (Array.isArray(obj.data))
          ids = obj.data
            .map((r) => r?.id)
            .filter((x): x is string => !!x);
      }

      if (ids.length === 0) {
        throw new Error(
          "Server menerima upload tapi tidak mengembalikan ID invoice."
        );
      }

      const names = queue.map((q) => q.file.name);
      const startedAt = new Date().toISOString();
      setUploadIds(ids);
      setFileNames(names);
      setStep(3);
      writeDraft({
        step: 3,
        storeName,
        uploadIds: ids,
        fileNames: names,
        startedAt,
      });
    } catch (err) {
      setError(`Upload gagal: ${extractErrorMessage(err)}. Coba lagi.`);
    } finally {
      setSubmitting(false);
    }
  };

  const removeItem = (id: string) =>
    setQueue((q) => q.filter((i) => i.id !== id));

  const handleCancel = () => {
    writeDraft(null);
    router.push("/taro-app/home");
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-taco-page flex items-center justify-center text-[13px] text-taco-muted">
        Memuat…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[96px]">
        <TopBar title="Upload Invoice" />

        {/* Stepper */}
        <div className="bg-white border-b border-taco-divider px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            {[1, 2, 3].map((n) => {
              const active = n === step;
              const done = n < step;
              return (
                <div key={n} className="flex items-center gap-2 flex-1">
                  <div
                    className={[
                      "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold border",
                      done
                        ? "bg-taco-success text-white border-taco-success"
                        : active
                          ? "bg-taco-text text-white border-taco-text"
                          : "bg-white text-taco-muted border-taco-border",
                    ].join(" ")}
                  >
                    {done ? <CheckIcon size={14} /> : n}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={[
                        "text-[12px] truncate",
                        active
                          ? "text-taco-text font-semibold"
                          : "text-taco-sub",
                      ].join(" ")}
                    >
                      {n === 1 ? "Toko" : n === 2 ? "Foto" : "Proses"}
                    </div>
                  </div>
                  {n < 3 && (
                    <div
                      className={[
                        "h-px flex-1",
                        n < step ? "bg-taco-success" : "bg-taco-divider",
                      ].join(" ")}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-3 text-[12px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="px-4 pt-4 flex-1 flex flex-col">
            {/* Wilayah (pre-filled read-only) */}
            <div>
              <label className="block text-[13px] font-medium text-taco-sub mb-1.5">
                Wilayah Anda
              </label>
              <div className="bg-white border border-taco-border rounded-xl px-4 py-3 flex items-center gap-2 text-[14px] text-taco-text">
                <span className="text-taco-sub">
                  <PinIcon size={16} />
                </span>
                <span className="font-medium">
                  {user?.region_display ?? "Belum ditetapkan"}
                </span>
              </div>
              <div className="text-[11px] text-taco-muted mt-1.5">
                Otomatis terikat ke wilayah ASM Anda — tidak bisa diubah.
              </div>
            </div>

            {/* Nama Toko */}
            <div className="mt-5">
              <label className="block text-[13px] font-medium text-taco-sub mb-1.5">
                Nama Toko <span className="text-taco-error">*</span>
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => {
                  setStoreName(e.target.value);
                  persistDraft({ storeName: e.target.value });
                }}
                placeholder="Nama toko yang Anda kunjungi"
                className="w-full h-[52px] border border-taco-border rounded-xl px-4 text-[16px] text-taco-text bg-white outline-none focus:border-taco-text"
              />
              <div className="text-[11px] text-taco-muted mt-1.5">
                Contoh: Toko Bangunan Jaya · UD Sumber Makmur
              </div>
            </div>

            {/* Spacer + CTA */}
            <div className="mt-auto pt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={goStep2}
                disabled={!storeName.trim()}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors"
              >
                Lanjut
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="w-full min-h-[44px] rounded-xl text-[14px] font-medium text-taco-sub bg-white border border-taco-border"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="px-4 pt-4 flex-1 flex flex-col">
            <div className="bg-white border border-taco-border rounded-xl px-4 py-3 mb-3">
              <div className="text-[12px] text-taco-sub">Toko</div>
              <div className="text-[15px] font-medium text-taco-text">
                {storeName}
              </div>
            </div>

            <div className="text-[13px] font-medium text-taco-sub mb-1.5">
              Foto Invoice ({queue.length} foto)
            </div>

            {/* Picker tiles */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="min-h-[110px] rounded-xl border-2 border-dashed border-taco-border bg-white flex flex-col items-center justify-center gap-1.5 text-taco-sub active:bg-taco-page"
              >
                <CameraIcon size={28} />
                <span className="text-[13px] font-medium">Ambil Foto</span>
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="min-h-[110px] rounded-xl border-2 border-dashed border-taco-border bg-white flex flex-col items-center justify-center gap-1.5 text-taco-sub active:bg-taco-page"
              >
                <PlusIcon size={28} />
                <span className="text-[13px] font-medium">Pilih dari Galeri</span>
              </button>
            </div>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {/* Thumbnails */}
            {queue.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {queue.map((q) => (
                  <div
                    key={q.id}
                    className="relative aspect-square rounded-lg overflow-hidden bg-taco-page border border-taco-border"
                  >
                    {q.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={q.thumbnail}
                        alt={q.file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-taco-muted font-semibold">
                        PDF
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeItem(q.id)}
                      aria-label="Hapus"
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto pt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleStartProcess}
                disabled={queue.length === 0 || submitting}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors"
              >
                {submitting ? "Mengunggah…" : "Mulai Proses"}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full min-h-[44px] rounded-xl text-[14px] font-medium text-taco-sub bg-white border border-taco-border"
              >
                Kembali
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="px-4 pt-4 flex-1 flex flex-col">
            <div className="bg-white border border-taco-border rounded-xl px-4 py-3 mb-3">
              <div className="text-[12px] text-taco-sub">Toko</div>
              <div className="text-[15px] font-medium text-taco-text">
                {storeName}
              </div>
            </div>

            <div className="text-[13px] font-medium text-taco-sub mb-2">
              Memproses {progress.length || uploadIds.length} invoice
            </div>

            <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
              {(progress.length ? progress : initialPlaceholders(uploadIds, fileNames)).map(
                (it, idx) => {
                  const done = it.status === "done";
                  const failed = it.status === "failed";
                  const pct = Math.max(
                    0,
                    Math.min(100, it.progress_percent ?? 0)
                  );
                  const barClass = failed
                    ? "bg-taco-error"
                    : done
                      ? "bg-taco-success"
                      : "bg-taco-info";
                  const stage = it.stage_label ?? STAGE_LABEL[it.status];
                  return (
                    <div
                      key={it.id}
                      className="px-4 py-3 border-b border-taco-divider last:border-0"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="text-[13px] font-medium text-taco-text truncate">
                          {fileNames[idx] ?? it.file_name ?? `Invoice ${idx + 1}`}
                        </div>
                        <div className="text-[11px] text-taco-sub">{pct}%</div>
                      </div>
                      <div className="h-1.5 w-full bg-taco-page rounded-full overflow-hidden">
                        <div
                          className={`h-full ${barClass} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] mt-1.5">
                        <span
                          className={[
                            failed
                              ? "text-taco-error font-medium"
                              : done
                                ? "text-taco-success font-medium"
                                : "text-taco-info font-medium",
                          ].join(" ")}
                        >
                          {stage}
                        </span>
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            <div className="mt-3 text-[12px] text-taco-muted text-center">
              Biasanya selesai dalam 10–30 detik per foto. Anda boleh tutup
              halaman — kami simpan progresnya.
            </div>

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={() => router.push("/taro-app/home")}
                className="w-full min-h-[44px] rounded-xl text-[14px] font-medium text-taco-sub bg-white border border-taco-border"
              >
                Tutup & Cek Nanti
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function initialPlaceholders(
  ids: string[],
  names: string[]
): TaroInProgressUpload[] {
  return ids.map((id, idx) => ({
    id,
    file_name: names[idx] ?? `Invoice ${idx + 1}`,
    region_display: null,
    status: "queued" as TaroProgressStage,
    progress_percent: 5,
    stage_label: "Antrian",
    uploaded_at: new Date().toISOString(),
  }));
}
