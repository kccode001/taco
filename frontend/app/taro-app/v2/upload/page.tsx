"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { getAreas, getStoresV2, unwrapList } from "@/lib/v2/api";
import type { AreaV2, StoreV2 } from "@/lib/v2/types";
import {
  detectV2StoreLocation,
  createV2Invoice,
  uploadV2Images,
  validateV2Images,
  deleteV2Image,
  processV2Invoice,
  getV2ImageUrl,
  type DetectStoreResponse,
  type DetectOutcome,
  type InvoiceImageV2,
} from "@/lib/v2/invoices";
import { TopBar } from "../../_components/TopBar";
import { useTaroGuard } from "../../_components/useTaroGuard";
import { ImageLightboxV2 } from "@/components/pwa-v2/ImageLightboxV2";
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
  XCircleIcon,
  ChevronRightIcon,
  ExpandIcon,
  RefreshIcon,
} from "../../_components/icons";

/** Photo-first flow phases:
 *  photo   → rep takes/picks the FIRST invoice photo (drives detection)
 *  invalid → image unusable (cut / blurry / not an invoice) — stop with reason
 *  confirm → auto/best_guess/manual store+area confirm/edit
 *  extra   → invoice created; optional add-more photos, then process
 *  success → done */
type Phase = "photo" | "invalid" | "confirm" | "extra" | "success";

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

/** Copy + tone for the confirm-screen banner, by detection outcome. */
function outcomeBanner(outcome: DetectOutcome): {
  tone: "ok" | "warn" | "muted";
  title: string;
  body: string;
} {
  switch (outcome) {
    case "auto":
      return {
        tone: "ok",
        title: "Toko & area terdeteksi otomatis",
        body: "Kami yakin dengan hasil ini. Periksa sebentar lalu lanjut.",
      };
    case "best_guess":
      return {
        tone: "warn",
        title: "Perkiraan toko & area",
        body: "Kami menebak dari foto — pastikan benar atau perbaiki di bawah.",
      };
    default:
      return {
        tone: "muted",
        title: "Toko & area tidak terbaca",
        body: "Tidak ada yang cocok dari foto. Silakan pilih toko & area manual.",
      };
  }
}

