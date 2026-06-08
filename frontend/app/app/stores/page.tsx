"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { getStores, getTerritories } from "@/lib/api";
import { Store } from "@/lib/types";
import {
  StoreCard,
  TerritoryFilterPills,
  MobileBottomNav,
  type StoreHealth,
} from "@/components/mobile";

function mapHealth(s: Store): StoreHealth {
  if (s.health === "tidak_aktif") return "cek";
  if (s.health === "perlu_update") return "lama";
  if (s.health === "belum_dikunjungi" || s.last_visit_days_ago === undefined)
    return "baru";
  if (s.last_visit_days_ago !== undefined && s.last_visit_days_ago >= 10)
    return "cek";
  if (s.last_visit_days_ago !== undefined && s.last_visit_days_ago >= 6)
    return "lama";
  return "oke";
}

function sortStoresByOldestVisit(stores: Store[]): Store[] {
  return [...stores].sort((a, b) => {
    const aDays =
      a.last_visit_days_ago === undefined ? Number.MAX_SAFE_INTEGER : a.last_visit_days_ago;
    const bDays =
      b.last_visit_days_ago === undefined ? Number.MAX_SAFE_INTEGER : b.last_visit_days_ago;
    return bDays - aDays;
  });
}

export default function StoresPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
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
      const list: Store[] =
        (res.data as { data?: Store[] })?.data ?? (res.data as Store[]) ?? [];
      setStores(list);
    } catch {
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, [search, territory]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || user.role !== "rep") {
      router.replace("/auth/login");
      return;
    }
    getTerritories()
      .then((r) =>
        setTerritories(
          ((r.data as { id: string; name: string }[]) ?? []).map((t) => ({
            id: t.id,
            name: t.name,
          }))
        )
      )
      .catch(() => {});
    fetchStores();
  }, [hasHydrated, user, router, fetchStores]);

  useEffect(() => {
    const t = setTimeout(fetchStores, 300);
    return () => clearTimeout(t);
  }, [search, territory, fetchStores]);

  const sortedStores = useMemo(() => sortStoresByOldestVisit(stores), [stores]);

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[92px]">
        {/* App header */}
        <div className="bg-white border-b border-taco-divider sticky top-0 z-10">
          <div className="flex items-center justify-between px-5 pt-4 pb-3.5">
            <img
              src="https://manage.taco.co.id/asset-images/logo.svg"
              alt="TACO"
              className="h-[26px]"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push("/app/visit/new")}
                className="text-[14px] font-medium text-taco-sub min-h-[44px] flex items-center"
              >
                + Tambah Kunjungan
              </button>
              <button
                type="button"
                onClick={() => router.push("/app/profile")}
                aria-label="Profil"
                className="w-9 h-9 rounded-full bg-taco-page border border-taco-border flex items-center justify-center text-[14px] font-semibold text-taco-sub"
              >
                {user?.name?.[0]?.toUpperCase() ?? "R"}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 h-12 bg-taco-page border-[1.5px] border-taco-border rounded-[10px] px-3.5">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-taco-muted flex-shrink-0"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari toko…"
                className="flex-1 bg-transparent text-[16px] text-taco-text outline-none placeholder:text-taco-muted"
                aria-label="Cari toko"
              />
            </div>
          </div>
        </div>

        {/* Territory filter pills (44px) */}
        <TerritoryFilterPills
          options={territories.map((t) => ({ id: t.id, label: t.name }))}
          value={territory}
          onChange={setTerritory}
        />

        {/* List header */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <span className="text-[16px] font-semibold text-taco-text">
            Toko Saya
          </span>
          <span className="text-[14px] text-taco-sub">
            {sortedStores.length} toko
          </span>
        </div>

        {/* Store list */}
        <div className="flex-1 px-3 pb-6 flex flex-col gap-2">
          {loading ? (
            <div className="text-center py-12 text-taco-muted text-[16px]">
              Memuat daftar toko…
            </div>
          ) : sortedStores.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[16px] text-taco-sub">
                Tidak ada toko ditemukan
              </p>
            </div>
          ) : (
            sortedStores.map((store) => (
              <StoreCard
                key={store.id}
                name={store.name}
                health={mapHealth(store)}
                territory={store.territory_name}
                lastVisitDaysAgo={store.last_visit_days_ago}
                onClick={() => router.push(`/app/stores/${store.id}`)}
              />
            ))
          )}
        </div>
      </div>

      <MobileBottomNav />
    </div>
  );
}
