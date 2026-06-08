"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";

export default function TaroAppEntry() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  useEffect(() => {
    if (!hasHydrated) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    router.replace("/taro-app/home");
  }, [hasHydrated, user, router]);
  return (
    <div className="min-h-screen bg-taco-page flex items-center justify-center">
      <img
        src="https://manage.taco.co.id/asset-images/logo.svg"
        alt="TACO"
        className="h-8 opacity-40"
      />
    </div>
  );
}
