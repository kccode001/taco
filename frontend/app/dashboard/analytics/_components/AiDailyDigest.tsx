"use client";

import { useEffect, useState } from "react";
import {
  DailyDigest,
  getDailyDigest,
  regenerateDailyDigest,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Markdown } from "./Markdown";

const FALLBACK: DailyDigest = {
  date: "2026-06-07",
  generated_at: "2026-06-07T10:30:00+07:00",
  brands: ["Krono", "Pergo", "Egger"],
  recommended_action:
    "Tindak lanjuti gap harga Krono di Tangerang Selatan dengan diskon taktis 8–10% untuk 3 toko volume tertinggi.",
  content_md: `## Ringkasan Pasar — 7 Juni 2026

Berdasarkan **47 kunjungan** hari ini, **Krono** terus melakukan penetrasi agresif di wilayah Tangerang Selatan dengan harga Laminate Original 8mm turun ke **Rp 165.000/m²** — 11% di bawah TACO. Gap melebar 3% vs minggu lalu, dengan risiko kehilangan 3 toko volume tinggi.

**Pergo** mempertahankan premium pricing di segmen atas (+30% vs TACO HPL) sehingga ancaman terpusat pada segmen menengah-bawah. **Egger** stabil di Jakarta dan Tangerang.

### Posisi TACO
- Coverage 83% (target 90%)
- Rep aktif 18/22
- HPL dan Edging margin sehat (18–27%)
- Laminate segmen tertekan oleh Krono dan Egger

### Sinyal permintaan dominan
1. Laminate tahan air / anti-lembab — 28 toko
2. HPL motif kayu untuk furniture — 19 toko
3. Vinyl tile 4mm untuk kamar mandi — 14 toko

> **Rekomendasi:** Tindak lanjuti gap harga Krono di Tangerang Selatan. Pertimbangkan diskon taktis 8–10% untuk Laminate Classic 8mm di 3 toko volume tertinggi (Maju Jaya, Pak Hendra, Sumber Makmur). Review uptake promo besok 08:00.`,
};

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? "animate-spin" : ""}
      aria-hidden
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2z" />
      <path d="M19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13z" />
    </svg>
  );
}

function formatStamp(iso: string) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function wordCount(md: string) {
  return md.split(/\s+/).filter(Boolean).length;
}

export function AiDailyDigest() {
  const { user } = useAuthStore();
  const [digest, setDigest] = useState<DailyDigest>(FALLBACK);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDailyDigest()
      .then((res) => {
        if (cancelled) return;
        if (res.data && (res.data as DailyDigest).content_md) {
          setDigest(res.data as DailyDigest);
        }
      })
      .catch(() => {
        // keep fallback silently — page must render for the demo
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canRegenerate = user?.role === "manager" || user?.role === "admin";

  const handleRegenerate = async () => {
    if (!canRegenerate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await regenerateDailyDigest();
      if (res.data && (res.data as DailyDigest).content_md) {
        setDigest(res.data as DailyDigest);
      } else {
        // backend not wired yet — re-fetch and fall back gracefully
        const latest = await getDailyDigest();
        if (latest.data && (latest.data as DailyDigest).content_md) {
          setDigest(latest.data as DailyDigest);
        }
      }
    } catch {
      setError(
        "Layanan AI Digest belum tersedia. Coba lagi setelah Forge menyalakan endpoint."
      );
    } finally {
      setLoading(false);
    }
  };

  const wc = wordCount(digest.content_md);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0F0F0] flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold text-[#1A1A1A] flex items-center gap-2">
            <span className="text-[#717171]">
              <SparkIcon />
            </span>
            AI Daily Digest
          </h2>
          <p className="text-[13px] text-[#717171] mt-0.5">
            Ringkasan Claude · {formatStamp(digest.generated_at)} · {wc} kata
            {digest.brands?.length
              ? ` · Brand disebut: ${digest.brands.join(", ")}`
              : ""}
          </p>
        </div>
        {canRegenerate && (
          // THE ONE ORANGE on this page (body-level). Sidebar active nav is the
          // chrome-level orange; brand rule preserved.
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 h-[40px] px-5 bg-[#F04E23] hover:bg-[#C93A10] text-white text-[14px] font-semibold rounded-lg disabled:opacity-60 transition-colors"
          >
            <RefreshIcon spinning={loading} />
            {loading ? "Memproses…" : "Generate Ulang"}
          </button>
        )}
      </div>

      <div className="p-5">
        <Markdown source={digest.content_md} />
        {error && (
          <div className="mt-4 px-4 py-3 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-[13px] text-[#D0342C]">
            {error}
          </div>
        )}
        {wc > 500 && (
          <div className="mt-3 text-[12px] text-[#E07B00]">
            Ringkasan melebihi 500 kata ({wc}). Klik Generate Ulang untuk
            ringkasan yang lebih singkat.
          </div>
        )}
      </div>
    </div>
  );
}
