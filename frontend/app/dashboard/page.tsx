"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { DashboardLayout } from "@/components/DashboardLayout";
import { KpiTiles } from "./_components/KpiTiles";
import { LiveVisitFeed } from "./_components/LiveVisitFeed";
import { VisitDetailDrawer } from "./_components/VisitDetailDrawer";
import { VisitFeedRow } from "./_components/types";

const POLL_INTERVAL_MS = 15000; // AC-15 — ≤30s

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [selected, setSelected] = useState<VisitFeedRow | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "manager" && user.role !== "admin") {
      router.replace("/auth/login");
    }
  }, [user, router]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Page header — no orange, calm */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[24px] font-bold text-taco-text">Dashboard</h1>
            <p className="text-[13px] text-taco-sub mt-0.5 inline-flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full bg-taco-success animate-pulse"
                aria-hidden
              />
              Live · diperbarui tiap 15 detik
            </p>
          </div>
        </div>

        {/* 4 KPI tiles — polls every 15s (AC-15: ≤30s) */}
        <KpiTiles pollIntervalMs={POLL_INTERVAL_MS} />

        {/* Live visit feed */}
        <LiveVisitFeed
          pollIntervalMs={POLL_INTERVAL_MS}
          onSelectVisit={setSelected}
        />
      </div>

      {selected && (
        <VisitDetailDrawer seed={selected} onClose={() => setSelected(null)} />
      )}
    </DashboardLayout>
  );
}
