"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ResponsiveContainer,
} from "recharts";
import { useAuthStore } from "@/lib/store";
import {
  getCompetitorHub,
  getPriceMovement,
  getMarketDemand,
  getAiDigest,
  triggerAiDigest,
} from "@/lib/api";
import { DashboardLayout } from "@/components/DashboardLayout";

const MOCK_PRICE_MOVEMENT = [
  { date: "01/06", taco: 85000, krono: 92000, pergo: 105000 },
  { date: "02/06", taco: 85000, krono: 90000, pergo: 105000 },
  { date: "03/06", taco: 87000, krono: 88000, pergo: 104000 },
  { date: "04/06", taco: 87000, krono: 86000, pergo: 103000 },
  { date: "05/06", taco: 88000, krono: 84000, pergo: 103000 },
  { date: "06/06", taco: 88000, krono: 83000, pergo: 102000 },
  { date: "07/06", taco: 88000, krono: 82000, pergo: 102000 },
];

const MOCK_DEMAND = [
  { region: "Jakarta", score: 92 },
  { region: "Tangerang", score: 85 },
  { region: "Bekasi", score: 78 },
  { region: "Bogor", score: 65 },
  { region: "Depok", score: 54 },
];

const MOCK_COMPETITOR_DATA = [
  { brand: "Krono", sku: "Original 8mm", price: 82000, region: "Tangerang Selatan", date: "07/06", visits: 12 },
  { brand: "Pergo", sku: "Sensation Oak", price: 102000, region: "Bekasi", date: "07/06", visits: 8 },
  { brand: "Egger", sku: "Pro Laminate 8mm", price: 95000, region: "Jakarta", date: "06/06", visits: 6 },
  { brand: "Krono", sku: "Aqua Stop", price: 110000, region: "Bogor", date: "06/06", visits: 4 },
];

