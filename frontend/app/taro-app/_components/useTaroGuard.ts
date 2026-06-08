"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";

/** Bounces non-taro_agent traffic to /auth/login. Returns once hydration + role
 *  check completes; component should render a skeleton while {ready} is false. */
export function useTaroGuard(): { ready: boolean } {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  useEffect(() => {
    if (!hasHydrated) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role !== "taro_agent") {
      // Allow admin/manager to peek the PWA without auto-redirect — they're
      // logged-in members of the same workspace. Skip redirect entirely.
      if (user.role === "admin" || user.role === "manager" || user.role === "rep") {
        return;
      }
      router.replace("/auth/login");
    }
  }, [hasHydrated, user, router]);
  return { ready: hasHydrated && !!user };
}
