"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, LogOut } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  FileTextIcon,
  LightbulbIcon,
  MapIcon,
  StoreIcon,
  UsersIcon,
  PackageIcon,
  BarChart2Icon,
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

/** v2 management nav — byte-faithful clone of TaroDashboardLayout.
 *  Same sections, icons, spacing, branding as v1. v2-only items (Area, Toko)
 *  added at the bottom of "Master & Pengaturan" identically styled. */
const V2_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/taro/v2/dashboard", label: "Dashboard", icon: Home as IconCmp },
      { href: "/taro/v2/analytics", label: "Analytics", icon: BarChart2Icon as IconCmp },
    ],
  },
  {
    label: "Operasional",
    items: [
      { href: "/taro/v2/invoices", label: "Antrian Invoice", icon: FileTextIcon, exact: true },
    ],
  },
  {
    label: "Master & Pengaturan",
    items: [
      { href: "/taro/v2/taco-skus", label: "TACO SKU", icon: PackageIcon },
      { href: "/taro/v2/recommendations", label: "Rekomendasi", icon: LightbulbIcon },
      { href: "/taro/v2/sales", label: "Sales Agent", icon: UsersIcon },
      { href: "/taro/v2/areas", label: "Area", icon: MapIcon },
      { href: "/taro/v2/stores", label: "Toko", icon: StoreIcon },
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
        <div className="px-5 py-4 border-b border-taco-divider">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://manage.taco.co.id/asset-images/logo.svg"
            alt="TACO"
            className="h-7"
          />
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
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
