"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { getTaroInvoices, type TaroInvoiceSummary } from "@/lib/api";
import { TopBar } from "../_components/TopBar";
import { BottomNav } from "../_components/BottomNav";
import { useTaroGuard } from "../_components/useTaroGuard";

function initials(name?: string): string {
  if (!name) return "T";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Stats {
  total: number;
  thisMonth: number;
  avgConfidence: number;
}

export default function TaroProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { ready } = useTaroGuard();
  const [stats, setStats] = useState<Stats>({
    total: 0,
    thisMonth: 0,
    avgConfidence: 0,
  });
  const [loading, setLoading] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let rows: TaroInvoiceSummary[] = [];
    try {
      const res = await getTaroInvoices({ limit: "200" });
      const data =
        ((res.data as { data?: TaroInvoiceSummary[] })?.data ??
          (res.data as TaroInvoiceSummary[])) ?? [];
      rows = data;
    } catch {
      rows = [];
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const month = rows.filter((r) => {
      const d = new Date(r.uploaded_at);
      return d.getFullYear() === y && d.getMonth() === m;
    });
    const done = rows.filter((r) => r.status === "done");
    const avg =
      done.length === 0
        ? 0
        : done.reduce((acc, d) => acc + d.avg_confidence, 0) / done.length;
    setStats({
      total: rows.length,
      thisMonth: month.length,
      avgConfidence: avg,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  const handleLogout = () => {
    clearAuth();
    router.push("/auth/login");
  };

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[96px]">
        <TopBar title="Profil" hideRegion />

        {/* Identity */}
        <div className="px-4 pt-4">
          <div className="bg-white border border-taco-border rounded-2xl p-5">
            <div className="flex items-center gap-4">
              <div className="w-[72px] h-[72px] rounded-full bg-taco-accent-tint border border-taco-accent-tint flex items-center justify-center text-[24px] font-semibold text-taco-accent">
                {initials(user?.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[18px] font-semibold text-taco-text truncate">
                  {user?.name ?? "—"}
                </div>
                <div className="mt-1">
                  <span className="inline-flex items-center text-[12px] font-medium px-2 py-0.5 rounded-full bg-taco-page text-taco-sub border border-taco-border">
                    Sales Agent Taro
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-taco-divider flex flex-col gap-2.5">
              <Row label="Email" value={user?.email ?? "—"} />
              <Row label="Telepon" value={user?.phone ?? "—"} />
              <Row
                label="Wilayah ASM"
                value={user?.region_display ?? "Belum ditetapkan"}
              />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 pt-4">
          <div className="grid grid-cols-3 gap-2">
            <StatTile
              label="Total invoice"
              value={loading ? "…" : String(stats.total)}
            />
            <StatTile
              label="Bulan ini"
              value={loading ? "…" : String(stats.thisMonth)}
            />
            <StatTile
              label="Avg confidence"
              value={
                loading
                  ? "…"
                  : `${Math.round(stats.avgConfidence * 100)}%`
              }
            />
          </div>
        </div>

        {/* Settings */}
        <div className="px-4 pt-4">
          <div className="bg-white border border-taco-border rounded-2xl overflow-hidden">
            <SettingsToggleRow
              label="Notifikasi"
              hint="Pengingat upload harian"
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
              hint="Cara upload + tips foto"
              onClick={() => {
                /* not wired — surface in tooltip */
              }}
            />
          </div>
        </div>

        {/* Version */}
        <div className="px-4 pt-3">
          <div className="text-center text-[12px] text-taco-muted">
            Taro Agent · v0.1.0
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

      <BottomNav />
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
          <div className="text-[13px] text-taco-sub mt-0.5 truncate">{hint}</div>
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
          <div className="text-[13px] text-taco-sub mt-0.5 truncate">{hint}</div>
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