export default function TaroV2UploadPage() {
  const router = useRouter();
  const { ready } = useTaroGuard();

  const [phase, setPhase] = useState<Phase>("photo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Photo-first: the primary photo + its detection result ─────────────────
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [primaryThumb, setPrimaryThumb] = useState<string | null>(null);
  const [detect, setDetect] = useState<DetectStoreResponse | null>(null);
  const photoCameraRef = useRef<HTMLInputElement>(null);
  const photoGalleryRef = useRef<HTMLInputElement>(null);

  // ── Store + area (confirm phase) ──────────────────────────────────────────
  const [areas, setAreas] = useState<AreaV2[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<AreaV2 | null>(null);
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [areaQuery, setAreaQuery] = useState("");
  const [stores, setStores] = useState<StoreV2[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storeQuery, setStoreQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState<StoreV2 | null>(null);

  // ── Invoice + extra photos (extra phase) ──────────────────────────────────
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [images, setImages] = useState<ImageCard[]>([]);
  const thumbByName = useRef<Map<string, string>>(new Map());
  const extraCameraRef = useRef<HTMLInputElement>(null);
  const extraGalleryRef = useRef<HTMLInputElement>(null);
  const validateTimer = useRef<number | undefined>(undefined);

  const [preview, setPreview] = useState<string | null>(null);

  // ── Load areas once (needed for the manual / edit picker) ─────────────────
  useEffect(() => {
    let alive = true;
    setAreasLoading(true);
    getAreas()
      .then((res) => {
        if (alive) setAreas(unwrapList<AreaV2>(res.data));
      })
      .catch(() => {
        /* non-fatal; rep can still proceed if a match was auto-filled */
      })
      .finally(() => alive && setAreasLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // ── Load stores when an area is set (confirm phase) ────────────────────────
  useEffect(() => {
    if (!selectedArea) {
      setStores([]);
      return;
    }
    let alive = true;
    setStoresLoading(true);
    getStoresV2({ area_id: selectedArea.id })
      .then((res) => {
        if (alive) setStores(unwrapList<StoreV2>(res.data));
      })
      .catch(() => {
        if (alive) setStores([]);
      })
      .finally(() => alive && setStoresLoading(false));
    return () => {
      alive = false;
    };
  }, [selectedArea]);

  // Cleanup object URLs + timers on unmount.
  useEffect(() => {
    const thumbs = thumbByName.current;
    return () => {
      if (validateTimer.current) window.clearTimeout(validateTimer.current);
      thumbs.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const filteredAreas = useMemo(() => {
    const q = areaQuery.trim().toLowerCase();
    if (!q) return areas;
    return areas.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.code ?? "").toLowerCase().includes(q)
    );
  }, [areas, areaQuery]);

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

  // ── Phase 1: pick the primary photo ────────────────────────────────────────
  const pickPrimary = useCallback((files: FileList | File[]) => {
    const file = Array.from(files).find((f) => ACCEPTED.includes(f.type));
    if (!file) {
      setError("Hanya gambar JPG/PNG yang didukung.");
      return;
    }
    setPrimaryFile(file);
    setPrimaryThumb((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setError(null);
  }, []);

  /** Resolve the detected matches into prefilled selectedArea / selectedStore.
   *  Gated on band: only `auto`/`best_guess` are trustworthy enough to prefill.
   *  On the `manual` band the BE may still return a sub-threshold (weak)
   *  non-null match — never prefill from it, or the wrong store + wrong-area
   *  would be staged AND "Lanjut" would enable, letting bad data through.
   *  Manual band → clear everything; the rep must pick store + area by hand. */
  const applyDetectPrefill = useCallback(
    (res: DetectStoreResponse) => {
      if (res.outcome !== "auto" && res.outcome !== "best_guess") {
        setSelectedArea(null);
        setSelectedStore(null);
        setStoreQuery("");
        return;
      }
      // Area — prefer the loaded AreaV2 (full shape) but synthesize if absent.
      if (res.area_match) {
        const m = res.area_match;
        const found = areas.find((a) => a.id === m.id);
        setSelectedArea(found ?? { id: m.id, name: m.name, code: m.code });
      } else {
        setSelectedArea(null);
      }
      // Store — synthesize a StoreV2 from the match (id is a real StoreV2 id).
      if (res.store_match) {
        const m = res.store_match;
        setSelectedStore({
          id: m.id,
          name: m.name,
          area_id: m.area_id ?? res.area_match?.id ?? "",
        });
        setStoreQuery(m.name);
      } else {
        setSelectedStore(null);
        setStoreQuery("");
      }
    },
    [areas]
  );

  const runDetect = async () => {
    if (!primaryFile) {
      setError("Ambil atau pilih foto invoice dulu.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await detectV2StoreLocation(primaryFile);
      setDetect(res);
      if (res.outcome === "invalid") {
        setPhase("invalid");
      } else {
        applyDetectPrefill(res);
        setPhase("confirm");
      }
    } catch (err) {
      setError(`Gagal membaca foto: ${extractErrorMessage(err)}. Coba lagi.`);
    } finally {
      setBusy(false);
    }
  };

  const retakePhoto = () => {
    setPrimaryFile(null);
    setPrimaryThumb((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setDetect(null);
    setSelectedArea(null);
    setSelectedStore(null);
    setStoreQuery("");
    setError(null);
    setPhase("photo");
  };

  const canConfirm =
    !!selectedArea && (!!selectedStore || storeQuery.trim().length > 0);

  // ── Phase confirm → create invoice (adopts the staged photo) ───────────────
  const confirmStoreArea = async () => {
    if (!selectedArea) {
      setError("Pilih area dulu.");
      return;
    }
    const stagedId = detect?.staged_image_id;
    if (!stagedId) {
      setError("Foto belum siap. Ambil ulang foto invoice.");
      return;
    }
    const name = storeQuery.trim();
    if (!selectedStore && !name) {
      setError("Pilih atau ketik nama toko.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // An existing store (matched or exact-typed) → store_id; otherwise the BE
      // persists the free-typed store_name under this area.
      const store = selectedStore ?? exactStoreMatch;
      const inv = await createV2Invoice({
        area_id: selectedArea.id,
        ...(store ? { store_id: store.id } : { store_name: name }),
        staged_image_ids: [stagedId],
      });
      setInvoiceId(inv.id);
      if (primaryFile) thumbByName.current.set(primaryFile.name, primaryThumb ?? "");
      // Load the adopted (already-valid) image row(s). validate() re-checks only
      // pending images — the adopted photo is valid, so this is a no-op read.
      try {
        const imgs = await validateV2Images(inv.id);
        setImages(attachThumbs(imgs));
      } catch {
        setImages([]);
      }
      setPhase("extra");
    } catch (err) {
      setError(`Gagal membuat invoice: ${extractErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const attachThumbs = useCallback(
    (imgs: InvoiceImageV2[]): ImageCard[] =>
      imgs.map((i) => ({
        ...i,
        _thumb: i.file_name ? thumbByName.current.get(i.file_name) : undefined,
      })),
    []
  );

  const runValidation = useCallback(
    async (id: string, attempt = 0) => {
      try {
        const imgs = await validateV2Images(id);
        setImages(attachThumbs(imgs));
        const stillPending = imgs.some((i) => i.validation_status === "pending");
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

  // ── Phase extra: add more photos (validated normally) ──────────────────────
  const addExtraPhotos = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => ACCEPTED.includes(f.type));
    if (list.length === 0 || !invoiceId) return;
    list.forEach((f) => thumbByName.current.set(f.name, URL.createObjectURL(f)));
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

  const openImagePreview = async (img: ImageCard) => {
    if (img._thumb) {
      setPreview(img._thumb);
      return;
    }
    const url = (await getV2ImageUrl(img.id)) ?? img.url ?? null;
    if (url) setPreview(url);
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

  const allValid =
    images.length > 0 && images.every((i) => i.validation_status === "valid");
  const pendingCount = images.filter(
    (i) => i.validation_status === "pending"
  ).length;
  const invalidCount = images.filter(
    (i) => i.validation_status === "invalid"
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
      router.push("/taro-app/v2/history");
    } catch (err) {
      setError(`Gagal memproses: ${extractErrorMessage(err)}`);
      setBusy(false);
    }
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
      <div className="phone-shell flex flex-col min-h-screen">
        <TopBar
          title="Upload Invoice"
          right={
            <button
              type="button"
              onClick={() => router.push("/taro-app/v2/home")}
              className="text-[13px] font-medium text-taco-sub px-2 py-1"
            >
              Batal
            </button>
          }
        />

        {error && (
          <div className="mx-4 mt-3 text-[12px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* ── Phase 1: Photo first ─────────────────────────────────────────── */}
        {phase === "photo" && (
          <div className="px-4 pt-4 flex-1 flex flex-col pb-6">
            <div className="text-[15px] font-semibold text-taco-text">
              Foto invoice dulu
            </div>
            <div className="text-[13px] text-taco-sub mt-1">
              Ambil satu foto invoice yang jelas. Kami akan membaca toko & lokasi
              dari foto secara otomatis.
            </div>

            {!primaryThumb ? (
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => photoCameraRef.current?.click()}
                  className="min-h-[140px] rounded-xl border-2 border-dashed border-taco-border bg-white flex flex-col items-center justify-center gap-2 text-taco-sub active:bg-taco-page"
                >
                  <CameraIcon size={32} />
                  <span className="text-[13px] font-medium">Ambil Foto</span>
                </button>
                <button
                  type="button"
                  onClick={() => photoGalleryRef.current?.click()}
                  className="min-h-[140px] rounded-xl border-2 border-dashed border-taco-border bg-white flex flex-col items-center justify-center gap-2 text-taco-sub active:bg-taco-page"
                >
                  <PlusIcon size={32} />
                  <span className="text-[13px] font-medium">Dari Galeri</span>
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => primaryThumb && setPreview(primaryThumb)}
                  className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-taco-page border border-taco-border active:opacity-90"
                  aria-label="Lihat foto"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={primaryThumb}
                    alt="Foto invoice"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-2 right-2 w-7 h-7 rounded-md bg-black/55 text-white flex items-center justify-center">
                    <ExpandIcon size={14} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={retakePhoto}
                  className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-taco-sub"
                >
                  <RefreshIcon size={15} /> Ganti foto
                </button>
              </div>
            )}

            <input
              ref={photoCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) pickPrimary(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={photoGalleryRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) pickPrimary(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={runDetect}
                disabled={!primaryFile || busy}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <span className="animate-spin inline-flex">
                      <SpinnerIcon size={18} />
                    </span>
                    Membaca invoice…
                  </>
                ) : (
                  "Deteksi & Lanjut"
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: Invalid image ─────────────────────────────────────────── */}
        {phase === "invalid" && (
          <div className="px-4 pt-6 flex-1 flex flex-col pb-6">
            <div className="bg-white border border-red-200 rounded-2xl p-5 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 text-taco-error flex items-center justify-center">
                <XCircleIcon size={30} />
              </div>
              <div className="text-[16px] font-semibold text-taco-text mt-3">
                Foto tidak bisa digunakan
              </div>
              <div className="text-[13px] text-taco-sub mt-1.5 max-w-[300px]">
                {detect?.validation.invalid_reason ??
                  "Foto tidak memenuhi syarat. Pastikan seluruh invoice terlihat jelas dan tidak terpotong."}
              </div>
            </div>

            {primaryThumb && (
              <button
                type="button"
                onClick={() => setPreview(primaryThumb)}
                className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-taco-page border border-taco-border mt-4 active:opacity-90"
                aria-label="Lihat foto"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={primaryThumb}
                  alt="Foto invoice"
                  className="w-full h-full object-cover"
                />
              </button>
            )}

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={retakePhoto}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark transition-colors flex items-center justify-center gap-2"
              >
                <RefreshIcon size={18} /> Ganti Foto
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: Confirm store + area ──────────────────────────────────── */}
        {phase === "confirm" && detect && (
          <div className="px-4 pt-4 flex-1 flex flex-col pb-6">
            {(() => {
              const b = outcomeBanner(detect.outcome);
              const cls =
                b.tone === "ok"
                  ? "bg-emerald-50 border-emerald-100"
                  : b.tone === "warn"
                    ? "bg-amber-50 border-amber-100"
                    : "bg-taco-page border-taco-border";
              const icon =
                b.tone === "ok" ? (
                  <span className="text-taco-success">
                    <CheckIcon size={18} />
                  </span>
                ) : b.tone === "warn" ? (
                  <span className="text-taco-warning">
                    <AlertTriangleIcon size={18} />
                  </span>
                ) : (
                  <span className="text-taco-sub">
                    <SearchIcon size={18} />
                  </span>
                );
              const pct = Math.round((detect.match_confidence ?? 0) * 100);
              return (
                <div className={`rounded-xl border px-3 py-3 flex items-start gap-2.5 ${cls}`}>
                  <span className="mt-0.5 shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-taco-text">
                      {b.title}
                      {detect.outcome !== "manual" && pct > 0 && (
                        <span className="ml-1.5 text-[11px] font-medium text-taco-sub">
                          ({pct}% cocok)
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-taco-sub mt-0.5">{b.body}</div>
                    {(detect.detected.store_name_raw ||
                      detect.detected.location_raw) && (
                      <div className="text-[11px] text-taco-muted mt-1.5">
                        Terbaca dari foto:{" "}
                        {detect.detected.store_name_raw ?? "—"}
                        {detect.detected.location_raw
                          ? ` · ${detect.detected.location_raw}`
                          : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Area picker */}
            <label className="block text-[13px] font-medium text-taco-sub mb-1.5 mt-5">
              Area <span className="text-taco-error">*</span>
            </label>
            <button
              type="button"
              onClick={() => {
                setAreaQuery("");
                setAreaPickerOpen(true);
              }}
              className={[
                "w-full min-h-[52px] rounded-xl border px-4 flex items-center gap-2.5 text-left transition-colors",
                selectedArea
                  ? "border-taco-text bg-taco-accent-tint"
                  : "border-taco-border bg-white",
              ].join(" ")}
            >
              <span className="text-taco-sub shrink-0">
                <PinIcon size={18} />
              </span>
              <span className="flex-1 min-w-0">
                {selectedArea ? (
                  <>
                    <span className="block text-[15px] font-medium text-taco-text truncate">
                      {selectedArea.name}
                    </span>
                    {selectedArea.code && (
                      <span className="block text-[11px] text-taco-muted">
                        {selectedArea.code}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[15px] text-taco-muted">Pilih area…</span>
                )}
              </span>
              {selectedArea ? (
                <span className="text-taco-success shrink-0">
                  <CheckIcon size={18} />
                </span>
              ) : (
                <span className="text-taco-muted shrink-0 rotate-90 inline-flex">
                  <ChevronRightIcon size={18} />
                </span>
              )}
            </button>

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

                      {storeQuery.trim() && !exactStoreMatch && (
                        <button
                          type="button"
                          onClick={() => setSelectedStore(null)}
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

            <div className="mt-auto pt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmStoreArea}
                disabled={!canConfirm || busy}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors"
              >
                {busy ? "Menyimpan…" : "Lanjut"}
              </button>
              <button
                type="button"
                onClick={retakePhoto}
                disabled={busy}
                className="w-full min-h-[44px] rounded-xl text-[14px] font-medium text-taco-sub bg-white border border-taco-border disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
              >
                <RefreshIcon size={15} /> Ganti Foto
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: Extra photos + process ────────────────────────────────── */}
        {phase === "extra" && (
          <div className="px-4 pt-4 flex-1 flex flex-col pb-6">
            <div className="bg-white border border-taco-border rounded-xl px-4 py-3 mb-3">
              <div className="text-[12px] text-taco-sub">Toko</div>
              <div className="text-[15px] font-medium text-taco-text">
                {selectedStore?.name ?? storeQuery}
              </div>
              <div className="text-[12px] text-taco-muted mt-0.5">
                {selectedArea?.name}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[13px] font-medium text-taco-sub">
                Foto ({images.length})
              </div>
              <div className="text-[11px] text-taco-muted">
                {validCount} valid
                {invalidCount > 0 ? ` · ${invalidCount} bermasalah` : ""}
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
                    <button
                      type="button"
                      onClick={() => openImagePreview(img)}
                      aria-label="Lihat foto"
                      className="relative w-16 h-16 rounded-lg overflow-hidden bg-taco-page border border-taco-border shrink-0 active:opacity-80"
                    >
                      {img._thumb || img.url ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img._thumb ?? img.url ?? ""}
                            alt={img.file_name ?? "invoice"}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-md bg-black/55 text-white flex items-center justify-center pointer-events-none">
                            <ExpandIcon size={12} />
                          </span>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-taco-muted">
                          <StoreIcon size={20} />
                        </div>
                      )}
                    </button>
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
                Hapus atau ganti foto yang bermasalah. Proses hanya bisa saat semua
                foto valid.
              </div>
            )}

            <input
              ref={extraCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addExtraPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={extraGalleryRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addExtraPhotos(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => extraCameraRef.current?.click()}
                disabled={busy}
                className="min-h-[48px] rounded-xl border border-taco-border bg-white text-[13px] font-medium text-taco-sub flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <CameraIcon size={18} /> Tambah Foto
              </button>
              <button
                type="button"
                onClick={() => extraGalleryRef.current?.click()}
                disabled={busy}
                className="min-h-[48px] rounded-xl border border-taco-border bg-white text-[13px] font-medium text-taco-sub flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <PlusIcon size={18} /> Dari Galeri
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
      </div>

      {/* ── Area picker bottom sheet ─────────────────────────────────────── */}
      {areaPickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setAreaPickerOpen(false)}
          />
          <div className="relative z-10 bg-white rounded-t-2xl max-h-[75vh] flex flex-col">
            <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-taco-divider shrink-0">
              <span className="text-[15px] font-semibold text-taco-text">
                Pilih Area
              </span>
              <button
                type="button"
                onClick={() => setAreaPickerOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-taco-muted rounded-lg active:bg-taco-page"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-taco-divider shrink-0">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted pointer-events-none">
                  <SearchIcon size={16} />
                </span>
                <input
                  autoFocus
                  type="text"
                  inputMode="search"
                  placeholder="Cari nama atau kode area…"
                  value={areaQuery}
                  onChange={(e) => setAreaQuery(e.target.value)}
                  className="w-full h-[44px] border border-taco-border rounded-xl pl-9 pr-4 text-[15px] text-taco-text bg-taco-page outline-none focus:border-taco-text"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {areasLoading ? (
                <div className="px-4 py-5 text-[13px] text-taco-muted text-center">
                  Memuat area…
                </div>
              ) : filteredAreas.length === 0 ? (
                <div className="px-4 py-5 text-[13px] text-taco-muted text-center">
                  Tidak ada area yang cocok.
                </div>
              ) : (
                filteredAreas.map((a) => {
                  const sel = selectedArea?.id === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setSelectedArea(a);
                        setSelectedStore(null);
                        setStoreQuery("");
                        setAreaPickerOpen(false);
                      }}
                      className={[
                        "w-full min-h-[56px] px-4 flex items-center gap-3 text-left border-b border-taco-divider last:border-0",
                        sel ? "bg-taco-accent-tint" : "active:bg-taco-page",
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
                })
              )}
            </div>
          </div>
        </div>
      )}

      {preview && (
        <ImageLightboxV2 src={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
