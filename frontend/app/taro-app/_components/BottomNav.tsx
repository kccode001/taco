"use client";

import { usePathname, useRouter } from "next/navigation";
import { HomeIcon, UploadIcon, UserIcon } from "./icons";

interface Item {
  key: string;
  label: string;
  href: string;
  icon: (active: boolean) => React.ReactNode;
}

const ITEMS: Item[] = [
  {
    key: "home",
    label: "Beranda",
    href: "/taro-app/home",
    icon: () => <HomeIcon size={22} />,
  },
  {
    key: "upload",
    label: "Upload",
    href: "/taro-app/upload",
    icon: () => <UploadIcon size={22} />,
  },
  {
    key: "profile",
    label: "Profil",
    href: "/taro-app/profile",
    icon: () => <UserIcon size={22} />,
  },
];

function isActive(key: string, pathname: string): boolean {
  if (key === "home")
    return pathname === "/taro-app/home" || pathname === "/taro-app";
  if (key === "upload")
    return (
      pathname.startsWith("/taro-app/upload") ||
      pathname.startsWith("/taro-app/history")
    );
  if (key === "profile") return pathname.startsWith("/taro-app/profile");
  return false;
}

export function BottomNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  return (
    <nav
      className="bg-white border-t border-taco-divider flex pt-2.5 pb-4 fixed bottom-0 left-0 right-0 z-30 phone-shell mx-auto"
      style={{ minHeight: 56 }}
    >
      {ITEMS.map((it) => {
        const active = isActive(it.key, pathname);
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => router.push(it.href)}
            className={[
              "flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px]",
              active ? "text-taco-accent" : "text-taco-muted",
            ].join(" ")}
            aria-current={active ? "page" : undefined}
          >
            <span aria-hidden>{it.icon(active)}</span>
            <span
              className={[
                "text-[11px] leading-none",
                active ? "font-semibold" : "font-medium",
              ].join(" ")}
            >
              {it.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
