"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Riwayat now lives as a tab inside /app/visits — keep this route alive
// for the bottom nav and any deep links pointing at /app/history.
export default function HistoryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/visits?tab=riwayat");
  }, [router]);
  return (
    <div className="min-h-screen bg-taco-page flex items-center justify-center">
      <div className="w-11 h-11 rounded-full border-2 border-taco-border border-t-taco-text taco-spin" />
    </div>
  );
}
