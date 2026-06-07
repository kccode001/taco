"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { createVisit, getStore } from "@/lib/api";
import type { Store } from "@/lib/types";

export default function StoreDetailPage() {
  const router = useRouter();
  const params = useParams();
  const storeId = params?.id as string;
  const { user } = useAuthStore();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    getStore(storeId)
      .then((r) => {
        const data = (r.data as { data?: Store })?.data ?? (r.data as Store);
        setStore(data);
      })
      .catch(() => setError("Tidak bisa memuat data toko."))
      .finally(() => setLoading(false));
  }, [storeId, user, router]);

  async function handleStartVisit() {
    if (!store || starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await createVisit(storeId);
      const visit = res.data as { id: string };
      router.replace(`/app/visit/${visit.id}`);
    } catch {
      setError("Gagal memulai kunjungan. Coba lagi.");
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen">
        <div className="bg-white border-b border-taco-divider px-5 pt-4 pb-4">
          <button
            type="button"
            onClick={() => router.push("/app/stores")}
            className="inline-flex items-center gap-1 text-taco-sub text-[15px] min-h-[44px] -ml-1"
          >
            <ChevronLeft size={18} />
            Kembali
          </button>
        </div>

        <div className="flex-1 px-4 pt-4 pb-32">
          {loading ? (
            <div className="text-center py-12 text-taco-muted text-[16px]">
              Memuat…
            </div>
          ) : !store ? (
            <div className="text-center py-12 text-taco-sub text-[16px]">
              Toko tidak ditemukan.
            </div>
          ) : (
            <div className="bg-white border border-taco-border rounded-2xl p-5">
              <div className="text-[20px] font-bold text-taco-text leading-tight">
                {store.name}
              </div>
              {store.territory_name && (
                <div className="text-[14px] text-taco-sub mt-1.5">
                  {store.territory_name}
                </div>
              )}
              {store.address && (
                <div className="text-[14px] text-taco-sub mt-3 leading-relaxed">
                  {store.address}
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-taco-divider text-[14px] text-taco-sub">
                {store.last_visit_days_ago === undefined
                  ? "Belum pernah dikunjungi"
                  : store.last_visit_days_ago === 0
                  ? "Dikunjungi hari ini"
                  : `Terakhir dikunjungi ${store.last_visit_days_ago} hari lalu`}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[14px] text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 phone-shell mx-auto bg-white border-t border-taco-divider px-5 pt-3.5 pb-8 z-30">
          <button
            type="button"
            onClick={handleStartVisit}
            disabled={!store || starting}
            className="w-full h-14 rounded-xl bg-taco-accent text-white text-[16px] font-semibold disabled:opacity-60"
          >
            {starting ? "Membuka…" : "Mulai Kunjungan"}
          </button>
        </div>
      </div>
    </div>
  );
}
