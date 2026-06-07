"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { getDashboardKpis, getLiveFeed, getVisit } from "@/lib/api";
import { KpiTile } from "@/components/KpiTile";
import { DashboardLayout } from "@/components/DashboardLayout";
import { KpiData, Visit } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [feed, setFeed] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [visitDetail, setVisitDetail] = useState<Visit | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [kpisRes, feedRes] = await Promise.all([
        getDashboardKpis(),
        getLiveFeed({ limit: "20" }),
      ]);
      setKpis(kpisRes.data);
      setFeed(feedRes.data?.data ?? feedRes.data ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || (user.role !== "manager" && user.role !== "admin")) {
      router.replace("/auth/login");
      return;
    }
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [user, router, fetchData]);

  const openVisit = async (visit: Visit) => {
    setSelectedVisit(visit);
    try {
      const res = await getVisit(visit.id);
      setVisitDetail(res.data);
    } catch {
      setVisitDetail(visit);
    }
  };

  const SECTION_LABELS: Record<string, string> = {
    s1_generic: "Informasi Umum",
    s2_notable: "Hal Penting",
    s3_burning: "Burning Questions",
    s4_pricing: "Harga TACO",
    s5_volume: "Volume TACO",
    s6_stock: "Stok & Kondisi",
    s7_posm: "POSM Audit",
    s8_competitor: "Kompetitor Hub",
    s9_demand: "Sinyal Pasar",
    s10_sentiment: "Sentimen Pemilik",
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[24px] font-bold text-taco-text">Dashboard</h1>
            <p className="text-[14px] text-taco-sub mt-0.5">Intelijen penjualan lapangan real-time</p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 h-[40px] px-4 border border-taco-border rounded-lg text-[14px] text-taco-sub hover:text-taco-text bg-white"
          >
            <RefreshCw size={15} />
            Perbarui
          </button>
        </div>

        {/* KPI Tiles */}
        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-taco-border rounded-xl p-5 h-[110px] animate-pulse" />
            ))}
          </div>
        ) : kpis ? (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiTile
              label="Kunjungan Hari Ini"
              value={kpis.visits_today}
              sub={kpis.visits_today_delta ? `↑ ${kpis.visits_today_delta}% vs kemarin` : undefined}
              subColor="success"
            />
            <KpiTile
              label="Coverage Minggu Ini"
              value={`${kpis.coverage_percent}%`}
              sub={`dari ${kpis.stores_visited_today} toko`}
              subColor="muted"
            />
            <KpiTile
              label="Rep Aktif"
              value={kpis.active_reps}
              sub={`dari ${kpis.total_reps} total`}
              subColor="muted"
            />
            <KpiTile
              label="Invoice Diproses"
              value={kpis.invoices_processed}
              sub={kpis.invoices_failed ? `↓ ${kpis.invoices_failed} gagal` : "Semua berhasil"}
              subColor={kpis.invoices_failed ? "error" : "success"}
            />
          </div>
        ) : (
          <MockKpiTiles />
        )}

        {/* Live Feed */}
        <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-taco-divider">
            <h2 className="text-[16px] font-semibold text-taco-text">Feed Kunjungan</h2>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-taco-success animate-pulse" />
              <span className="text-[12px] text-taco-sub">Live · diperbarui tiap 30 detik</span>
            </div>
          </div>

          {feed.length === 0 ? (
            <div className="text-center py-12 text-taco-sub text-[14px]">
              Belum ada kunjungan hari ini
            </div>
          ) : (
            <div className="divide-y divide-taco-divider">
              {feed.map((visit) => (
                <button
                  key={visit.id}
                  onClick={() => openVisit(visit)}
                  className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-taco-page transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-taco-page border border-taco-border flex items-center justify-center text-[13px] font-semibold text-taco-text flex-shrink-0">
                    {visit.rep_name?.[0]?.toUpperCase() ?? "R"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-medium text-taco-text">{visit.store_name}</span>
                      {(visit.changed_sections?.length ?? 0) > 0 && (
                        <span className="text-[12px] bg-amber-50 text-taco-warning px-2 py-0.5 rounded font-medium">
                          {visit.changed_sections?.length} perubahan
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-taco-sub mt-0.5">
                      {visit.rep_name} · {visit.submitted_at ? new Date(visit.submitted_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </div>
                  </div>
                  <div className="text-[12px] text-taco-muted flex-shrink-0">Lihat →</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Visit Detail Modal */}
      {selectedVisit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end">
          <div className="bg-white w-full max-w-[520px] h-full overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-taco-divider sticky top-0 bg-white z-10">
              <div>
                <div className="text-[18px] font-semibold text-taco-text">{selectedVisit.store_name}</div>
                <div className="text-[13px] text-taco-sub">{selectedVisit.rep_name} · {selectedVisit.submitted_at ? new Date(selectedVisit.submitted_at).toLocaleDateString("id-ID") : ""}</div>
              </div>
              <button
                onClick={() => { setSelectedVisit(null); setVisitDetail(null); }}
                className="p-2 text-taco-muted hover:text-taco-text"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-3">
              {(visitDetail?.sections ?? []).map((section) => {
                const isChanged = visitDetail?.changed_sections?.includes(section.section_key);
                return (
                  <div
                    key={section.section_key}
                    className={cn(
                      "rounded-xl border p-4",
                      isChanged ? "border-amber-200 bg-amber-50" : "border-taco-border bg-white"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[14px] font-semibold text-taco-text">
                        {SECTION_LABELS[section.section_key] ?? section.section_key}
                      </span>
                      {isChanged && (
                        <span className="text-[11px] bg-amber-100 text-taco-warning px-1.5 py-0.5 rounded font-medium">
                          Diperbarui
                        </span>
                      )}
                    </div>
                    <pre className="text-[13px] text-taco-sub whitespace-pre-wrap font-sans">
                      {JSON.stringify(section.data, null, 2)}
                    </pre>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function MockKpiTiles() {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <KpiTile label="Kunjungan Hari Ini" value={47} sub="↑ 12% vs kemarin" subColor="success" />
      <KpiTile label="Coverage Minggu Ini" value="83%" sub="dari 240 toko" subColor="muted" />
      <KpiTile label="Rep Aktif" value={18} sub="dari 22 total" subColor="muted" />
      <KpiTile label="Invoice Diproses" value={126} sub="↓ 4 gagal" subColor="error" />
    </div>
  );
}
