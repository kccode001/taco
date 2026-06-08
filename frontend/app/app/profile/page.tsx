"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import {
  getCurrentUser,
  getStores,
  getTerritories,
  getVisits,
} from "@/lib/api";
import { MobileBottomNav } from "@/components/mobile";

interface RepProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  territory_name?: string;
  territory_id?: string;
}

interface ProfileStats {
  visits_month: number;
  stores_assigned: number;
  active_days: number;
}

function initials(name?: string): string {
  if (!name) return "R";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleLabel(role?: string): string {
  switch (role) {
    case "rep":
      return "Sales Rep";
    case "manager":
      return "Manajer Wilayah";
    case "admin":
      return "Admin TACO";
    default:
      return "Pengguna";
  }
}

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [profile, setProfile] = useState<RepProfile | null>(null);
  const [stats, setStats] = useState<ProfileStats>({
    visits_month: 0,
    stores_assigned: 0,
    active_days: 0,
  });
  const [loading, setLoading] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [meRes, storesRes, visitsRes, terrRes] = await Promise.allSettled([
      getCurrentUser(),
      getStores(),
      getVisits({ limit: "100" }),
      getTerritories(),
    ]);

    // Resolve territory_id → name from the territories list
    let terrIndex: Record<string, string> = {};
    if (terrRes.status === "fulfilled") {
      const arr = (terrRes.value.data as { id: string; name: string }[]) ?? [];
      terrIndex = Object.fromEntries(arr.map((t) => [t.id, t.name]));
    }

    // Profile
    if (meRes.status === "fulfilled") {
      const me = meRes.value.data as {
        id: string;
        name: string;
        email: string;
        role: string;
        phone?: string;
        territory_id?: string;
        territory?: { name?: string };
      };
      setProfile({
        id: me.id,
        name: me.name,
        email: me.email,
        role: me.role,
        phone: me.phone,
        territory_id: me.territory_id,
        territory_name:
          me.territory?.name ??
          (me.territory_id ? terrIndex[me.territory_id] : undefined),
      });
    } else if (user) {
      setProfile({
        id: user.id,
        name: user.name,
        email: (user as { email?: string }).email ?? "",
        role: user.role,
        territory_id: user.territory_id,
        territory_name:
          user.territory_name ??
          (user.territory_id ? terrIndex[user.territory_id] : undefined),
      });
    }

    // Stats
    let storesAssigned = 0;
    if (storesRes.status === "fulfilled") {
      const d = storesRes.value.data as {
        data?: unknown[];
        total?: number;
      };
      storesAssigned = d.total ?? d.data?.length ?? 0;
    }

    let visitsMonth = 0;
    let activeDays = 0;
    if (visitsRes.status === "fulfilled") {
      const d = visitsRes.value.data as {
        data?: { visit_date?: string; submitted_at?: string }[];
      };
      const list = d.data ?? [];
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const days = new Set<string>();
      for (const v of list) {
        const ref = v.submitted_at ?? v.visit_date;
        if (!ref) continue;
        const dt = new Date(ref);
        if (dt.getFullYear() === y && dt.getMonth() === m) {
          visitsMonth += 1;
          days.add(dt.toISOString().slice(0, 10));
        }
      }
      activeDays = days.size;
    }
    setStats({
      visits_month: visitsMonth,
      stores_assigned: storesAssigned,
      active_days: activeDays,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    load();
  }, [hasHydrated, user, router, load]);

  const handleLogout = () => {
    clearAuth();
    router.push("/auth/login");
  };

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[92px]">
        {/* Header */}
        <div className="bg-white border-b border-taco-divider">
          <div className="px-5 pt-4 pb-3">
            <div className="text-[20px] font-semibold text-taco-text">Profil</div>
          </div>
        </div>

        {/* Avatar + identity card */}
        <div className="px-4 pt-4">
          <div className="bg-white border border-taco-border rounded-2xl p-5">
            <div className="flex items-center gap-4">
              <div className="w-[72px] h-[72px] rounded-full bg-taco-page border border-taco-border flex items-center justify-center text-[26px] font-semibold text-taco-text">
                {initials(profile?.name ?? user?.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[18px] font-semibold text-taco-text truncate">
                  {profile?.name ?? user?.name ?? "Pengguna"}
                </div>
                <div className="mt-1">
                  <span className="inline-flex items-center text-[12px] font-medium px-2 py-0.5 rounded-full bg-taco-page text-taco-sub border border-taco-border">
                    {roleLabel(profile?.role ?? user?.role)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-taco-divider flex flex-col gap-2.5">
              <Row label="Email" value={profile?.email ?? "—"} />
              <Row label="Telepon" value={profile?.phone ?? "—"} />
              <Row
                label="Wilayah"
                value={profile?.territory_name ?? "Belum ditetapkan"}
              />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 pt-4">
          <div className="grid grid-cols-3 gap-2">
            <StatTile
              label="Kunjungan bulan ini"
              value={loading ? "…" : String(stats.visits_month)}
            />
            <StatTile
              label="Toko ditugaskan"
              value={loading ? "…" : String(stats.stores_assigned)}
            />
            <StatTile
              label="Hari aktif"
              value={loading ? "…" : String(stats.active_days)}
            />
          </div>
        </div>

        {/* Settings list */}
        <div className="px-4 pt-4">
          <div className="bg-white border border-taco-border rounded-2xl overflow-hidden">
            <SettingsRow
              label="Ubah Password"
              hint="Atur ulang password akun"
              onClick={() => router.push("/app/profile/password")}
            />
            <Divider />
            <SettingsToggleRow
              label="Notifikasi"
              hint="Pengingat rencana harian"
              checked={notifEnabled}
              onChange={setNotifEnabled}
            />
            <Divider />
            <SettingsRow
              label="Bahasa"
              hint="Indonesia"
              chevron={false}
              disabled
            />
            <Divider />
            <SettingsRow
              label="Bantuan / FAQ"
              hint="Panduan & pertanyaan umum"
              onClick={() => router.push("/app/profile/help")}
            />
          </div>
        </div>

        {/* Version */}
        <div className="px-4 pt-3">
          <div className="text-center text-[12px] text-taco-muted">
            TACO AI · v0.1.0
          </div>
        </div>

        {/* Logout */}
        <div className="px-4 pt-5">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-[52px] rounded-xl text-[15px] font-semibold text-taco-error bg-white border border-taco-border active:bg-red-50"
          >
            Keluar
          </button>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="text-[14px] text-taco-sub flex-shrink-0">{label}</div>
      <div className="text-[14px] text-taco-text text-right break-all">
        {value}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-taco-border rounded-xl p-3 min-h-[88px] flex flex-col items-center justify-center text-center">
      <div className="text-[22px] font-semibold text-taco-text leading-none">
        {value}
      </div>
      <div className="text-[12px] text-taco-sub mt-1.5 leading-tight">
        {label}
      </div>
    </div>
  );
}

function SettingsRow({
  label,
  hint,
  onClick,
  chevron = true,
  disabled = false,
}: {
  label: string;
  hint?: string;
  onClick?: () => void;
  chevron?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="w-full px-4 min-h-[56px] py-3 flex items-center justify-between gap-3 text-left active:bg-taco-page disabled:opacity-100"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-taco-text">{label}</div>
        {hint && (
          <div className="text-[13px] text-taco-sub mt-0.5 truncate">
            {hint}
          </div>
        )}
      </div>
      {chevron && !disabled && (
        <span className="text-taco-muted text-[20px] leading-none font-light">
          ›
        </span>
      )}
    </button>
  );
}

function SettingsToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="w-full px-4 min-h-[56px] py-3 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-taco-text">{label}</div>
        {hint && (
          <div className="text-[13px] text-taco-sub mt-0.5 truncate">
            {hint}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "w-[44px] h-[26px] rounded-full relative transition-colors flex-shrink-0",
          checked ? "bg-taco-text" : "bg-taco-border",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-[3px] w-5 h-5 rounded-full bg-white transition-all",
            checked ? "left-[21px]" : "left-[3px]",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-taco-divider mx-4" />;
}
