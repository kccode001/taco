"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { DashboardLayout } from "@/components/DashboardLayout";

import { AiDailyDigest } from "./_components/AiDailyDigest";
import { CompetitorHubTable } from "./_components/CompetitorHubTable";
import { IndeksHargaTaco } from "./_components/IndeksHargaTaco";
import { IndonesiaHeatmap } from "./_components/IndonesiaHeatmap";
import { PriceMovementChart } from "./_components/PriceMovementChart";
import { KesehatanStokKategori } from "./_components/KesehatanStokKategori";
import { KepatuhanPosm } from "./_components/KepatuhanPosm";
import { DemandSignals } from "./_components/DemandSignals";
import { BurningQThemes } from "./_components/BurningQThemes";
import { ExecutionScorecard } from "./_components/ExecutionScorecard";
import { PeluangProyekTable } from "./_components/PeluangProyekTable";

export default function AnalyticsPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;
    if (user.role !== "manager" && user.role !== "admin") {
      router.replace("/auth/login");
    }
  }, [user, router]);

  const today = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5">
        {/* Page header — calm, no orange */}
        <div>
          <h1 className="text-[22px] font-bold text-[#1A1A1A]">
            Analitik &amp; AI Digest
          </h1>
          <p className="text-[14px] text-[#717171] mt-1">
            {today} · Sebaran nasional, harga, kompetitor, dan ringkasan AI
            harian
          </p>
        </div>

        {/* 1. AI Daily Digest first — Generate Ulang = the page's body orange */}
        <AiDailyDigest />

        {/* 2. Indonesia heatmap — AC-18 (regional patterns) */}
        <IndonesiaHeatmap />

        {/* 3. Competitor Hub — AC-17 (30-day intel filtered by region) */}
        <CompetitorHubTable />

        {/* 4. Indeks Harga TACO — AUDIT-009 §05 new panel */}
        <IndeksHargaTaco />

        {/* 5. Pergerakan Harga — green TACO vs red competitor */}
        <PriceMovementChart />

        {/* 6. Kesehatan Stok per Kategori — 8 product_lines (Plywood dropped) */}
        <KesehatanStokKategori />

        {/* 7. Kepatuhan POSM TACO */}
        <KepatuhanPosm />

        {/* 8. Sinyal Toko (Permintaan) — was "S9", renamed */}
        <DemandSignals />

        {/* 9. Tema Jawaban Pertanyaan Wajib */}
        <BurningQThemes />

        {/* 10. Execution Scorecard + inline Kualitas Data mini-panel */}
        <ExecutionScorecard />

        {/* 11. Peluang Proyek — 5 tipes (Perumahan/Apartemen/Komersial/Renovasi/Lainnya) */}
        <PeluangProyekTable />
      </div>
    </DashboardLayout>
  );
}