export default function AnalyticsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [priceData, setPriceData] = useState(MOCK_PRICE_MOVEMENT);
  const [demandData, setDemandData] = useState(MOCK_DEMAND);
  const [competitorData, setCompetitorData] = useState(MOCK_COMPETITOR_DATA);
  const [digest, setDigest] = useState<{ content: string; generated_at: string } | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [regionFilter, setRegionFilter] = useState("");
  const [dateRange, setDateRange] = useState("7");

  const fetchData = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (regionFilter) params.region = regionFilter;
      if (dateRange) params.days = dateRange;

      const [priceRes, demandRes, competitorRes, digestRes] = await Promise.allSettled([
        getPriceMovement(params),
        getMarketDemand(),
        getCompetitorHub(params),
        getAiDigest(),
      ]);

      if (priceRes.status === "fulfilled" && priceRes.value.data?.length) {
        setPriceData(priceRes.value.data);
      }
      if (demandRes.status === "fulfilled" && demandRes.value.data?.length) {
        setDemandData(demandRes.value.data);
      }
      if (competitorRes.status === "fulfilled" && competitorRes.value.data?.length) {
        setCompetitorData(competitorRes.value.data);
      }
      if (digestRes.status === "fulfilled") {
        setDigest(digestRes.value.data);
      }
    } catch {
      // use mock data
    }
  }, [regionFilter, dateRange]);

  useEffect(() => {
    if (!user || (user.role !== "manager" && user.role !== "admin")) {
      router.replace("/auth/login");
      return;
    }
    fetchData();
  }, [user, router, fetchData]);

  const handleRefreshDigest = async () => {
    setDigestLoading(true);
    try {
      await triggerAiDigest();
      const res = await getAiDigest();
      setDigest(res.data);
    } catch {
      // silent
    } finally {
      setDigestLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-[24px] font-bold text-taco-text">Analitik</h1>
          <p className="text-[14px] text-taco-sub mt-0.5">Kompetitor · Pasar · AI Digest</p>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="h-[40px] px-3 border border-taco-border rounded-lg text-[14px] text-taco-text bg-white outline-none"
          >
            <option value="">Semua Wilayah</option>
            <option value="jakarta">Jakarta</option>
            <option value="tangerang">Tangerang</option>
            <option value="bekasi">Bekasi</option>
            <option value="bogor">Bogor</option>
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="h-[40px] px-3 border border-taco-border rounded-lg text-[14px] text-taco-text bg-white outline-none"
          >
            <option value="7">7 hari terakhir</option>
            <option value="14">14 hari terakhir</option>
            <option value="30">30 hari terakhir</option>
          </select>
        </div>

        {/* Competitor Hub Table */}
        <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-taco-divider">
            <h2 className="text-[16px] font-semibold text-taco-text">Kompetitor Hub</h2>
            <p className="text-[13px] text-taco-sub mt-0.5">Harga kompetitor dari capture invoice lapangan</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-taco-divider">
                  <th className="text-left px-5 py-3 text-[12px] font-semibold text-taco-sub uppercase tracking-wide">Brand</th>
                  <th className="text-left px-4 py-3 text-[12px] font-semibold text-taco-sub uppercase tracking-wide">SKU</th>
                  <th className="text-right px-4 py-3 text-[12px] font-semibold text-taco-sub uppercase tracking-wide">Harga</th>
                  <th className="text-left px-4 py-3 text-[12px] font-semibold text-taco-sub uppercase tracking-wide">Wilayah</th>
                  <th className="text-left px-4 py-3 text-[12px] font-semibold text-taco-sub uppercase tracking-wide">Tanggal</th>
                  <th className="text-right px-5 py-3 text-[12px] font-semibold text-taco-sub uppercase tracking-wide">Kunjungan</th>
                </tr>
              </thead>
              <tbody>
                {competitorData.map((row, i) => (
                  <tr key={i} className="border-b border-taco-divider last:border-0 hover:bg-taco-page">
                    <td className="px-5 py-3.5 font-medium text-taco-text">{row.brand}</td>
                    <td className="px-4 py-3.5 text-taco-text">{row.sku}</td>
                    <td className="px-4 py-3.5 text-right font-medium text-taco-text">
                      {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(row.price)}
                    </td>
                    <td className="px-4 py-3.5 text-taco-sub">{row.region}</td>
                    <td className="px-4 py-3.5 text-taco-sub">{row.date}</td>
                    <td className="px-5 py-3.5 text-right text-taco-sub">{row.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Price Movement Chart */}
        <div className="bg-white border border-taco-border rounded-xl p-5">
          <h2 className="text-[16px] font-semibold text-taco-text mb-1">Pergerakan Harga</h2>
          <p className="text-[13px] text-taco-sub mb-4">Tren harga SKU per wilayah (30 hari)</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={priceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#717171" }} />
              <YAxis tick={{ fontSize: 12, fill: "#717171" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => typeof v === "number" ? new Intl.NumberFormat("id-ID").format(v) : v} />
              <Legend />
              <Line type="monotone" dataKey="taco" name="TACO" stroke="#1D9E75" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="krono" name="Krono" stroke="#D0342C" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pergo" name="Pergo" stroke="#717171" strokeWidth={2} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Market Demand */}
        <div className="bg-white border border-taco-border rounded-xl p-5">
          <h2 className="text-[16px] font-semibold text-taco-text mb-1">Sinyal Permintaan Pasar</h2>
          <p className="text-[13px] text-taco-sub mb-4">Ringkasan per wilayah dari S9 kunjungan</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={demandData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#717171" }} domain={[0, 100]} />
              <YAxis type="category" dataKey="region" tick={{ fontSize: 13, fill: "#1A1A1A" }} width={80} />
              <Tooltip />
              <Bar dataKey="score" name="Skor Permintaan" fill="#1D9E75" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* AI Daily Digest */}
        <div className="bg-white border border-taco-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[16px] font-semibold text-taco-text flex items-center gap-2">
                <Sparkles size={18} className="text-taco-sub" />
                AI Market Digest
              </h2>
              {digest?.generated_at && (
                <p className="text-[12px] text-taco-muted mt-0.5">
                  Dibuat: {new Date(digest.generated_at).toLocaleString("id-ID")}
                </p>
              )}
            </div>
            {user?.role === "admin" && (
              <button
                onClick={handleRefreshDigest}
                disabled={digestLoading}
                className="flex items-center gap-2 h-[36px] px-3 border border-taco-border rounded-lg text-[13px] text-taco-sub hover:text-taco-text bg-white disabled:opacity-50"
              >
                <RefreshCw size={13} className={digestLoading ? "animate-spin" : ""} />
                Refresh
              </button>
            )}
          </div>
          {digest ? (
            <div className="text-[15px] text-taco-text leading-relaxed whitespace-pre-wrap">
              {digest.content}
            </div>
          ) : (
            <div className="bg-taco-page rounded-xl p-5 text-[14px] text-taco-sub leading-relaxed">
              <p className="font-semibold text-taco-text mb-2">Ringkasan Pasar — 7 Juni 2026</p>
              <p>
                Berdasarkan 47 kunjungan hari ini, Krono terus melakukan penetrasi agresif di wilayah Tangerang Selatan dengan harga laminat 8mm turun ke Rp82.000 — 7% di bawah TACO. Pergo mempertahankan premium pricing di segmen atas.
              </p>
              <p className="mt-3">
                Sinyal permintaan kuat untuk produk vinyl dan HPL, khususnya di toko-toko modern trade. 3 toko di Bekasi melaporkan stockout TACO Vinyl Classic.
              </p>
              <p className="mt-3 text-taco-warning font-medium">
                Rekomendasi: Tinjau harga laminat 8mm di wilayah Tangerang Selatan dan percepat restock vinyl ke Bekasi.
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
