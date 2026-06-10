"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Inbox,
  MapPin,
  Store as StoreLucide,
  Users,
  Lightbulb,
} from "lucide-react";

type IconCmp = React.ComponentType<{ size?: number; className?: string }>;

const V2_TABS: { href: string; label: string; icon: IconCmp; exact?: boolean }[] =
  [
    { href: "/taro/v2/dashboard", label: "Dashboard", icon: Home as IconCmp },
    { href: "/taro/v2/invoices", label: "Antrian", icon: Inbox as IconCmp },
    { href: "/taro/v2/areas", label: "Area", icon: MapPin as IconCmp },
    { href: "/taro/v2/stores", label: "Toko", icon: StoreLucide as IconCmp },
    { href: "/taro/v2/sales", label: "Sales", icon: Users as IconCmp },
    {
      href: "/taro/v2/recommendations",
      label: "Rekomendasi",
      icon: Lightbulb as IconCmp,
    },
  ];

/** Sub-navigation for the v2 management surface. Renders a horizontal tab bar
 *  that sits inside the inherited admin sidebar shell — v2 self-navigates
 *  without mutating the v1 TaroDashboardLayout. */
export function V2Tabs() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 border-b border-taco-border mb-6 overflow-x-auto">
      {V2_TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-2 px-3.5 h-11 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              active
                ? "border-taco-accent text-taco-text font-semibold"
                : "border-transparent text-taco-sub hover:text-taco-text"
            )}
          >
            <Icon size={15} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

/** Shared page header for v2 sections — title + optional description + actions. */
export function V2PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
      <div>
        <h1 className="text-[20px] font-bold text-taco-text leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-[13px] text-taco-sub mt-1 max-w-[640px]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
