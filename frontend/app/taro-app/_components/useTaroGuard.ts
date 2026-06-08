"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/api";

/** Bounces non-taro_agent traffic to /auth/login. Returns once hydration + role
 *  check completes; component should render a skeleton while {ready} is false.
 *
 *  Also enriches the in-store user once per session with the full /users/me
 *  payload so taro_agent gets `region_id` + `region_display` (login response
 *  only carries id/name/email/role — BE keeps the region join on /users/me). */
export function useTaroGuard(): { ready: boolean } {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const enrichedRef = useRef(false);

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

  // One-shot enrichment: fetch /users/me when the persisted user is missing the
  // region fields. We skip when region_id is already present so we don't
  // hammer BE on every page-mount. Demo-mode tokens start with "demo-" and
  // have no real BE session — skip them too.
  useEffect(() => {
    if (!hasHydrated || !user || !token) return;
    if (user.role !== "taro_agent") return;
    if (user.region_id) return; // already enriched
    if (enrichedRef.current) return;
    if (token.startsWith("demo-")) return;
    enrichedRef.current = true;

    getCurrentUser()
      .then((res) => {
        const me = res.data as {
          id: string;
          name: string;
          email?: string;
          phone?: string;
          role: string;
          taro_region_id?: string | null;
          taro_region?: {
            id: string;
            name: string;
            code: string;
            display_path: string;
          } | null;
        };
        const enriched = {
          ...user,
          id: me.id,
          name: me.name,
          email: me.email ?? user.email,
          phone: me.phone ?? user.phone,
          role: user.role,
          region_id: me.taro_region_id ?? undefined,
          region_code: me.taro_region?.code,
          region_display: me.taro_region?.display_path,
        };
        setAuth(enriched, token);
      })
      .catch(() => {
        // Silent — keeps the prior in-store user. UI will still render with
        // "Belum ditetapkan" badges, which is the existing fallback.
        enrichedRef.current = false;
      });
  }, [hasHydrated, user, token, setAuth]);

  return { ready: hasHydrated && !!user };
}
