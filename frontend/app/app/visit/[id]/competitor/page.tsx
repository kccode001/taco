"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  CompetitorBrandPicker,
  CompetitorListCard,
  type CompetitorBrand,
  type CompetitorListItem,
} from "@/components/mobile";
import { useAuthStore } from "@/lib/store";
import {
  createVisitCompetitor,
  getVisit,
  getVisitCompetitors,
  type VisitCompetitor,
} from "@/lib/api";

type SectionData = {
  brands?: {
    brand: string;
    skus?: unknown[];
    promos?: unknown[];
    posms?: unknown[];
    complete?: boolean;
    id?: string;
  }[];
};

function brandSlug(b: string) {
  return b.toLowerCase().replace(/\s+/g, "-");
}

function normalize(c: VisitCompetitor): CompetitorListItem {
  return {
    id: c.id,
    brand: c.brand,
    sku_count: Array.isArray(c.skus) ? c.skus.length : 0,
    promo_count: Array.isArray(c.promos) ? c.promos.length : 0,
    posm_count: Array.isArray(c.posms) ? c.posms.length : 0,
    complete: c.complete,
  };
}

export default function CompetitorListPage() {
  const router = useRouter();
  const params = useParams();
  const visitId = params?.id as string;
  const { user } = useAuthStore();

  const [items, setItems] = useState<CompetitorListItem[]>([]);
  const [picker, setPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getVisitCompetitors(visitId);
      const list =
        (res.data as { data?: VisitCompetitor[] })?.data ??
        (res.data as VisitCompetitor[]);
      if (Array.isArray(list)) {
        setItems(list.map(normalize));
      } else {
        // Fall back to visit section blob
        const vRes = await getVisit(visitId);
        const v =
          (vRes.data as { data?: { sections?: { section_key: string; data?: SectionData }[] } })
            ?.data ??
          (vRes.data as { sections?: { section_key: string; data?: SectionData }[] });
        const section = v?.sections?.find(
          (s) => s.section_key === "kompetitor" || s.section_key === "s6_kompetitor"
        );
        const arr = (section?.data?.brands ?? []) as SectionData["brands"];
        setItems(
          (arr ?? []).map((b) => ({
            id: b.id || brandSlug(b.brand),
            brand: b.brand,
            sku_count: b.skus?.length ?? 0,
            promo_count: b.promos?.length ?? 0,
            posm_count: b.posms?.length ?? 0,
            complete: b.complete,
          }))
        );
      }
    } catch {
      setItems([]);
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

  const onPick = async (b: CompetitorBrand) => {
    setPicker(false);
    const exists = items.find((x) => x.brand === b);
    if (exists) {
      router.push(`/app/visit/${visitId}/competitor/${brandSlug(b)}`);
      return;
    }
    try {
      await createVisitCompetitor(visitId, { brand: b });
    } catch {
      // BE may not be ready — still navigate, brand page can persist via section
    }
    router.push(`/app/visit/${visitId}/competitor/${brandSlug(b)}`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      router.push(`/app/visit/${visitId}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[160px]">
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
          </div>
          <div className="text-[17px] font-semibold text-taco-text mt-1">
            Kompetitor
          </div>
          <div className="text-[13px] text-taco-sub mt-0.5">
            Tambah data untuk setiap brand yang terlihat di toko ini
          </div>
        </div>

        <CompetitorBrandPicker
          open={picker}
          takenBrands={items.map((i) => i.brand)}
          onPick={onPick}
          onCancel={() => setPicker(false)}
        />

        <div className="flex-1 px-3.5 pt-3.5">
          {loading ? (
            <div className="py-10 flex justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-taco-border border-t-taco-text taco-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-14 h-14 bg-taco-page rounded-2xl flex items-center justify-center mx-auto mb-4 text-taco-muted">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="text-[16px] font-semibold text-taco-text mb-1.5">
                Belum ada kompetitor ditambahkan
              </div>
              <div className="text-[14px] text-taco-muted leading-relaxed">
                Tap tombol di bawah untuk mulai
                <br />
                mencatat data kompetitor
              </div>
            </div>
          ) : (
            <div>
              {items.map((it) => (
                <CompetitorListCard
                  key={it.id}
                  item={it}
                  onOpen={() =>
                    router.push(
                      `/app/visit/${visitId}/competitor/${brandSlug(it.brand)}`
                    )
                  }
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setPicker((v) => !v)}
            className="w-full h-[52px] mt-1 rounded-[10px] border-2 border-dashed border-taco-border text-[14px] text-taco-sub font-medium flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Tambah Kompetitor
          </button>

        </div>

        <div className="fixed bottom-0 left-0 right-0 phone-shell mx-auto bg-white border-t border-taco-divider px-5 pt-3.5 pb-8 z-30">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full h-14 rounded-xl bg-taco-accent text-white text-[16px] font-semibold disabled:opacity-50 active:bg-taco-accent-dark"
          >
            {saving ? "Menyimpan…" : "Simpan Kompetitor"}
          </button>
        </div>
      </div>
    </div>
  );
}
