"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, LogOut } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  PackageIcon,
  LightbulbIcon,
  FileTextIcon,
  UsersIcon,
} from "@/app/admin/_components/icons";

type IconCmp = React.ComponentType<{ size?: number; className?: string }>;

type NavItem = {
  href: string;
  label: string;
  icon: IconCmp;
  /** When true, item is only active on EXACT pathname match
   *  (used for list pages whose URL is a prefix of sibling routes). */
  exact?: boolean;
};

type NavSection = { label?: string; items: NavItem[] };

/** Inline icon — AlertCircle (lucide-style, our SVG convention). Used by
 *  the "OCR Gagal" nav entry. Kept local so we don't pollute the shared
 *  /admin icons set. */
function AlertCircleIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
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
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

const TARO_SECTIONS: NavSection[] = [
  {
    // No label = no group header (matches existing Overview pattern).
    items: [
      { href: "/taro/dashboard", label: "Dashboard", icon: Home as IconCmp },
    ],
  },
  {
    label: "Operasional",
    items: [
      { href: "/taro/invoices", label: "Daftar Invoice", icon: FileTextIcon, exact: true },
      { href: "/taro/failed-ocr", label: "OCR Gagal", icon: AlertCircleIcon },
    ],
  },
  {
    label: "Master & Pengaturan",
    items: [
      { href: "/taro/taco-skus", label: "TACO SKU", icon: PackageIcon },
      { href: "/taro/recommendations", label: "Rekomendasi", icon: LightbulbIcon },
      { href: "/taro/agents", label: "Sales Agent", icon: UsersIcon },
    ],
  },
];

export function TaroDashboardLayout({ children }: { children: React.ReactNode }) {
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
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  // Role-gate: same as DashboardLayout — only admin + manager can be here.
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
    if (!active) {
      if (exact) {
        // Light up on detail pages (`/taro/invoices/abc`) but NOT on sibling
        // segments registered in TARO_SECTIONS (currently none for invoices).
        if (pathname.startsWith(href + "/")) {
          const nextSeg = pathname.slice(href.length + 1).split("/")[0];
          const siblingPaths = TARO_SECTIONS.flatMap((s) =>
            s.items.map((i) => i.href)
          );
          const isSibling = siblingPaths.includes(`${href}/${nextSeg}`);
          if (!isSibling) active = true;
        }
      } else if (pathname.startsWith(href + "/")) {
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
          <img
            src="https://manage.taco.co.id/asset-images/logo.svg"
            alt="TACO"
            className="h-7"
          />
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {TARO_SECTIONS.map((group, gi) => (
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

      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
