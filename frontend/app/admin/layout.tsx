"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/DashboardLayout";
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();

  // AC-1: role-gate /admin (admin only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
    } else if (!user) {
      router.replace("/auth/login");
    }
  }, [user, router]);

  return (
    <DashboardLayout>
      <div className="flex h-full bg-taco-page">
        {/* Inner admin sidebar — TACO SVG logo + grouped nav.
            Active item gets a DARK left border (not orange), per design rule:
            orange is reserved for the "+ Tambah" CTA on each section page. */}
        <aside className="w-[232px] bg-white border-r border-taco-border flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
          <div className="px-5 py-4 border-b border-taco-divider flex items-center">
            <TacoLogo className="h-7 w-auto" />
            <span className="ml-3 text-[11px] font-semibold text-taco-muted uppercase tracking-wider">
              Admin
            </span>
          </div>

          <nav className="py-2">
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
        </aside>

        <div className="flex-1 min-w-0 overflow-auto p-6">{children}</div>
      </div>
    </DashboardLayout>
  );
}
