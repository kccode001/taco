"use client";

import { useEffect, useState } from "react";
import { getBurningQThemes, BurningQTheme } from "@/lib/api";

const MOCK: BurningQTheme[] = [
  {
    q_id: "Q1",
    q_text:
      "Produk TACO yang paling sering ditanya customer bulan ini?",
    q_kind: "ranked",
    items: [
      { label: "Laminate tahan air / anti-lembab", count: 28 },
      { label: "HPL motif kayu untuk furniture", count: 19 },
      { label: "Vinyl tile 4mm — kamar mandi", count: 14 },
    ],
  },
  {
    q_id: "Q2",
    q_text: "Apakah toko ini menjual produk kompetitor di kategori vinyl minggu ini?",
    q_kind: "yes_no",
    items: [
      { label: "Ya (kompetitor aktif)", count: 31, pct: 66 },
      { label: "Tidak", count: 14, pct: 30 },
      { label: "Tidak tahu", count: 2, pct: 4 },
    ],
  },
  {
    q_id: "Q3",
    q_text: "Estimasi total pembelian TACO toko ini bulan lalu?",
    q_kind: "buckets",
    items: [
      { label: "< Rp 10jt", count: 8 },
      { label: "Rp 10–25jt", count: 16 },
      { label: "Rp 25–50jt", count: 15 },
      { label: "> Rp 50jt", count: 5 },
      { label: "Tidak tahu", count: 3 },
    ],
  },
];

function QHeader({ text }: { text: string }) {
  return (
    <div className="text-[12px] font-bold text-[#B91C1C] mb-2 px-3 py-1.5 bg-[#FFF5F5] border border-[#FECACA] border-l-[3px] border-l-[#D32F2F] rounded-lg">
      {text}
    </div>
  );
}

function RankedList({ items }: { items: BurningQTheme["items"] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <div className="text-[13px] font-semibold text-[#ADADAD] w-6">
            #{idx + 1}
          </div>
          <div className="flex-1 text-[14px] text-[#1A1A1A]">{it.label}</div>
          <div
            className="h-2 rounded bg-[#1D9E75]/70"
            style={{ width: `${(it.count / max) * 160}px`, minWidth: 16 }}
          />
          <div className="text-[13px] text-[#717171] w-[88px] text-right">
            {it.count} toko
          </div>
        </div>
      ))}
    </div>
  );
}

function YesNoGrid({ items }: { items: BurningQTheme["items"] }) {
  return (
    <div className="flex gap-4 flex-wrap">
      {items.map((it, idx) => {
        const tone =
          idx === 0 ? "text-[#D0342C]" : idx === 1 ? "text-[#1D9E75]" : "text-[#ADADAD]";
        return (
          <div
            key={idx}
            className="flex-1 min-w-[140px] p-3 bg-[#F7F7F7] rounded-lg"
          >
            <div className="text-[12px] text-[#ADADAD] mb-1">{it.label}</div>
            <div className={`text-[22px] font-bold ${tone}`}>
              {it.count} toko
            </div>
            {typeof it.pct === "number" && (
              <div className="text-[12px] text-[#ADADAD] mt-0.5">
                {it.pct}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BucketGrid({ items }: { items: BurningQTheme["items"] }) {
  return (
    <div className="flex gap-2.5 flex-wrap">
      {items.map((it, idx) => {
        const tone =
          /tidak tahu/i.test(it.label)
            ? "text-[#ADADAD]"
            : idx >= 2 && idx < items.length - 1
            ? "text-[#1D9E75]"
            : "text-[#1A1A1A]";
        return (
          <div
            key={idx}
            className="p-3 bg-[#F7F7F7] rounded-lg flex-1 min-w-[120px]"
          >
            <div className="text-[11px] text-[#ADADAD]">{it.label}</div>
            <div className={`text-[18px] font-bold ${tone}`}>{it.count} toko</div>
          </div>
        );
      })}
    </div>
  );
}

export function BurningQThemes() {
  const [themes, setThemes] = useState<BurningQTheme[]>(MOCK);

  useEffect(() => {
    let cancelled = false;
    getBurningQThemes()
      .then((res) => {
        if (cancelled) return;
        const body = res.data as unknown as
          | { data?: BurningQTheme[] }
          | BurningQTheme[];
        const list = Array.isArray(body) ? body : body?.data ?? [];
        if (list.length) setThemes(list);
        else setThemes(MOCK);
      })
      .catch(() => {
        if (!cancelled) setThemes(MOCK);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F0F0F0]">
        <h2 className="text-[15px] font-semibold text-[#1A1A1A]">
          Tema Jawaban Pertanyaan Wajib
        </h2>
        <p className="text-[13px] text-[#717171] mt-0.5">
          Top tema dari 3 pertanyaan wajib · semua kunjungan hari ini
        </p>
      </div>
      <div className="p-5 space-y-6">
        {themes.map((t) => (
          <div key={t.q_id}>
            <QHeader text={`${t.q_id} — ${t.q_text}`} />
            {t.q_kind === "ranked" && <RankedList items={t.items} />}
            {t.q_kind === "yes_no" && <YesNoGrid items={t.items} />}
            {t.q_kind === "buckets" && <BucketGrid items={t.items} />}
          </div>
        ))}
      </div>
    </div>
  );
}
