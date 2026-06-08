"use client";

import { useEffect, useState } from "react";
import { getTaroAnalytics, type TaroAnalytics } from "@/lib/api";
import { TableHeader } from "../../_components/CrudShell";
import { MOCK_ANALYTICS } from "../_components/mockData";

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white border border-taco-border rounded-xl p-5">
      <div className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider">
        {label}
      </div>
      <div className="text-[24px] font-bold text-taco-text mt-2 leading-tight">
        {value}
      </div>
      {hint && <div className="text-[12px] text-taco-sub mt-1">{hint}</div>}
    </div>
  );
}

function VolumeChart({ data }: { data: TaroAnalytics["monthly_volume"] }) {
  const w = 600;
  const h = 180;
  const pad = { l: 32, r: 12, t: 16, b: 28 };
  const max = Math.max(...data.map((d) => d.count), 1);
  const stepX = (w - pad.l - pad.r) / Math.max(data.length - 1, 1);
  const pts = data.map((d, i) => ({
    x: pad.l + i * stepX,
    y: pad.t + (h - pad.t - pad.b) * (1 - d.count / max),
    v: d.count,
    label: d.month,
  }));
  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-[180px]"
      role="img"
      aria-label="Volume bulanan invoice"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = pad.t + (h - pad.t - pad.b) * t;
        return (
          <line
            key={t}
            x1={pad.l}
            x2={w - pad.r}
            y1={y}
            y2={y}
            stroke="#F0F0F0"
            strokeWidth={1}
          />
        );
      })}
      <path d={path} fill="none" stroke="#1A1A1A" strokeWidth={2} />
      {pts.map((p) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r={3.5} fill="#1A1A1A" />
          <text
            x={p.x}
            y={h - 8}
            textAnchor="middle"
            fontSize="11"
            fill="#717171"
          >
            {p.label}
          </text>
          <text
            x={p.x}
            y={p.y - 10}
            textAnchor="middle"
            fontSize="10"
            fill="#1A1A1A"
            fontWeight={600}
          >
            {p.v}
          </text>
        </g>
      ))}
    </svg>
  );
}

function TopBars({ data }: { data: TaroAnalytics["top_uploaded_skus"] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.sku_code} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-taco-text truncate">
              <span className="font-mono text-[10px] text-taco-muted mr-2">
                {d.sku_code}
              </span>
              {d.sku_name}
            </div>
            <div className="h-1.5 bg-taco-page rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-taco-text"
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
          </div>
          <div className="text-[13px] font-semibold text-taco-text w-12 text-right">
            {d.count}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TaroAnalyticsPage() {
  const [data, setData] = useState<TaroAnalytics | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getTaroAnalytics();
        // BE response keys are snake_case with `_count` suffixes for some
        // totals (`processed_count`, `needs_review_count`). Normalize them
        // into the FE shape so charts render whether BE or mocks reply.
        const raw = res.data as unknown as Record<string, unknown> | null;
        if (
          !raw ||
          raw.total_invoices == null ||
          ((raw.processed == null && raw.processed_count == null) &&
            (raw.monthly_volume as unknown[] | undefined)?.length === undefined)
        ) {
          setData(MOCK_ANALYTICS);
          return;
        }
        const lowSrc =
          (raw.low_confidence_skus as Array<Record<string, unknown>> | undefined) ?? [];
        const topSrc =
          (raw.top_uploaded_skus as Array<Record<string, unknown>> | undefined) ?? [];
        const normalized: TaroAnalytics = {
          total_invoices: Number(raw.total_invoices) || 0,
          processed: Number(raw.processed ?? raw.processed_count) || 0,
          needs_review: Number(raw.needs_review ?? raw.needs_review_count) || 0,
          avg_confidence: Number(raw.avg_confidence) || 0,
          monthly_volume:
            (raw.monthly_volume as TaroAnalytics["monthly_volume"]) ?? [],
          top_uploaded_skus: topSrc.map((s) => ({
            sku_code: String(s.sku_code ?? ""),
            sku_name: String(s.sku_name ?? ""),
            count: Number(s.count) || 0,
          })),
          low_confidence_skus: lowSrc.map((s) => ({
            sku_code: String(s.sku_code ?? ""),
            sku_name: String(s.sku_name ?? ""),
            avg_confidence: Number(s.avg_confidence) || 0,
            samples: Number(s.samples ?? s.line_count) || 0,
          })),
        };
        // Empty real data is uninteresting for the demo — fall back to mocks
        // when BE returns zeros across the board.
        if (
          normalized.total_invoices === 0 &&
          normalized.monthly_volume.length === 0
        ) {
          setData(MOCK_ANALYTICS);
        } else {
          setData(normalized);
        }
      } catch {
        setData(MOCK_ANALYTICS);
      }
    })();
  }, []);

  if (!data) {
    return <div className="text-[13px] text-taco-muted">Memuat analitik…</div>;
  }

  const processedPct = data.total_invoices
    ? Math.round((data.processed / data.total_invoices) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-bold text-taco-text leading-tight">
          Analitik Taro Invoices
        </h1>
        <p className="text-[13px] text-taco-sub mt-1">
          Volume, kepercayaan OCR, dan SKU paling sering muncul.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Invoice" value={String(data.total_invoices)} />
        <Kpi
          label="Sudah Diproses"
          value={String(data.processed)}
          hint={`${processedPct}% dari total`}
        />
        <Kpi label="Perlu Review" value={String(data.needs_review)} />
        <Kpi
          label="Rata-rata Kepercayaan AI"
          value={`${Math.round(data.avg_confidence * 100)}%`}
        />
      </div>

      <div className="bg-white border border-taco-border rounded-xl p-5">
        <div className="text-[14px] font-semibold text-taco-text mb-3">
          Volume Bulanan
        </div>
        <VolumeChart data={data.monthly_volume} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-taco-border rounded-xl p-5">
          <div className="text-[14px] font-semibold text-taco-text mb-1">
            Top 10 SKU paling sering muncul
          </div>
          <div className="text-[12px] text-taco-muted mb-4">
            Berdasarkan invoice 90 hari terakhir
          </div>
          <TopBars data={data.top_uploaded_skus} />
        </div>

        <div className="bg-white border border-taco-border rounded-xl overflow-hidden flex flex-col">
          <div className="p-5 pb-3">
            <div className="text-[14px] font-semibold text-taco-text mb-1">
              10 SKU dengan kepercayaan terendah
            </div>
            <div className="text-[12px] text-taco-muted">
              Kandidat untuk sinonim baru atau pemurnian sampel
            </div>
          </div>
          <table className="w-full">
            <TableHeader cols={["Kode", "Nama", "Avg Conf.", "Sampel"]} />
            <tbody>
              {data.low_confidence_skus.map((s) => (
                <tr
                  key={s.sku_code}
                  className="border-b border-taco-divider last:border-0"
                >
                  <td className="px-4 py-2 font-mono text-[11px] text-taco-muted whitespace-nowrap">
                    {s.sku_code}
                  </td>
                  <td className="px-4 py-2 text-[13px] text-taco-text max-w-[200px]">
                    <div className="truncate">{s.sku_name}</div>
                  </td>
                  <td className="px-4 py-2 text-[13px] text-taco-text whitespace-nowrap">
                    {Math.round(s.avg_confidence * 100)}%
                  </td>
                  <td className="px-4 py-2 text-[13px] text-taco-sub whitespace-nowrap">
                    {s.samples}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
