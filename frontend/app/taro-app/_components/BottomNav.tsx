"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  BellIcon,
  ClockIcon,
  HomeIcon,
  PlusIcon,
  UserIcon,
} from "./icons";

interface Item {
  key: string;
  label: string;
  href: string;
  icon: (active: boolean) => React.ReactNode;
}

/** Items rendered as plain nav buttons. The center FAB is rendered separately
 *  so it can sit raised above the bar baseline. */
const ITEMS_LEFT: Item[] = [
  {
    key: "home",
    label: "Beranda",
    href: "/taro-app/home",
    icon: () => <HomeIcon size={22} />,
  },
  {
    key: "history",
    label: "Riwayat",
    href: "/taro-app/history",
    icon: () => <ClockIcon size={22} />,
  },
];

const ITEMS_RIGHT: Item[] = [
  {
    key: "notifications",
    label: "Notifikasi",
    href: "/taro-app/notifications",
    icon: () => <BellIcon size={22} />,
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
  if (key === "history") return pathname.startsWith("/taro-app/history");
  if (key === "notifications")
    return pathname.startsWith("/taro-app/notifications");
  if (key === "profile") return pathname.startsWith("/taro-app/profile");
  return false;
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: Item;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px]",
        active ? "text-taco-accent" : "text-taco-muted",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
    >
      <span aria-hidden>{item.icon(active)}</span>
      <span
        className={[
          "text-[11px] leading-none",
          active ? "font-semibold" : "font-medium",
        ].join(" ")}
      >
        {item.label}
      </span>
    </button>
  );
}

export function BottomNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const uploadActive = pathname.startsWith("/taro-app/upload");
  return (
    <nav
      className="bg-white border-t border-taco-divider flex items-stretch pt-2.5 pb-4 fixed bottom-0 left-0 right-0 z-30 phone-shell mx-auto"
      style={{ minHeight: 56 }}
    >
      {ITEMS_LEFT.map((it) => (
        <NavButton
          key={it.key}
          item={it}
          active={isActive(it.key, pathname)}
          onClick={() => router.push(it.href)}
        />
      ))}

      {/* Center FAB — raised circular upload button */}
      <div className="flex-1 flex items-start justify-center relative">
        <button
          type="button"
          onClick={() => router.push("/taro-app/upload")}
          aria-label="Upload Invoice"
          aria-current={uploadActive ? "page" : undefined}
          className={[
            "absolute -top-6 w-[60px] h-[60px] rounded-full bg-taco-accent text-white",
            "flex items-center justify-center shadow-lg active:bg-taco-accent-dark",
            "transition-colors",
          ].join(" ")}
          style={{
            boxShadow: "0 6px 16px rgba(240, 78, 35, 0.35)",
          }}
        >
          <PlusIcon size={28} />
        </button>
      </div>

      {ITEMS_RIGHT.map((it) => (
        <NavButton
          key={it.key}
          item={it}
          active={isActive(it.key, pathname)}
          onClick={() => router.push(it.href)}
        />
      ))}
    </nav>
  );
}
