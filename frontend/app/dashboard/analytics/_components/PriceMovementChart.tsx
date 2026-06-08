"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getPriceMovement } from "@/lib/api";

interface PriceRow {
  date: string;
  taco?: number;
  krono?: number;
  pergo?: number;
  egger?: number;
}

const MOCK: PriceRow[] = [
  { date: "01/06", taco: 185000, krono: 175000, pergo: 245000, egger: 198000 },
  { date: "08/06", taco: 185000, krono: 172000, pergo: 246000, egger: 198000 },
  { date: "15/06", taco: 186000, krono: 168000, pergo: 247000, egger: 197000 },
  { date: "22/06", taco: 186000, krono: 165000, pergo: 248000, egger: 198000 },
  { date: "29/06", taco: 186000, krono: 165000, pergo: 248000, egger: 198000 },
];

export function PriceMovementChart() {
  const [rows, setRows] = useState<PriceRow[]>(MOCK);

  useEffect(() => {
    let cancelled = false;
    getPriceMovement({ range: "30d" })
      .then((res) => {
        if (cancelled) return;
        const body = res.data as unknown as PriceRow[] | { data?: PriceRow[] };
        const list = Array.isArray(body) ? body : body?.data ?? [];
        if (list.length) setRows(list);
        else setRows(MOCK);
      })
      .catch(() => {
        if (!cancelled) setRows(MOCK);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl p-5">
      <h2 className="text-[15px] font-semibold text-[#1A1A1A] mb-0.5">
        Pergerakan Harga
      </h2>
      <p className="text-[13px] text-[#717171] mb-4">
        Harga Jual ke Tukang per kategori utama · 30 hari
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#717171" }} />
          <YAxis
            tick={{ fontSize: 12, fill: "#717171" }}
            tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(v) =>
              typeof v === "number"
                ? new Intl.NumberFormat("id-ID").format(v)
                : v
            }
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          {/* TACO = green, all competitors = shades of red/grey (no orange) */}
          <Line
            type="monotone"
            dataKey="taco"
            name="TACO"
            stroke="#1D9E75"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="krono"
            name="Krono"
            stroke="#D0342C"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="egger"
            name="Egger"
            stroke="#A33024"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="pergo"
            name="Pergo"
            stroke="#717171"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
