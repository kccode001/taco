"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { getAreas, getStoresV2, createStoreV2, unwrapList } from "@/lib/v2/api";
import type { AreaV2, StoreV2 } from "@/lib/v2/types";
import {
  createV2Invoice,
  uploadV2Images,
  validateV2Images,
  deleteV2Image,
  processV2Invoice,
  type InvoiceImageV2,
} from "@/lib/v2/invoices";
import { TopBar } from "../../_components/TopBar";
import { useTaroGuard } from "../../_components/useTaroGuard";
import {
  CameraIcon,
  CheckIcon,
  CloseIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  StoreIcon,
  SpinnerIcon,
  AlertTriangleIcon,
  ChevronLeftIcon,
} from "../../_components/icons";

type Step = 1 | 2 | 3 | 4;

interface QueueItem {
  id: string;
  file: File;
  thumbnail?: string;
}

type ImageCard = InvoiceImageV2 & { _thumb?: string };

const ACCEPTED = ["image/jpeg", "image/png", "image/jpg"];
const ACCEPT_ATTR = "image/jpeg,image/png";

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

export default function TaroV2UploadPage() {
  const router = useRouter();
  const { ready } = useTaroGuard();

  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — Area + Store
  const [areas, setAreas] = useState<AreaV2[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<AreaV2 | null>(null);
  const [stores, setStores] = useState<StoreV2[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storeQuery, setStoreQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState<StoreV2 | null>(null);

  // Step 2 — local photo queue (pre-upload)
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Step 3 — server images + validation
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [images, setImages] = useState<ImageCard[]>([]);
  const thumbByName = useRef<Map<string, string>>(new Map());

  const [busy, setBusy] = useState(false); // upload/validate/process in flight
  const validateTimer = useRef<number | undefined>(undefined);

  // ── Load areas on mount ──────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setAreasLoading(true);
    getAreas()
      .then((res) => {
        if (!alive) return;
        setAreas(unwrapList<AreaV2>(res.data));
      })
      .catch((err) => {
        if (!alive) return;
        setError(`Tidak bisa memuat daftar area: ${extractErrorMessage(err)}`);
      })
      .finally(() => alive && setAreasLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // ── Load stores when an area is picked ─────────────────────────────────────
  useEffect(() => {
    if (!selectedArea) {
      setStores([]);
      return;
    }
    let alive = true;
    setStoresLoading(true);
    getStoresV2({ area_id: selectedArea.id })
      .then((res) => {
        if (!alive) return;
        setStores(unwrapList<StoreV2>(res.data));
      })
      .catch(() => {
        // Non-fatal — agent can still free-type a new store.
        if (alive) setStores([]);
      })
      .finally(() => alive && setStoresLoading(false));
    return () => {
      alive = false;
    };
  }, [selectedArea]);

  // Cleanup object URLs + any pending validate timer on unmount.
  useEffect(() => {
    const thumbs = thumbByName.current;
    return () => {
      if (validateTimer.current) window.clearTimeout(validateTimer.current);
      thumbs.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const filteredStores = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) => s.name.toLowerCase().includes(q));
  }, [stores, storeQuery]);

  const exactStoreMatch = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    if (!q) return null;
    return stores.find((s) => s.name.trim().toLowerCase() === q) ?? null;
  }, [stores, storeQuery]);

  const canProceedStep1 =
    !!selectedArea && (!!selectedStore || storeQuery.trim().length > 0);

  // ── Step 1 → 2: ensure we have a concrete store_id ─────────────────────────
  const goStep2 = async () => {
    if (!selectedArea) {
      setError("Pilih area dulu.");
      return;
    }
    let store = selectedStore;
    // Free-typed a name with no selection → reuse exact match or create new.
    if (!store) {
      const name = storeQuery.trim();
      if (!name) {
        setError("Pilih atau ketik nama toko.");
        return;
      }
      if (exactStoreMatch) {
        store = exactStoreMatch;
      } else {
        setBusy(true);
        setError(null);
        try {
          const res = await createStoreV2({ area_id: selectedArea.id, name });
          const created =
            (res.data as { data?: StoreV2 })?.data ?? (res.data as StoreV2);
          store = created;
          setStores((prev) => [created, ...prev]);
        } catch (err) {
          setBusy(false);
          setError(`Gagal menyimpan toko baru: ${extractErrorMessage(err)}`);
          return;
        }
        setBusy(false);
      }
    }
    setSelectedStore(store);
    setStoreQuery(store!.name);
    setError(null);
    setStep(2);
  };

  // ── Local photo queue (step 2) ─────────────────────────────────────────────
  const addToQueue = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => ACCEPTED.includes(f.type));
    if (list.length === 0) {
      setError("Hanya gambar JPG/PNG yang didukung.");
      return;
    }
    const items: QueueItem[] = list.map((f) => ({
      id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      thumbnail: URL.createObjectURL(f),
    }));
    items.forEach((it) => {
      if (it.thumbnail) thumbByName.current.set(it.file.name, it.thumbnail);
    });
    setQueue((q) => [...q, ...items]);
    setError(null);
  }, []);

  const removeFromQueue = (id: string) =>
    setQueue((q) => q.filter((i) => i.id !== id));

  const attachThumbs = useCallback(
    (imgs: InvoiceImageV2[]): ImageCard[] =>
      imgs.map((i) => ({
        ...i,
        _thumb: i.file_name
          ? thumbByName.current.get(i.file_name)
          : undefined,
      })),
    []
  );

  // Re-validate, polling while any image is still `pending` (BE re-checks only
  // pending images, so repeated calls are safe + cheap).
  const runValidation = useCallback(
    async (id: string, attempt = 0) => {
      try {
        const imgs = await validateV2Images(id);
        setImages(attachThumbs(imgs));
        const stillPending = imgs.some(
          (i) => i.validation_status === "pending"
        );
        if (stillPending && attempt < 5) {
          validateTimer.current = window.setTimeout(
            () => runValidation(id, attempt + 1),
            2500
          );
        }
      } catch (err) {
        setError(`Validasi gagal: ${extractErrorMessage(err)}`);
      }
    },
    [attachThumbs]
  );

  // ── Step 2 → 3: create invoice, upload queued photos, validate ─────────────
  const uploadAndValidate = async () => {
    if (queue.length === 0) {
      setError("Tambah minimal satu foto invoice.");
      return;
    }
    if (!selectedArea || !selectedStore) {
      setError("Area atau toko belum lengkap.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let id = invoiceId;
      if (!id) {
        const inv = await createV2Invoice(selectedArea.id, selectedStore.id);
        id = inv.id;
        setInvoiceId(id);
      }
      await uploadV2Images(
        id,
        queue.map((q) => q.file)
      );
      setQueue([]);
      setStep(3);
      await runValidation(id);
    } catch (err) {
      setError(`Upload gagal: ${extractErrorMessage(err)}. Coba lagi.`);
    } finally {
      setBusy(false);
    }
  };

  // ── Step 3: add more photos (uploads + re-validates only the new ones) ─────
  const addMoreFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => ACCEPTED.includes(f.type));
    if (list.length === 0 || !invoiceId) return;
    list.forEach((f) =>
      thumbByName.current.set(f.name, URL.createObjectURL(f))
    );
    setBusy(true);
    setError(null);
    try {
      await uploadV2Images(invoiceId, list);
      await runValidation(invoiceId);
    } catch (err) {
      setError(`Gagal menambah foto: ${extractErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteV2Image(imageId);
      setImages((prev) => prev.filter((i) => i.id !== imageId));
    } catch (err) {
      setError(`Gagal menghapus foto: ${extractErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  // ── Step 3 → 4: all valid → kick OCR ───────────────────────────────────────
  const allValid =
    images.length > 0 &&
    images.every((i) => i.validation_status === "valid");
  const invalidCount = images.filter(
    (i) => i.validation_status === "invalid"
  ).length;
  const pendingCount = images.filter(
    (i) => i.validation_status === "pending"
  ).length;
  const validCount = images.filter(
    (i) => i.validation_status === "valid"
  ).length;

  const finishAndProcess = async () => {
    if (!invoiceId || !allValid) return;
    setBusy(true);
    setError(null);
    try {
      await processV2Invoice(invoiceId);
      if (validateTimer.current) window.clearTimeout(validateTimer.current);
      setStep(4);
    } catch (err) {
      setError(`Gagal memproses: ${extractErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const resetAll = () => {
    if (validateTimer.current) window.clearTimeout(validateTimer.current);
    thumbByName.current.forEach((url) => URL.revokeObjectURL(url));
    thumbByName.current.clear();
    setStep(1);
    setSelectedArea(null);
    setSelectedStore(null);
    setStoreQuery("");
    setQueue([]);
    setInvoiceId(null);
    setImages([]);
    setError(null);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-taco-page flex items-center justify-center text-[13px] text-taco-muted">
        Memuat…
      </div>
    );
  }

  const stepLabels = ["Toko", "Foto", "Validasi"];

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen">
        <TopBar
          title="Upload Invoice"
          right={
            step < 4 ? (
              <button
                type="button"
                onClick={() => router.push("/taro-app/home")}
                className="text-[13px] font-medium text-taco-sub px-2 py-1"
              >
                Batal
              </button>
            ) : undefined
          }
        />

        {/* Stepper (hidden on the success screen) */}
        {step < 4 && (
          <div className="bg-white border-b border-taco-divider px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              {[1, 2, 3].map((n) => {
                const active = n === step;
                const done = n < step;
                return (
                  <div key={n} className="flex items-center gap-2 flex-1">
                    <div
                      className={[
                        "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold border shrink-0",
                        done
                          ? "bg-taco-success text-white border-taco-success"
                          : active
                            ? "bg-taco-text text-white border-taco-text"
                            : "bg-white text-taco-muted border-taco-border",
                      ].join(" ")}
                    >
                      {done ? <CheckIcon size={14} /> : n}
                    </div>
                    <div
                      className={[
                        "text-[12px] truncate flex-1",
                        active
                          ? "text-taco-text font-semibold"
                          : "text-taco-sub",
                      ].join(" ")}
                    >
                      {stepLabels[n - 1]}
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
        )}

        {error && (
          <div className="mx-4 mt-3 text-[12px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* ── Step 1: Area + Store ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="px-4 pt-4 flex-1 flex flex-col pb-6">
            <label className="block text-[13px] font-medium text-taco-sub mb-1.5">
              Area <span className="text-taco-error">*</span>
            </label>
            {areasLoading ? (
              <div className="text-[13px] text-taco-muted py-3">Memuat area…</div>
            ) : areas.length === 0 ? (
              <div className="text-[13px] text-taco-muted bg-white border border-taco-border rounded-xl px-4 py-3">
                Belum ada area. Hubungi admin untuk menambahkan area.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {areas.map((a) => {
                  const sel = selectedArea?.id === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setSelectedArea(a);
                        setSelectedStore(null);
                        setStoreQuery("");
                      }}
                      className={[
                        "w-full min-h-[52px] rounded-xl border px-4 flex items-center gap-2.5 text-left transition-colors",
                        sel
                          ? "border-taco-text bg-taco-accent-tint"
                          : "border-taco-border bg-white",
                      ].join(" ")}
                    >
                      <span className="text-taco-sub shrink-0">
                        <PinIcon size={18} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium text-taco-text truncate">
                          {a.name}
                        </span>
                        {a.code && (
                          <span className="block text-[11px] text-taco-muted">
                            {a.code}
                          </span>
                        )}
                      </span>
                      {sel && (
                        <span className="text-taco-success shrink-0">
                          <CheckIcon size={18} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Store autocomplete (free-type-new) */}
            <div className="mt-5">
              <label className="block text-[13px] font-medium text-taco-sub mb-1.5">
                Nama Toko <span className="text-taco-error">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-taco-muted pointer-events-none">
                  <SearchIcon size={16} />
                </span>
                <input
                  type="text"
                  inputMode="text"
                  value={storeQuery}
                  disabled={!selectedArea}
                  onChange={(e) => {
                    setStoreQuery(e.target.value);
                    setSelectedStore(null);
                  }}
                  placeholder={
                    selectedArea ? "Cari atau ketik nama toko" : "Pilih area dulu"
                  }
                  className="w-full h-[52px] border border-taco-border rounded-xl pl-10 pr-4 text-[16px] text-taco-text bg-white outline-none focus:border-taco-text disabled:bg-taco-page disabled:text-taco-muted"
                />
              </div>

              {selectedArea && (
                <div className="mt-2 bg-white border border-taco-border rounded-xl overflow-hidden">
                  {storesLoading ? (
                    <div className="px-4 py-3 text-[13px] text-taco-muted">
                      Memuat toko…
                    </div>
                  ) : (
                    <>
                      {filteredStores.slice(0, 6).map((s) => {
                        const sel = selectedStore?.id === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSelectedStore(s);
                              setStoreQuery(s.name);
                            }}
                            className="w-full min-h-[48px] px-4 flex items-center gap-2.5 text-left border-b border-taco-divider last:border-0 active:bg-taco-page"
                          >
                            <span className="text-taco-sub shrink-0">
                              <StoreIcon size={16} />
                            </span>
                            <span className="flex-1 text-[14px] text-taco-text truncate">
                              {s.name}
                            </span>
                            {sel && (
                              <span className="text-taco-success shrink-0">
                                <CheckIcon size={16} />
                              </span>
                            )}
                          </button>
                        );
                      })}

                      {/* Free-type-new row */}
                      {storeQuery.trim() && !exactStoreMatch && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStore(null); // created on "Lanjut"
                          }}
                          className="w-full min-h-[48px] px-4 flex items-center gap-2.5 text-left border-b border-taco-divider last:border-0 active:bg-taco-page"
                        >
                          <span className="text-taco-accent shrink-0">
                            <PlusIcon size={16} />
                          </span>
                          <span className="flex-1 text-[14px] text-taco-text truncate">
                            Tambah toko baru:{" "}
                            <span className="font-semibold">
                              “{storeQuery.trim()}”
                            </span>
                          </span>
                        </button>
                      )}

                      {!storesLoading &&
                        filteredStores.length === 0 &&
                        !storeQuery.trim() && (
                          <div className="px-4 py-3 text-[13px] text-taco-muted">
                            Belum ada toko di area ini — ketik untuk menambah.
                          </div>
                        )}
                    </>
                  )}
                </div>
              )}
              <div className="text-[11px] text-taco-muted mt-1.5">
                Toko baru otomatis tersimpan untuk pemilihan berikutnya.
              </div>
            </div>

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={goStep2}
                disabled={!canProceedStep1 || busy}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors"
              >
                {busy ? "Menyimpan…" : "Lanjut"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Photos ───────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="px-4 pt-4 flex-1 flex flex-col pb-6">
            <div className="bg-white border border-taco-border rounded-xl px-4 py-3 mb-3">
              <div className="text-[12px] text-taco-sub">Toko</div>
              <div className="text-[15px] font-medium text-taco-text">
                {selectedStore?.name}
              </div>
              <div className="text-[12px] text-taco-muted mt-0.5">
                {selectedArea?.name}
              </div>
            </div>

            <div className="text-[13px] font-medium text-taco-sub mb-1.5">
              Foto Invoice ({queue.length} foto)
            </div>

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
                if (e.target.files) addToQueue(e.target.files);
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
                if (e.target.files) addToQueue(e.target.files);
                e.target.value = "";
              }}
            />

            {queue.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {queue.map((q) => (
                  <div
                    key={q.id}
                    className="relative aspect-square rounded-lg overflow-hidden bg-taco-page border border-taco-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={q.thumbnail}
                      alt={q.file.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeFromQueue(q.id)}
                      aria-label="Hapus"
                      className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center"
                    >
                      <CloseIcon size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto pt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={uploadAndValidate}
                disabled={queue.length === 0 || busy}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors"
              >
                {busy ? "Mengunggah…" : "Unggah & Validasi"}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={busy}
                className="w-full min-h-[44px] rounded-xl text-[14px] font-medium text-taco-sub bg-white border border-taco-border disabled:opacity-40"
              >
                Kembali
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Validation ───────────────────────────────────────────── */}
        {step === 3 && (
          <div className="px-4 pt-4 flex-1 flex flex-col pb-6">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[13px] font-medium text-taco-sub">
                Hasil Validasi ({images.length} foto)
              </div>
              <div className="text-[11px] text-taco-muted">
                {validCount} valid · {invalidCount} bermasalah
                {pendingCount > 0 ? ` · ${pendingCount} diperiksa` : ""}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {images.map((img) => {
                const valid = img.validation_status === "valid";
                const invalid = img.validation_status === "invalid";
                return (
                  <div
                    key={img.id}
                    className={[
                      "rounded-xl border bg-white p-2.5 flex gap-3",
                      invalid ? "border-red-200" : "border-taco-border",
                    ].join(" ")}
                  >
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-taco-page border border-taco-border shrink-0">
                      {img._thumb || img.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img._thumb ?? img.url ?? ""}
                          alt={img.file_name ?? "invoice"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-taco-muted">
                          <StoreIcon size={20} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      {valid && (
                        <div className="flex items-center gap-1.5 text-taco-success text-[13px] font-medium">
                          <CheckIcon size={16} /> Valid
                        </div>
                      )}
                      {invalid && (
                        <>
                          <div className="flex items-center gap-1.5 text-taco-error text-[13px] font-medium">
                            <AlertTriangleIcon size={15} /> Tidak valid
                          </div>
                          <div className="text-[12px] text-taco-sub mt-0.5">
                            {img.invalid_reason ??
                              "Foto tidak memenuhi syarat. Ganti foto."}
                          </div>
                        </>
                      )}
                      {img.validation_status === "pending" && (
                        <div className="flex items-center gap-1.5 text-taco-info text-[13px] font-medium">
                          <span className="animate-spin inline-flex">
                            <SpinnerIcon size={15} />
                          </span>
                          Memeriksa…
                        </div>
                      )}
                      {img.file_name && (
                        <div className="text-[11px] text-taco-muted truncate mt-0.5">
                          {img.file_name}
                        </div>
                      )}
                    </div>
                    {/* Delete is offered for any settled image (valid OR invalid)
                        so a rep can drop a wrong-but-readable photo, not just a
                        rejected one (A10). Hidden while a photo is still being
                        checked to avoid racing the validation poll. */}
                    {img.validation_status !== "pending" && (
                      <button
                        type="button"
                        onClick={() => handleDeleteImage(img.id)}
                        disabled={busy}
                        aria-label="Hapus foto"
                        className={[
                          "self-center min-h-[44px] px-3 rounded-lg text-[13px] font-medium bg-white disabled:opacity-40 shrink-0 border",
                          invalid
                            ? "border-red-200 text-taco-error active:bg-red-50"
                            : "border-taco-border text-taco-sub active:bg-taco-page",
                        ].join(" ")}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {invalidCount > 0 && (
              <div className="mt-3 text-[12px] text-taco-sub bg-taco-accent-tint border border-taco-accent/20 rounded-lg px-3 py-2">
                Hapus atau ganti foto yang bermasalah. Upload selesai hanya saat
                semua foto valid.
              </div>
            )}

            {/* add-more inputs */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addMoreFiles(e.target.files);
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
                if (e.target.files) addMoreFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={busy}
                className="min-h-[48px] rounded-xl border border-taco-border bg-white text-[13px] font-medium text-taco-sub flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <CameraIcon size={18} /> Ambil Foto
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="min-h-[48px] rounded-xl border border-taco-border bg-white text-[13px] font-medium text-taco-sub flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <PlusIcon size={18} /> Tambah dari Galeri
              </button>
            </div>

            <div className="mt-auto pt-6 flex flex-col gap-2">
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => invoiceId && runValidation(invoiceId)}
                  disabled={busy}
                  className="w-full min-h-[44px] rounded-xl text-[14px] font-medium text-taco-info bg-white border border-taco-border disabled:opacity-40"
                >
                  Periksa Lagi
                </button>
              )}
              <button
                type="button"
                onClick={finishAndProcess}
                disabled={!allValid || busy}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors"
              >
                {busy ? "Memproses…" : "Selesai & Proses"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Success ──────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="px-4 pt-10 flex-1 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-taco-success/10 text-taco-success flex items-center justify-center">
              <CheckIcon size={32} />
            </div>
            <div className="text-[18px] font-semibold text-taco-text mt-4">
              Invoice Terkirim
            </div>
            <div className="text-[13px] text-taco-sub mt-1.5 max-w-[280px]">
              Semua foto valid dan sudah diproses. Sistem sedang menjalankan OCR
              dan pemetaan SKU. Admin akan meninjau hasilnya.
            </div>

            <div className="mt-auto w-full pt-8 pb-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={resetAll}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark transition-colors"
              >
                Upload Invoice Lagi
              </button>
              <button
                type="button"
                onClick={() => router.push("/taro-app/home")}
                className="w-full min-h-[44px] rounded-xl text-[14px] font-medium text-taco-sub bg-white border border-taco-border flex items-center justify-center gap-1.5"
              >
                <ChevronLeftIcon size={16} /> Kembali ke Beranda
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
