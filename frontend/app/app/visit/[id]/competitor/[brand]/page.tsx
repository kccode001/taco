"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMPETITOR_BRANDS,
  CompetitorPosmRow,
  CompetitorPromoCard,
  CompetitorSkuCard,
  EMPTY_COMPETITOR_PROMO,
  EMPTY_COMPETITOR_SKU,
  type CompetitorBrand,
  type CompetitorPosmEntry,
  type CompetitorPromoData,
  type CompetitorSkuFormData,
} from "@/components/mobile";
import { useAuthStore } from "@/lib/store";
import {
  createVisitCompetitor,
  getVisitCompetitors,
  updateVisitCompetitor,
  uploadPhoto,
  type VisitCompetitor,
} from "@/lib/api";

interface SkuRow {
  id: string;
  data: CompetitorSkuFormData;
}
interface PromoRow {
  id: string;
  data: CompetitorPromoData;
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function brandSlug(b: string) {
  return b.toLowerCase().replace(/\s+/g, "-");
}

function resolveBrand(slug: string): CompetitorBrand | null {
  const lower = slug.toLowerCase();
  const match = COMPETITOR_BRANDS.find((b) => brandSlug(b) === lower);
  return (match as CompetitorBrand) ?? null;
}

export default function CompetitorBrandStepperPage() {
  const router = useRouter();
  const params = useParams();
  const visitId = params?.id as string;
  const brandSlugParam = (params?.brand as string) ?? "";
  const brand = resolveBrand(brandSlugParam);
  const { user } = useAuthStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [posms, setPosms] = useState<CompetitorPosmEntry[]>([]);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const [competitorId, setCompetitorId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!brand) {
      setLoading(false);
      return;
    }
    try {
      const res = await getVisitCompetitors(visitId);
      const list =
        (res.data as { data?: VisitCompetitor[] })?.data ??
        (res.data as VisitCompetitor[]);
      if (Array.isArray(list)) {
        const existing = list.find((c) => c.brand === brand);
        if (existing) {
          setCompetitorId(existing.id);
          const exSkus = (existing.skus as { id?: string; data?: CompetitorSkuFormData }[] | undefined) ?? [];
          const exPromos = (existing.promos as { id?: string; data?: CompetitorPromoData }[] | undefined) ?? [];
          const exPosms = (existing.posms as CompetitorPosmEntry[] | undefined) ?? [];
          setSkus(
            exSkus.map((s) => ({
              id: s.id || uid("ksku"),
              data: { ...EMPTY_COMPETITOR_SKU, ...(s.data ?? {}) },
            }))
          );
          setPromos(
            exPromos.map((p) => ({
              id: p.id || uid("kpromo"),
              data: { ...EMPTY_COMPETITOR_PROMO, ...(p.data ?? {}) },
            }))
          );
          setPosms(exPosms);
        }
      }
    } catch {
      // BE not ready — fresh form
    } finally {
      setLoading(false);
    }
  }, [visitId, brand]);

  useEffect(() => {
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (!brand) {
      router.replace(`/app/visit/${visitId}/competitor`);
      return;
    }
    load();
  }, [user, router, brand, visitId, load]);

  const handleUploadPhoto = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const res = await uploadPhoto(visitId, file, "kompetitor");
        return res.data?.url ?? null;
      } catch {
        return null;
      }
    },
    [visitId]
  );

  const addSku = () => {
    const id = uid("ksku");
    setSkus((prev) => [...prev, { id, data: { ...EMPTY_COMPETITOR_SKU } }]);
    setExpandedSku(id);
  };
  const updateSku = (id: string, data: CompetitorSkuFormData) => {
    setSkus((prev) => prev.map((s) => (s.id === id ? { ...s, data } : s)));
  };
  const removeSku = (id: string) => {
    setSkus((prev) => prev.filter((s) => s.id !== id));
    setExpandedSku((cur) => (cur === id ? null : cur));
  };

  const addPromo = () => {
    setPromos((prev) => [
      ...prev,
      { id: uid("kpromo"), data: { ...EMPTY_COMPETITOR_PROMO } },
    ]);
  };
  const updatePromo = (id: string, data: CompetitorPromoData) => {
    setPromos((prev) => prev.map((p) => (p.id === id ? { ...p, data } : p)));
  };
  const removePromo = (id: string) => {
    setPromos((prev) => prev.filter((p) => p.id !== id));
  };

  const addPosm = () => {
    setPosms((prev) => [
      ...prev,
      { id: uid("kposm"), nama: "", kondisi: null, photo_url: null },
    ]);
  };
  const updatePosm = (idx: number, entry: CompetitorPosmEntry) => {
    setPosms((prev) => prev.map((p, i) => (i === idx ? entry : p)));
  };
  const removePosm = (idx: number) => {
    setPosms((prev) => prev.filter((_, i) => i !== idx));
  };

  const stepTitle = useMemo(() => {
    if (step === 1) return "SKU Kompetitor";
    if (step === 2) return "Promo Kompetitor";
    return "POSM Kompetitor";
  }, [step]);

  const handleBack = () => {
    if (step === 1) {
      router.push(`/app/visit/${visitId}/competitor`);
    } else {
      setStep((s) => (Math.max(1, s - 1) as 1 | 2 | 3));
    }
  };

  const handleNext = async () => {
    if (step < 3) {
      setStep((s) => (Math.min(3, s + 1) as 1 | 2 | 3));
      return;
    }
    if (!brand) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        brand,
        skus,
        promos,
        posms,
        complete: true,
        updated_at: new Date().toISOString(),
      };
      try {
        if (competitorId) {
          await updateVisitCompetitor(visitId, competitorId, payload);
        } else {
          const res = await createVisitCompetitor(visitId, { brand });
          const id = (res.data as { id?: string })?.id;
          if (id) {
            setCompetitorId(id);
            await updateVisitCompetitor(visitId, id, payload);
          }
        }
      } catch {
        // BE not ready — let competitor list page work on stub data
      }
      router.push(`/app/visit/${visitId}/competitor`);
    } catch {
      setError("Gagal menyimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  if (!brand || loading) {
    return (
      <div className="min-h-screen bg-taco-page flex items-center justify-center">
        <div className="w-11 h-11 rounded-full border-2 border-taco-border border-t-taco-text taco-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[170px]">
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
              Langkah {step} dari 3
            </span>
          </div>
          <div className="text-[18px] font-bold text-taco-text mt-1">
            {brand}
          </div>
          <div className="text-[14px] text-taco-sub mt-0.5">{stepTitle}</div>
          <div className="flex gap-1.5 mt-2.5" aria-label={`Langkah ${step} dari 3`}>
            {[1, 2, 3].map((n) => (
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
          {step === 1 && (
            <div>
              {skus.length === 0 ? (
                <div className="py-6 text-center text-taco-muted text-[14px]">
                  Belum ada produk ditambahkan
                </div>
              ) : (
                skus.map((s, i) => (
                  <CompetitorSkuCard
                    key={s.id}
                    index={i}
                    expanded={expandedSku === s.id}
                    onToggle={() =>
                      setExpandedSku((cur) => (cur === s.id ? null : s.id))
                    }
                    data={s.data}
                    onChange={(d) => updateSku(s.id, d)}
                    onRemove={() => removeSku(s.id)}
                    onUploadPhoto={handleUploadPhoto}
                    previous={i > 0 ? skus[i - 1].data : undefined}
                  />
                ))
              )}
              <button
                type="button"
                onClick={addSku}
                className="w-full h-[52px] mt-1 rounded-[10px] border-2 border-dashed border-taco-border text-[14px] text-taco-sub font-medium flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Tambah Produk Kompetitor
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              {promos.length === 0 ? (
                <div className="py-6 text-center text-taco-muted text-[14px]">
                  Belum ada promo dicatat
                </div>
              ) : (
                promos.map((p, i) => (
                  <CompetitorPromoCard
                    key={p.id}
                    index={i}
                    data={p.data}
                    onChange={(d) => updatePromo(p.id, d)}
                    onRemove={() => removePromo(p.id)}
                  />
                ))
              )}
              <button
                type="button"
                onClick={addPromo}
                className="w-full h-[52px] mt-1 rounded-[10px] border-2 border-dashed border-taco-border text-[14px] text-taco-sub font-medium flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Tambah Promo Kompetitor
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="bg-white border border-taco-border rounded-2xl p-4">
              <div className="text-[16px] font-semibold text-taco-text mb-1">
                Audit POSM Kompetitor
              </div>
              <div className="text-[13px] text-taco-sub mb-3">
                Tambah materi promosi kompetitor yang terlihat di toko ini
              </div>
              {posms.length === 0 ? (
                <div className="py-5 text-center text-taco-muted text-[14px]">
                  Belum ada aset ditambahkan
                </div>
              ) : (
                <div>
                  {posms.map((p, i) => (
                    <CompetitorPosmRow
                      key={p.id}
                      entry={p}
                      onChange={(e) => updatePosm(i, e)}
                      onRemove={() => removePosm(i)}
                      onUploadPhoto={handleUploadPhoto}
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
                Tambah Aset POSM Kompetitor
              </button>
            </div>
          )}

          {error && (
            <div className="text-[13px] text-taco-error mt-3">{error}</div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 phone-shell mx-auto bg-white border-t border-taco-divider px-5 pt-3.5 pb-8 z-30">
          <button
            type="button"
            onClick={handleNext}
            disabled={saving}
            className="w-full h-14 rounded-xl bg-taco-accent text-white text-[16px] font-semibold disabled:opacity-50 active:bg-taco-accent-dark"
          >
            {saving ? "Menyimpan…" : step < 3 ? "Lanjut →" : "Simpan"}
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
