"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart2,
  Settings,
  LogOut,
  Home,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/analytics", label: "Analitik", icon: BarChart2 },
  { href: "/admin", label: "Admin", icon: Settings },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { clearAuth, user } = useAuthStore();

  const handleLogout = () => {
    clearAuth();
    router.push("/auth/login");
  };

  return (
    <div className="min-h-screen bg-taco-page flex">
      {/* Sidebar */}
      <aside className="w-[220px] bg-white border-r border-taco-border flex flex-col flex-shrink-0 sticky top-0 h-screen">
        <div className="px-5 py-4 border-b border-taco-divider">
          <img
            src="https://manage.taco.co.id/asset-images/logo.svg"
            alt="TACO"
            className="h-7"
          />
        </div>

        <nav className="flex-1 py-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-5 h-11 text-[14px] font-medium transition-colors border-l-[3px]",
                  active
                    ? "border-l-taco-accent bg-taco-accent-tint text-taco-text font-semibold"
                    : "border-l-transparent text-taco-sub hover:text-taco-text hover:bg-taco-page"
                )}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
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

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
