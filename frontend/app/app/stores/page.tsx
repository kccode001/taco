"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, LogOut, ChevronRight, MapPin } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { getStores, getTerritories } from "@/lib/api";
import { Store } from "@/lib/types";
import { HealthDot } from "@/components/HealthBadge";

export default function StoresPage() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [stores, setStores] = useState<Store[]>([]);
  const [territories, setTerritories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [territory, setTerritory] = useState("");

  const fetchStores = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (territory) params.territory_id = territory;
      const res = await getStores(params);
      setStores(res.data?.data ?? res.data ?? []);
    } catch {
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, [search, territory]);

  useEffect(() => {
    if (!user || user.role !== "rep") {
      router.replace("/auth/login");
      return;
    }
    getTerritories().then((r) => setTerritories(r.data ?? [])).catch(() => {});
    fetchStores();
  }, [user, router, fetchStores]);

  useEffect(() => {
    const t = setTimeout(fetchStores, 300);
    return () => clearTimeout(t);
  }, [search, territory, fetchStores]);

  const handleLogout = () => {
    clearAuth();
    router.push("/auth/login");
  };

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen">
        {/* Header */}
        <div className="bg-white border-b border-taco-divider sticky top-0 z-10">
          <div className="flex items-center justify-between px-5 py-4">
            <img
              src="https://manage.taco.co.id/asset-images/logo.svg"
              alt="TACO"
              className="h-6"
            />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-taco-page border border-taco-border flex items-center justify-center text-[13px] font-semibold text-taco-text">
                {user?.name?.[0]?.toUpperCase() ?? "R"}
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-taco-muted hover:text-taco-text"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div className="px-5 pb-4 space-y-3">
            <h1 className="text-[20px] font-semibold text-taco-text">
              Daftar Toko
            </h1>

            {/* Search */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-taco-muted"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama toko…"
                className="w-full h-[44px] pl-10 pr-4 border border-taco-border rounded-lg text-[15px] text-taco-text bg-white placeholder:text-taco-muted outline-none focus:border-taco-accent"
              />
            </div>

            {/* Territory filter */}
            {territories.length > 0 && (
              <select
                value={territory}
                onChange={(e) => setTerritory(e.target.value)}
                className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[15px] text-taco-text bg-white outline-none"
              >
                <option value="">Semua Wilayah</option>
                {territories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Store list */}
        <div className="flex-1 px-4 py-4 space-y-2.5">
          {loading ? (
            <div className="text-center py-12 text-taco-muted text-[15px]">
              Memuat daftar toko…
            </div>
          ) : stores.length === 0 ? (
            <div className="text-center py-12">
              <MapPin size={32} className="text-taco-muted mx-auto mb-3" />
              <p className="text-[15px] text-taco-sub">Tidak ada toko ditemukan</p>
            </div>
          ) : (
            stores.map((store) => (
              <button
                key={store.id}
                onClick={() =>
                  router.push(`/app/stores/${store.id}/visit/new`)
                }
                className="w-full flex items-center gap-3 bg-white border border-taco-border rounded-xl px-4 py-3.5 min-h-[72px] text-left hover:border-taco-accent transition-colors"
              >
                <HealthDot health={store.health ?? "belum_dikunjungi"} />
                <div className="flex-1 min-w-0">
                  <div className="text-[17px] font-medium text-taco-text truncate">
                    {store.name}
                  </div>
                  <div className="text-[14px] text-taco-sub mt-0.5">
                    {store.last_visit_days_ago !== undefined
                      ? `${store.last_visit_days_ago} hari lalu · ${store.territory_name ?? ""}`
                      : `Belum dikunjungi · ${store.territory_name ?? ""}`}
                  </div>
                </div>
                <ChevronRight size={18} className="text-taco-muted flex-shrink-0" />
              </button>
            ))
          )}
        </div>

        {/* Bottom padding */}
        <div className="h-8" />
      </div>
    </div>
  );
}
