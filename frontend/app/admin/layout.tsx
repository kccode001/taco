"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { TacoLogo } from "./_components/TacoLogo";
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
} from "./_components/icons";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const SECTION_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Orang & Tempat",
    items: [
      { href: "/admin/sales-staff", label: "Sales Staff", icon: UsersIcon },
      { href: "/admin/stores", label: "Toko", icon: StoreIcon },
      { href: "/admin/wilayah", label: "Wilayah", icon: MapIcon },
    ],
  },
  {
    label: "Produk",
    items: [
      { href: "/admin/taco-skus", label: "TACO SKU", icon: PackageIcon },
      { href: "/admin/competitor-skus", label: "SKU Kompetitor", icon: TagIcon },
      {
        href: "/admin/competitor-brands",
        label: "Brand Kompetitor",
        icon: TagIcon,
      },
    ],
  },
  {
    label: "Kamus Kunjungan",
    items: [
      {
        href: "/admin/burning-questions",
        label: "Pertanyaan Prioritas",
        icon: ClipboardIcon,
      },
      { href: "/admin/posm", label: "POSM / Aset", icon: PinIcon },
      {
        href: "/admin/visit-objectives",
        label: "Tujuan Kunjungan",
        icon: FlagIcon,
      },
      {
        href: "/admin/visit-contexts",
        label: "Konteks Kunjungan",
        icon: FileTextIcon,
      },
    ],
  },
];

/** Inline logout icon. */
function LogOutIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  // Wait for Zustand persist to rehydrate from localStorage before role-gating.
  // Without this, a direct/refresh load on /admin/* runs the gate while user is
  // still null and bounces an already-authenticated admin back to /auth/login.
  // Guarded against SSR — `persist` only exists in the browser.
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

  // AC-1: role-gate /admin (admin only).
  useEffect(() => {
    if (!hydrated) return;
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
    } else if (!user) {
      router.replace("/auth/login");
    }
  }, [hydrated, user, router]);

  const handleLogout = () => {
    clearAuth();
    router.push("/auth/login");
  };

  return (
    <div className="min-h-screen bg-taco-page flex">
      {/* Single admin sidebar — TACO logo + back link + grouped nav.
          Active item gets a DARK left border (not orange), per design rule:
          orange is reserved for the "+ Tambah" CTA on each section page. */}
      <aside className="w-[240px] bg-white border-r border-taco-border flex flex-col flex-shrink-0 sticky top-0 h-screen">
        <div className="px-5 py-4 border-b border-taco-divider">
          <TacoLogo className="h-7 w-auto" />
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {SECTION_GROUPS.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="px-5 pt-3 pb-1.5 text-[11px] font-semibold text-taco-muted uppercase tracking-wider">
                {group.label}
              </div>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2.5 px-5 h-10 text-[13px] transition-colors border-l-[3px]",
                      active
                        ? "border-l-taco-text bg-taco-page text-taco-text font-semibold"
                        : "border-l-transparent text-taco-sub hover:text-taco-text hover:bg-taco-page font-medium"
                    )}
                  >
                    <Icon size={15} />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-taco-divider p-4">
          <div className="text-[13px] text-taco-sub mb-1 truncate">{user?.name}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-[13px] text-taco-muted hover:text-taco-error transition-colors"
          >
            <LogOutIcon size={14} />
            Keluar
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto p-6">{children}</main>
    </div>
  );
}
