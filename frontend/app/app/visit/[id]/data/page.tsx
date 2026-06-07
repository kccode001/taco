"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CategoryStockGrid,
  PosmRow,
  SkuTable,
  SumberDataPicker,
  type CategoryKey,
  type PosmEntry,
  type SkuFormData,
  type SkuItem,
  type StockCategory,
  type StockLevel,
  type SumberKey,
  EMPTY_SKU_FORM,
} from "@/components/mobile";
import { useAuthStore } from "@/lib/store";
import {
  getFotoKatalogResult,
  getTacoSkusPaginated,
  getVisit,
  updateVisitSection,
  uploadFotoKatalog,
  uploadPhoto,
} from "@/lib/api";

type MethodKey = "foto" | "suara" | "manual";

interface DataSectionData {
  pricing?: {
    method?: MethodKey;
    rows?: Record<string, SkuFormData>;
  };
  sumber?: {
    key?: SumberKey | null;
    lainnya_text?: string;
  };
  stock?: Partial<Record<StockCategory, StockLevel>>;
  posm?: PosmEntry[];
}

const PER_PAGE = 30;

function uid() {
  return `posm_${Math.random().toString(36).slice(2, 9)}`;
}

export default function DataTacoPage() {
  const router = useRouter();
  const params = useParams();
  const visitId = params?.id as string;
  const { user } = useAuthStore();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // D1 — pricing
  const [method, setMethod] = useState<MethodKey>("manual");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryKey>("all");
  const [skus, setSkus] = useState<SkuItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingSkus, setLoadingSkus] = useState(false);
  const [skuValues, setSkuValues] = useState<Record<string, SkuFormData>>({});
  const [preFilledIds, setPreFilledIds] = useState<Set<string>>(new Set());
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
  const [ocrUploading, setOcrUploading] = useState(false);
  const [ocrJobId, setOcrJobId] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  // D2 — sumber
  const [sumber, setSumber] = useState<SumberKey | null>(null);
  const [sumberText, setSumberText] = useState("");

  // D3 — stock per category
  const [stock, setStock] = useState<Partial<Record<StockCategory, StockLevel>>>({});

  // D4 — POSM rows
  const [posm, setPosm] = useState<PosmEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load visit + first page of SKUs
  const loadVisit = useCallback(async () => {
    try {
      const vRes = await getVisit(visitId);
      const v =
        (vRes.data as { data?: { sections?: { section_key: string; data?: DataSectionData }[] } })?.data ??
        (vRes.data as { sections?: { section_key: string; data?: DataSectionData }[] });
      const section = v?.sections?.find(
        (s) => s.section_key === "s4_pricing" || s.section_key === "data_taco"
      );
      const d = (section?.data ?? {}) as DataSectionData;
      if (d.pricing?.rows) setSkuValues(d.pricing.rows);
      if (d.pricing?.method) setMethod(d.pricing.method);
      if (d.sumber?.key) setSumber(d.sumber.key);
      if (d.sumber?.lainnya_text) setSumberText(d.sumber.lainnya_text);
      if (d.stock) setStock(d.stock);
      if (Array.isArray(d.posm)) setPosm(d.posm);
      if (d.pricing?.rows) {
        setPreFilledIds(new Set(Object.keys(d.pricing.rows)));
      }
    } catch {
      setError("Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  const loadSkus = useCallback(
    async (pageNum: number, reset = false) => {
      setLoadingSkus(true);
      try {
        const res = await getTacoSkusPaginated({
          search: search || undefined,
          category: category === "all" ? undefined : category,
          page: pageNum,
          per_page: PER_PAGE,
        });
        const list =
          (res.data?.data as SkuItem[]) ??
          ((res.data as unknown as SkuItem[]) ?? []);
        const meta = res.data?.meta;
        setSkus((prev) => (reset ? list : [...prev, ...list]));
        setHasMore(meta?.has_more ?? list.length === PER_PAGE);
        setPage(pageNum);
      } catch {
        if (reset) setSkus([]);
        setHasMore(false);
      } finally {
        setLoadingSkus(false);
      }
    },
    [search, category]
  );

  useEffect(() => {
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    loadVisit();
  }, [user, router, loadVisit]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadSkus(1, true);
    }, 250);
    return () => clearTimeout(t);
  }, [loadSkus]);

  const onValueChange = (id: string, data: SkuFormData) => {
    setSkuValues((prev) => ({ ...prev, [id]: data }));
    if (preFilledIds.has(id)) {
      setChangedIds((prev) => new Set(prev).add(id));
    }
  };

  // Foto Katalog OCR flow
  const handleFotoUpload = async (file: File) => {
    setOcrError(null);
    setOcrUploading(true);
    try {
      const res = await uploadFotoKatalog(visitId, file);
      const data = res.data as { job_id?: string };
      if (data?.job_id) {
        setOcrJobId(data.job_id);
      } else {
        setOcrError("OCR tidak menghasilkan job_id.");
      }
    } catch {
      setOcrError("Gagal mengunggah foto katalog.");
    } finally {
      setOcrUploading(false);
    }
  };

  useEffect(() => {
    if (!ocrJobId) return;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await getFotoKatalogResult(visitId, ocrJobId);
        const d = res.data;
        if (d?.status === "done" && d.matches) {
          setSkuValues((prev) => {
            const next = { ...prev };
            const fresh = new Set(preFilledIds);
            for (const m of d.matches!) {
              const cur = next[m.taco_sku_id] ?? { ...EMPTY_SKU_FORM };
              next[m.taco_sku_id] = {
                ...cur,
                harga_beli:
                  typeof m.harga_beli === "number"
                    ? String(m.harga_beli)
                    : cur.harga_beli,
                harga_jual:
                  typeof m.harga_jual === "number"
                    ? String(m.harga_jual)
                    : cur.harga_jual,
              };
              fresh.add(m.taco_sku_id);
            }
            setPreFilledIds(fresh);
            return next;
          });
          setOcrJobId(null);
        } else if (d?.status === "failed") {
          setOcrError("OCR gagal memproses foto.");
          setOcrJobId(null);
        } else {
          timer = setTimeout(poll, 2000);
        }
      } catch {
        timer = setTimeout(poll, 3000);
      }
    };
    timer = setTimeout(poll, 1500);
    return () => clearTimeout(timer);
  }, [ocrJobId, visitId, preFilledIds]);

  const handleUploadPosmPhoto = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const res = await uploadPhoto(visitId, file, "posm");
        return res.data?.url ?? null;
      } catch {
        return null;
      }
    },
    [visitId]
  );

  const addPosm = () => {
    setPosm((prev) => [
      ...prev,
      { id: uid(), nama: "", kondisi: null, photo_url: null },
    ]);
  };
  const updatePosm = (idx: number, entry: PosmEntry) => {
    setPosm((prev) => prev.map((p, i) => (i === idx ? entry : p)));
  };
  const removePosm = (idx: number) => {
    setPosm((prev) => prev.filter((_, i) => i !== idx));
  };

  const stepTitle = useMemo(() => {
    switch (step) {
      case 1:
        return "SKU & Harga";
      case 2:
        return "Sumber Data";
      case 3:
        return "Level Stok";
      case 4:
        return "Audit POSM";
    }
  }, [step]);

  // AC-9: POSM photo required per asset
  const posmValid =
    posm.length === 0 ||
    posm.every((p) => p.nama.trim().length > 0 && p.photo_url && p.kondisi);

  const handleNext = async () => {
    if (step < 4) {
      setStep((s) => (Math.min(4, s + 1) as 1 | 2 | 3 | 4));
      return;
    }
    if (!posmValid) {
      setError(
        "Setiap aset POSM butuh nama, foto, dan kondisi sebelum disimpan."
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: DataSectionData = {
        pricing: { method, rows: skuValues },
        sumber: { key: sumber, lainnya_text: sumberText },
        stock,
        posm,
      };
      await updateVisitSection(
        visitId,
        "s4_pricing",
        payload as unknown as Record<string, unknown>
      );
      router.push(`/app/visit/${visitId}`);
    } catch {
      setError("Gagal menyimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step === 1) {
      router.push(`/app/visit/${visitId}`);
    } else {
      setStep((s) => (Math.max(1, s - 1) as 1 | 2 | 3 | 4));
    }
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
        {/* Header w/ stepper */}
        <div className="bg-white border-b border-taco-divider px-5 pt-3 pb-3.5">
          <div className="flex items-center justify-between min-h-[36px]">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1 text-taco-sub text-[15px] min-h-[44px] -ml-1"
            >
              <ChevronLeft size={18} />
              Kembali
            </button>
            <span className="text-[13px] text-taco-sub font-medium">
              Langkah {step} dari 4
            </span>
          </div>
          <div className="text-[18px] font-semibold text-taco-text mt-1">
            {stepTitle}
          </div>
          <div className="flex gap-1.5 mt-2.5" aria-label={`Langkah ${step} dari 4`}>
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={cn(
                  "h-2 rounded-full transition-all",
                  n === step ? "bg-taco-text w-5" : "bg-taco-border w-2"
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 px-3.5 pt-3.5">
          {/* STEP 1 — Pricing */}
          {step === 1 && (
            <div className="bg-white border border-taco-border rounded-2xl p-4">
              <div className="text-[16px] font-semibold text-taco-text mb-3">
                SKU &amp; Harga TACO
              </div>

              {/* 3 method buttons */}
              <div className="flex gap-1.5 mb-4">
                {[
                  { key: "foto" as const, label: "Foto Katalog" },
                  { key: "suara" as const, label: "Rekam Suara" },
                  { key: "manual" as const, label: "Isi Manual" },
                ].map((m) => {
                  const on = method === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMethod(m.key)}
                      className={cn(
                        "flex-1 min-h-[52px] flex flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-semibold border-[1.5px] px-1 leading-tight",
                        on
                          ? "border-taco-text bg-taco-text text-white"
                          : "border-taco-border bg-white text-taco-sub"
                      )}
                    >
                      {m.key === "foto" && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      )}
                      {m.key === "suara" && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" />
                          <line x1="8" y1="23" x2="16" y2="23" />
                        </svg>
                      )}
                      {m.key === "manual" && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      )}
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {/* Method panels */}
              {method === "foto" && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => fotoRef.current?.click()}
                    disabled={ocrUploading || !!ocrJobId}
                    className="w-full h-20 border-2 border-dashed border-taco-border rounded-[10px] flex items-center justify-center gap-2 text-taco-muted text-[15px] disabled:opacity-60"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    {ocrUploading
                      ? "Mengunggah…"
                      : ocrJobId
                      ? "AI sedang membaca…"
                      : "Foto katalog atau papan harga toko"}
                  </button>
                  <input
                    ref={fotoRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFotoUpload(f);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                  <div className="text-[12px] text-taco-muted text-center mt-2">
                    AI membaca harga dan SKU secara otomatis
                  </div>
                  {ocrError && (
                    <div className="text-[12px] text-taco-error mt-2">
                      {ocrError}
                    </div>
                  )}
                </div>
              )}

              {method === "suara" && (
                <div className="mb-4 text-[13px] text-taco-muted leading-relaxed">
                  Gunakan tombol Rekam Suara di header untuk mendiktekan SKU dan
                  harga. Hasilnya akan muncul sebagai pre-fill di bawah.
                </div>
              )}

              <SkuTable
                skus={skus}
                values={skuValues}
                onValueChange={onValueChange}
                preFilledIds={preFilledIds}
                changedIds={changedIds}
                loading={loadingSkus}
                hasMore={hasMore}
                onLoadMore={() => loadSkus(page + 1)}
                search={search}
                onSearch={setSearch}
                category={category}
                onCategory={setCategory}
              />
            </div>
          )}

          {/* STEP 2 — Sumber Data */}
          {step === 2 && (
            <div className="bg-white border border-taco-border rounded-2xl p-4">
              <SumberDataPicker
                value={sumber}
                onChange={setSumber}
                lainnyaText={sumberText}
                onLainnyaTextChange={setSumberText}
              />
            </div>
          )}

          {/* STEP 3 — Stock per category */}
          {step === 3 && (
            <div className="bg-white border border-taco-border rounded-2xl p-4">
              <CategoryStockGrid value={stock} onChange={setStock} />
            </div>
          )}

          {/* STEP 4 — POSM */}
          {step === 4 && (
            <div className="bg-white border border-taco-border rounded-2xl p-4">
              <div className="text-[16px] font-semibold text-taco-text mb-1">
                Audit POSM
              </div>
              <div className="text-[13px] text-taco-sub mb-4">
                Tambah aset POSM yang ada di toko ini, lalu foto dan catat
                kondisinya
              </div>
              {posm.length === 0 ? (
                <div className="py-5 text-center text-taco-muted text-[14px]">
                  Belum ada aset ditambahkan
                </div>
              ) : (
                <div>
                  {posm.map((p, i) => (
                    <PosmRow
                      key={p.id}
                      entry={p}
                      onChange={(e) => updatePosm(i, e)}
                      onRemove={() => removePosm(i)}
                      onUploadPhoto={handleUploadPosmPhoto}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={addPosm}
                className="w-full h-12 mt-3 rounded-[10px] border-2 border-dashed border-taco-border text-[14px] text-taco-sub flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Tambah Aset POSM
              </button>
              {!posmValid && (
                <div className="text-[12px] text-taco-warning mt-2">
                  Lengkapi nama, foto, dan kondisi untuk setiap aset sebelum
                  simpan.
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-3 text-[13px] text-taco-error">{error}</div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 phone-shell mx-auto bg-white border-t border-taco-divider px-5 pt-3.5 pb-8 z-30">
          <button
            type="button"
            onClick={handleNext}
            disabled={saving}
            className="w-full h-14 rounded-xl bg-taco-accent text-white text-[16px] font-semibold disabled:opacity-50 active:bg-taco-accent-dark"
          >
            {saving ? "Menyimpan…" : step < 4 ? "Lanjut →" : "Simpan"}
          </button>
          <button
            type="button"
            onClick={handleBack}
            className="w-full h-11 mt-1.5 text-[15px] text-taco-sub"
          >
            Kembali
          </button>
        </div>
      </div>
    </div>
  );
}
