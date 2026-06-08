"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart2,
  LogOut,
  Home,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  UsersIcon,
  StoreIcon,
  PackageIcon,
  TagIcon,
  ClipboardIcon,
  PinIcon,
  FlagIcon,
  FileTextIcon,
  MapIcon,
} from "@/app/admin/_components/icons";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type NavSection = { label?: string; items: NavItem[] };

const TOP_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/analytics", label: "Analitik", icon: BarChart2 },
];

const ADMIN_SECTIONS: NavSection[] = [
  {
    label: "Organisasi & Jaringan",
    items: [
      { href: "/admin/sales-staff", label: "Sales Staff", icon: UsersIcon },
      { href: "/admin/stores", label: "Toko", icon: StoreIcon },
      { href: "/admin/wilayah", label: "Wilayah", icon: MapIcon },
    ],
  },
  {
    label: "Katalog Produk",
    items: [
      { href: "/admin/taco-skus", label: "TACO SKU", icon: PackageIcon },
      { href: "/admin/competitor-skus", label: "SKU Kompetitor", icon: TagIcon },
      { href: "/admin/competitor-brands", label: "Brand Kompetitor", icon: TagIcon },
    ],
  },
  {
    label: "Konfigurasi Kunjungan",
    items: [
      { href: "/admin/burning-questions", label: "Pertanyaan Prioritas", icon: ClipboardIcon },
      { href: "/admin/posm", label: "POSM / Aset", icon: PinIcon },
      { href: "/admin/visit-objectives", label: "Tujuan Kunjungan", icon: FlagIcon },
      { href: "/admin/visit-contexts", label: "Konteks Kunjungan", icon: FileTextIcon },
    ],
  },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { clearAuth, user } = useAuthStore();

  // Wait for Zustand persist to rehydrate before role-gating.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (useAuthStore.persist?.hasHydrated?.()) {
      setHydrated(true);
      return;
    }
    const unsub = useAuthStore.persist?.onFinishHydration?.(() => setHydrated(true));
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

  // Role-gate: manager + admin everywhere; rep blocked off /admin/*.
  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    const isAdminRoute = pathname.startsWith("/admin");
    if (isAdminRoute && user.role !== "admin" && user.role !== "manager") {
      router.replace("/dashboard");
    }
  }, [hydrated, user, router, pathname]);

  const handleLogout = () => {
    clearAuth();
    router.push("/auth/login");
  };

  const renderItem = (item: NavItem) => {
    const { href, label, icon: Icon } = item;
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/")) || pathname === href;
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex items-center gap-2.5 px-5 h-10 text-[13px] transition-colors border-l-[3px]",
          active
            ? "border-l-taco-accent bg-taco-accent-tint text-taco-text font-semibold"
            : "border-l-transparent text-taco-sub hover:text-taco-text hover:bg-taco-page font-medium"
        )}
      >
        <Icon size={15} />
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-taco-page flex">
      <aside className="w-[240px] bg-white border-r border-taco-border flex flex-col flex-shrink-0 sticky top-0 h-screen">
        <div className="px-5 py-4 border-b border-taco-divider">
          <img
            src="https://manage.taco.co.id/asset-images/logo.svg"
            alt="TACO"
            className="h-7"
          />
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          <div className="mb-2">
            {TOP_ITEMS.map(renderItem)}
          </div>

          {ADMIN_SECTIONS.map((group) => (
            <div key={group.label} className="mb-2">
              {group.label && (
                <div className="px-5 pt-4 pb-2 text-[10px] font-semibold text-taco-muted uppercase tracking-[0.1em]">
                  {group.label}
                </div>
              )}
              {group.items.map(renderItem)}
            </div>
          ))}
        </nav>

        <div className="border-t border-taco-divider p-4">
          <div className="text-[13px] text-taco-sub mb-1 truncate">{user?.name}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-[13px] text-taco-muted hover:text-taco-error transition-colors"
          >
            <LogOut size={14} />
            Keluar
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
