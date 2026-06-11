"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  BarChart2Icon,
  FileTextIcon,
  LightbulbIcon,
  MapIcon,
  StoreIcon,
  UsersIcon,
  PackageIcon,
} from "@/app/admin/_components/icons";

type IconCmp = React.ComponentType<{ size?: number; className?: string }>;

type NavItem = {
  href: string;
  label: string;
  icon: IconCmp;
  /** When true, item is only active on EXACT pathname match (used for list
   *  pages whose URL is a prefix of sibling detail routes). */
  exact?: boolean;
};

type NavSection = { label?: string; items: NavItem[] };

/** v2 management nav — mirrors the v1 TaroDashboardLayout sidebar pattern
 *  (logo / grouped sections / left-accent active state / user + logout) but
 *  points at the v2 routes so the surface self-navigates as a real dashboard
 *  instead of borrowing the v1 sidebar's links. */
const V2_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/taro/v2/dashboard", label: "Dashboard", icon: BarChart2Icon },
    ],
  },
  {
    label: "Operasional",
    items: [
      { href: "/taro/v2/invoices", label: "Antrian Invoice", icon: FileTextIcon, exact: true },
      { href: "/taro/v2/recommendations", label: "Rekomendasi", icon: LightbulbIcon },
    ],
  },
  {
    label: "Master Data",
    items: [
      { href: "/taro/v2/areas", label: "Area", icon: MapIcon },
      { href: "/taro/v2/stores", label: "Toko", icon: StoreIcon },
      { href: "/taro/v2/sales", label: "Sales", icon: UsersIcon },
      { href: "/taro/v2/taco-skus", label: "Product Knowledge", icon: PackageIcon },
    ],
  },
];

const SIBLING_PATHS = V2_SECTIONS.flatMap((s) => s.items.map((i) => i.href));

export function V2DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { clearAuth, user } = useAuthStore();

  // Wait for Zustand persist to rehydrate before role-gating (same as v1).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (useAuthStore.persist?.hasHydrated?.()) {
      setHydrated(true);
      return;
    }
    const unsub = useAuthStore.persist?.onFinishHydration?.(() =>
      setHydrated(true)
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  // Role-gate: only admin + manager may view the management surface.
  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role !== "admin" && user.role !== "manager") {
      router.replace("/dashboard");
    }
  }, [hydrated, user, router, pathname]);

  const handleLogout = () => {
    clearAuth();
    router.push("/auth/login");
  };

  const renderItem = (item: NavItem) => {
    const { href, label, icon: Icon, exact } = item;
    let active = pathname === href;
    if (!active && pathname.startsWith(href + "/")) {
      if (exact) {
        // Light up on detail pages (`/taro/v2/invoices/abc`) but not when the
        // next segment is itself a registered sibling route.
        const nextSeg = pathname.slice(href.length + 1).split("/")[0];
        if (!SIBLING_PATHS.includes(`${href}/${nextSeg}`)) active = true;
      } else {
        active = true;
      }
    }
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
        <div className="px-5 py-4 border-b border-taco-divider flex items-center justify-between gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://manage.taco.co.id/asset-images/logo.svg"
            alt="TACO"
            className="h-7"
          />
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-taco-accent-tint text-taco-accent text-[10px] font-semibold uppercase tracking-wider">
            v2
          </span>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {V2_SECTIONS.map((group, gi) => (
            <div key={group.label ?? `__group-${gi}`} className="mb-2">
              {group.label && (
                <div className="px-5 pt-4 pb-2 text-[10px] font-semibold text-taco-muted uppercase tracking-[0.1em]">
                  {group.label}
                </div>
              )}
              {group.items.map(renderItem)}
            </div>
          ))}
        </nav>

        <div className="border-t border-taco-divider p-4 space-y-3">
          <Link
            href="/taro/dashboard"
            className="block text-[12px] text-taco-muted hover:text-taco-text transition-colors"
          >
            ← Kembali ke dashboard v1
          </Link>
          <div>
            <div className="text-[13px] text-taco-sub mb-1 truncate">
              {user?.name}
            </div>
            <button
              onClick={handleLogout}
              className="text-[13px] text-taco-muted hover:text-taco-error transition-colors"
            >
              Keluar
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
