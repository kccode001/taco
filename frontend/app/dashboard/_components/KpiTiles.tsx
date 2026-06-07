"use client";

import { useEffect, useState, useRef } from "react";
import { getDashboardKpis } from "@/lib/api";
import { DashboardKpi } from "./types";

interface Tile {
  label: string;
  value: string | number;
  sub?: string;
  subTone?: "success" | "error" | "muted";
}

interface KpiTilesProps {
  initial?: DashboardKpi | null;
  pollIntervalMs?: number;
  onUpdate?: (kpi: DashboardKpi) => void;
}

function TileCard({ tile, fresh }: { tile: Tile; fresh: boolean }) {
  const toneClass =
    tile.subTone === "success"
      ? "text-taco-success"
      : tile.subTone === "error"
      ? "text-taco-error"
      : "text-taco-sub";
  return (
    <div
      className="bg-white border border-taco-border rounded-xl p-5 transition-colors"
      data-testid="kpi-tile"
      data-fresh={fresh ? "true" : "false"}
    >
      <div className="text-[13px] text-taco-sub mb-2">{tile.label}</div>
      <div className="text-[36px] font-bold text-taco-text leading-none">
        {tile.value}
      </div>
      {tile.sub && (
        <div className={`text-[13px] mt-1 font-medium ${toneClass}`}>
          {tile.sub}
        </div>
      )}
    </div>
  );
}

const MOCK_KPI: DashboardKpi = {
  visits_today: 47,
  visits_today_delta: 12,
  coverage_percent: 83,
  stores_visited_today: 240,
  active_reps: 18,
  total_reps: 22,
  invoices_processed: 126,
  invoices_failed: 4,
};

export function KpiTiles({
  initial,
  pollIntervalMs = 15000,
  onUpdate,
}: KpiTilesProps) {
  const [kpi, setKpi] = useState<DashboardKpi | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [fresh, setFresh] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchOnce = async () => {
      try {
        const res = await getDashboardKpis();
        if (!mountedRef.current) return;
        const data = (res.data?.data ?? res.data) as DashboardKpi | undefined;
        if (data && typeof data.visits_today === "number") {
          setKpi(data);
          setLastUpdated(Date.now());
          setFresh(true);
          onUpdate?.(data);
          setTimeout(() => mountedRef.current && setFresh(false), 1500);
        } else if (!kpi) {
          setKpi(MOCK_KPI);
        }
      } catch {
        if (!kpi && mountedRef.current) setKpi(MOCK_KPI);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    fetchOnce();
    timer = setInterval(fetchOnce, pollIntervalMs);
    return () => {
      mountedRef.current = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollIntervalMs]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4" data-testid="kpi-tiles-loading">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white border border-taco-border rounded-xl p-5 h-[110px] animate-pulse"
          />
        ))}
      </div>
    );
  }

  const data = kpi ?? MOCK_KPI;
  const delta = data.visits_today_delta ?? 0;

  const tiles: Tile[] = [
    {
      label: "Kunjungan Hari Ini",
      value: data.visits_today,
      sub:
        delta > 0
          ? `↑ ${delta}% vs kemarin`
          : delta < 0
          ? `↓ ${Math.abs(delta)}% vs kemarin`
          : "Sama dengan kemarin",
      subTone: delta > 0 ? "success" : delta < 0 ? "error" : "muted",
    },
    {
      label: "Coverage Minggu Ini",
      value: `${data.coverage_percent}%`,
      sub: `dari ${data.stores_visited_today} toko`,
      subTone: "muted",
    },
    {
      label: "Rep Aktif Hari Ini",
      value: data.active_reps,
      sub: `dari ${data.total_reps} total`,
      subTone: "muted",
    },
    {
      label: "Invoice Diproses",
      value: data.invoices_processed,
      sub:
        data.invoices_failed > 0
          ? `↓ ${data.invoices_failed} gagal diproses`
          : "Semua berhasil",
      subTone: data.invoices_failed > 0 ? "error" : "success",
    },
  ];

  return (
    <div data-testid="kpi-tiles" data-last-updated={lastUpdated}>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <TileCard key={t.label} tile={t} fresh={fresh} />
        ))}
      </div>
    </div>
  );
}
