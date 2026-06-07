"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const ITEMS: NavItem[] = [
  {
    key: "stores",
    label: "Toko",
    href: "/app/stores",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    key: "visits",
    label: "Kunjungan",
    href: "/app/visits",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <line x1="9" y1="12" x2="15" y2="12" />
        <line x1="9" y1="16" x2="13" y2="16" />
      </svg>
    ),
  },
  {
    key: "history",
    label: "Riwayat",
    href: "/app/history",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    key: "profile",
    label: "Profil",
    href: "/app/profile",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export function MobileBottomNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav
      className={cn(
        "bg-white border-t border-taco-divider flex pt-2.5 pb-4 fixed bottom-0 left-0 right-0 z-30 phone-shell mx-auto",
        className
      )}
      style={{ minHeight: 56 }}
    >
      {ITEMS.map((item) => {
        const active =
          pathname === item.href ||
          (item.key === "stores" && pathname.startsWith("/app/stores")) ||
          (item.key === "visits" && pathname.startsWith("/app/visit"));
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => router.push(item.href)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px]",
              active ? "text-taco-accent" : "text-taco-muted"
            )}
            aria-current={active ? "page" : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span
              className={cn(
                "text-[11px] leading-none",
                active ? "font-semibold" : "font-medium"
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
