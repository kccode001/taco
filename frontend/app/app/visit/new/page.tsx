"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { createVisit, getStores } from "@/lib/api";
import { MobileBottomNav, StoreCard, type StoreHealth } from "@/components/mobile";
import type { Store } from "@/lib/types";

function mapHealth(s: Store): StoreHealth {
  if (s.health === "tidak_aktif") return "cek";
  if (s.health === "perlu_update") return "lama";
  if (s.health === "belum_dikunjungi" || s.last_visit_days_ago === undefined)
    return "baru";
  if (s.last_visit_days_ago >= 10) return "cek";
  if (s.last_visit_days_ago >= 6) return "lama";
  return "oke";
}

function VisitNewInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { user } = useAuthStore();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const storeIdParam = search?.get("store") || "";

  useEffect(() => {
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (storeIdParam) {
      if (startedRef.current) return;
      startedRef.current = true;
      createVisit(storeIdParam)
        .then((res) => {
          const v = res.data as { id: string };
          router.replace(`/app/visit/${v.id}`);
        })
        .catch(() => {
          setError(
            "Gagal memulai kunjungan baru. Pilih toko di bawah dan coba lagi."
          );
          startedRef.current = false;
          setLoading(false);
        });
      return;
    }
    getStores()
      .then((r) => {
        const list: Store[] =
          (r.data as { data?: Store[] })?.data ?? (r.data as Store[]) ?? [];
        setStores(list);
      })
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  }, [storeIdParam, user, router]);

  if (storeIdParam && !error) {
    return (
      <div className="min-h-screen bg-taco-page flex items-center justify-center">
        <div className="text-center">
          <div className="w-11 h-11 mx-auto rounded-full border-2 border-taco-border border-t-taco-text taco-spin" />
          <div className="mt-4 text-[15px] text-taco-sub">Membuka kunjungan…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[92px]">
        <div className="bg-white border-b border-taco-divider px-5 pt-4 pb-4">
          <div className="text-[20px] font-semibold text-taco-text">
            Pilih Toko
          </div>
          <div className="text-[14px] text-taco-sub mt-1">
            Ketuk toko untuk memulai kunjungan baru.
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[14px] text-red-700">
            {error}
          </div>
        )}

        <div className="flex-1 px-3 pt-3 pb-4 flex flex-col gap-2">
          {loading ? (
            <div className="text-center py-12 text-taco-muted text-[16px]">
              Memuat daftar toko…
            </div>
          ) : stores.length === 0 ? (
            <div className="text-center py-12 text-taco-sub text-[16px]">
              Tidak ada toko tersedia.
            </div>
          ) : (
            stores.map((s) => (
              <StoreCard
                key={s.id}
                name={s.name}
                health={mapHealth(s)}
                territory={s.territory_name}
                lastVisitDaysAgo={s.last_visit_days_ago}
                onClick={() => router.push(`/app/visit/new?store=${s.id}`)}
              />
            ))
          )}
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
}

function VisitNewFallback() {
  return (
    <div className="min-h-screen bg-taco-page flex items-center justify-center">
      <div className="w-11 h-11 rounded-full border-2 border-taco-border border-t-taco-text taco-spin" />
    </div>
  );
}

export default function VisitNewPage() {
  return (
    <Suspense fallback={<VisitNewFallback />}>
      <VisitNewInner />
    </Suspense>
  );
}
