"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  getRegionAreas,
  type RegionArea,
} from "@/lib/api";
import { Badge, TableHeader, EmptyRow } from "../../admin/_components/CrudShell";
import { SearchIcon } from "../../admin/_components/icons";
import {
  MOCK_REGION_AREAS,
  formatDateTime,
} from "../../admin/taro-invoices/_components/mockData";

/** Failure reason — controlled vocab. Maps to BE field `failure_reason`. */
type Reason = "no_match" | "low_confidence" | "ambiguous";

const REASON_LABEL: Record<Reason, string> = {
  no_match: "Tidak ada match",
  low_confidence: "Confidence rendah",
  ambiguous: "Ambigu",
};

const REASON_TONE: Record<Reason, "err" | "warn" | "info"> = {
  no_match: "err",
  low_confidence: "warn",
  ambiguous: "info",
};

/** Closest TACO SKU candidate — BE may emit this with similarity score. */
interface ClosestSkuCandidate {
  sku_id: string;
  code: string;
  name: string;
  similarity: number;
}

/** BE row shape from `GET /api/taro-invoices/failed-ocr`. Aggregated by raw_text. */
interface FailedOcrSample {
  line_item_id: string;
  invoice_id: string;
  raw_text: string;
  confidence_score: number;
  region: { id: string; code: string; name: string; display_path: string } | null;
  agent: { id: string; name: string; email?: string } | null;
  uploaded_at: string;
}

interface FailedOcrRow {
  raw_text: string;
  failure_reason: Reason;
  occurrence_count: number;
  avg_confidence: number;
  latest_uploaded_at: string;
  closest_sku_candidate?: ClosestSkuCandidate | null;
  sample_line_items: FailedOcrSample[];
}

interface AgentLite {
  id: string;
  name: string;
}

/** Mock failures — used when /api/taro-invoices/failed-ocr 404s. */
const MOCK_FAILED: FailedOcrRow[] = [
  {
    raw_text: "Engsel softclose XYZ",
    failure_reason: "no_match",
    occurrence_count: 15,
    avg_confidence: 0.43,
    latest_uploaded_at: "2026-06-08T07:14:00Z",
    closest_sku_candidate: {
      sku_id: "HW-HNG-01",
      code: "HW-HNG-01",
      name: "TACO Hardware Hinge SoftClose",
      similarity: 0.78,
    },
    sample_line_items: [
      { line_item_id: "s1", invoice_id: "ti_01HX1A", raw_text: "Engsel softclose XYZ", confidence_score: 0.43, region: { id: "area-w-jkt-s", code: "W-BU2-JKS", name: "ASM Jakarta Selatan", display_path: "W - BU2 - ASM Jakarta Selatan" }, agent: { id: "ag-1", name: "Andika Pratama" }, uploaded_at: "2026-06-08T07:14:00Z" },
      { line_item_id: "s2", invoice_id: "ti_01HX1C", raw_text: "Engsel softclose XYZ", confidence_score: 0.40, region: { id: "area-e-sby", code: "E-BU1-SBY", name: "ASM Surabaya", display_path: "E - BU1 - ASM Surabaya" }, agent: { id: "ag-3", name: "Budi Santoso" }, uploaded_at: "2026-06-07T16:20:00Z" },
    ],
  },
  {
    raw_text: "TC Edging ABS 2mm WLN",
    failure_reason: "low_confidence",
    occurrence_count: 12,
    avg_confidence: 0.68,
    latest_uploaded_at: "2026-06-08T06:42:00Z",
    closest_sku_candidate: {
      sku_id: "TE-2MM-W",
      code: "TE-2MM-W",
      name: "TACO Edging ABS 2mm Walnut",
      similarity: 0.82,
    },
    sample_line_items: [
      { line_item_id: "s3", invoice_id: "ti_01HX1B", raw_text: "TC Edging ABS 2mm WLN", confidence_score: 0.68, region: { id: "area-c-bdg", code: "C-BU1-BDG", name: "ASM Bandung", display_path: "C - BU1 - ASM Bandung" }, agent: { id: "ag-2", name: "Sri Wahyuni" }, uploaded_at: "2026-06-08T06:42:00Z" },
    ],
  },
  {
    raw_text: "Hardware engsel piano",
    failure_reason: "no_match",
    occurrence_count: 9,
    avg_confidence: 0.39,
    latest_uploaded_at: "2026-06-07T16:20:00Z",
    closest_sku_candidate: null,
    sample_line_items: [
      { line_item_id: "s4", invoice_id: "ti_01HX1C", raw_text: "Hardware engsel piano", confidence_score: 0.39, region: { id: "area-e-sby", code: "E-BU1-SBY", name: "ASM Surabaya", display_path: "E - BU1 - ASM Surabaya" }, agent: { id: "ag-3", name: "Budi Santoso" }, uploaded_at: "2026-06-07T16:20:00Z" },
    ],
  },
  {
    raw_text: "FD MDF 9mm sheet",
    failure_reason: "ambiguous",
    occurrence_count: 7,
    avg_confidence: 0.61,
    latest_uploaded_at: "2026-06-07T11:05:00Z",
    closest_sku_candidate: {
      sku_id: "FD-MDF-9MM",
      code: "FD-MDF-9MM",
      name: "FIDECO MDF 9mm 1220x2440",
      similarity: 0.74,
    },
    sample_line_items: [
      { line_item_id: "s5", invoice_id: "ti_01HX1D", raw_text: "FD MDF 9mm sheet", confidence_score: 0.61, region: { id: "area-c-smg", code: "C-BU1-SMG", name: "ASM Semarang", display_path: "C - BU1 - ASM Semarang" }, agent: { id: "ag-4", name: "Lestari Putri" }, uploaded_at: "2026-06-07T11:05:00Z" },
    ],
  },
  {
    raw_text: "Lem Putih Universal 1kg",
    failure_reason: "no_match",
    occurrence_count: 6,
    avg_confidence: 0.34,
    latest_uploaded_at: "2026-06-07T09:30:00Z",
    closest_sku_candidate: null,
    sample_line_items: [
      { line_item_id: "s6", invoice_id: "ti_01HX1E", raw_text: "Lem Putih Universal 1kg", confidence_score: 0.34, region: { id: "area-n-mdn", code: "N-BU1-MDN", name: "ASM Medan", display_path: "N - BU1 - ASM Medan" }, agent: { id: "ag-5", name: "Rizky Hidayat" }, uploaded_at: "2026-06-07T09:30:00Z" },
    ],
  },
  {
    raw_text: "Vinyl Lux Plank Oak",
    failure_reason: "low_confidence",
    occurrence_count: 5,
    avg_confidence: 0.66,
    latest_uploaded_at: "2026-06-06T15:48:00Z",
    closest_sku_candidate: {
      sku_id: "TV-LUX-405",
      code: "TV-LUX-405",
      name: "Vinyl Luxury Plank 4mm Oak",
      similarity: 0.81,
    },
    sample_line_items: [
      { line_item_id: "s7", invoice_id: "ti_01HX1F", raw_text: "Vinyl Lux Plank Oak", confidence_score: 0.66, region: { id: "area-w-jkt-b", code: "W-BU2-JKB", name: "ASM Jakarta Barat", display_path: "W - BU2 - ASM Jakarta Barat" }, agent: { id: "ag-6", name: "Maya Anggraini" }, uploaded_at: "2026-06-06T15:48:00Z" },
    ],
  },
  {
    raw_text: "Paku Beton 5cm",
    failure_reason: "no_match",
    occurrence_count: 4,
    avg_confidence: 0.31,
    latest_uploaded_at: "2026-06-06T10:11:00Z",
    closest_sku_candidate: null,
    sample_line_items: [
      { line_item_id: "s8", invoice_id: "ti_01HX1G", raw_text: "Paku Beton 5cm", confidence_score: 0.31, region: { id: "area-e-mlg", code: "E-BU1-MLG", name: "ASM Malang", display_path: "E - BU1 - ASM Malang" }, agent: { id: "ag-7", name: "Dimas Saputra" }, uploaded_at: "2026-06-06T10:11:00Z" },
    ],
  },
];

/** Categorize each row to power the 4 KPI tiles and the "Tindak Lanjut" hint. */
function categorize(row: FailedOcrRow): "likely_taco" | "likely_competitor" | "other" {
  const sim = row.closest_sku_candidate?.similarity ?? 0;
  // Strong TACO match — synonym candidate.
  if (sim >= 0.7) return "likely_taco";
  // No close match + recurring → competitor signal.
  if (!row.closest_sku_candidate && row.occurrence_count >= 3) return "likely_competitor";
  return "other";
}

function followUpHint(row: FailedOcrRow): string {
  const cat = categorize(row);
  if (cat === "likely_taco" && row.closest_sku_candidate) {
    return `Tambahkan sinonim ke ${row.closest_sku_candidate.code}`;
  }
  if (cat === "likely_competitor") {
    return "Kemungkinan produk kompetitor";
  }
  return "Pertimbangkan SKU baru";
}

function followUpTone(row: FailedOcrRow): "ok" | "warn" | "info" {
  const cat = categorize(row);
  if (cat === "likely_taco") return "ok";
  if (cat === "likely_competitor") return "warn";
  return "info";
}

export default function FailedOcrPage() {
  const [rows, setRows] = useState<FailedOcrRow[]>([]);
  const [regions, setRegions] = useState<RegionArea[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [reasonFilter, setReasonFilter] = useState<"all" | Reason>("all");
  const [regionFilter, setRegionFilter] = useState<"all" | string>("all");
  const [agentFilter, setAgentFilter] = useState<"all" | string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getRegionAreas();
        const data =
          ((res.data as { data?: RegionArea[] })?.data ??
            (res.data as RegionArea[])) ?? [];
        setRegions(data.length ? data : MOCK_REGION_AREAS);
      } catch {
        setRegions(MOCK_REGION_AREAS);
      }
    })();
  }, []);

  const fetchFailed = useCallback(async () => {
    const params: Record<string, string> = {};
    if (regionFilter !== "all") params.region_id = regionFilter;
    if (agentFilter !== "all") params.agent_id = agentFilter;
    if (reasonFilter !== "all") params.reason = reasonFilter;
    try {
      // Use the axios `api` instance so auth interceptor attaches the JWT.
      const r = await api.get("/taro-invoices/failed-ocr", { params });
      const j = r.data as { data?: FailedOcrRow[] } | FailedOcrRow[];
      const data = (Array.isArray(j) ? j : j?.data) ?? [];
      if (Array.isArray(data) && data.length) {
        setRows(data);
        // Refresh agent list from the BE rows' sample items so the filter
        // matches what's actually in the table.
        const agentSet = new Map<string, AgentLite>();
        for (const row of data) {
          for (const s of row.sample_line_items ?? []) {
            if (s.agent?.id) agentSet.set(s.agent.id, { id: s.agent.id, name: s.agent.name });
          }
        }
        if (agentSet.size) setAgents(Array.from(agentSet.values()));
        return;
      }
    } catch {
      /* fallthrough */
    }
    setRows(MOCK_FAILED);
    const mockAgents = new Map<string, AgentLite>();
    for (const row of MOCK_FAILED) {
      for (const s of row.sample_line_items) {
        if (s.agent) mockAgents.set(s.agent.id, { id: s.agent.id, name: s.agent.name });
      }
    }
    setAgents(Array.from(mockAgents.values()));
  }, [reasonFilter, regionFilter, agentFilter]);

  useEffect(() => {
    fetchFailed();
  }, [fetchFailed]);

  // Client-side filter — guarantees visible rows always honor active filters
  // even when the BE ignores a param.
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (reasonFilter !== "all" && r.failure_reason !== reasonFilter) return false;
      if (regionFilter !== "all") {
        const hit = (r.sample_line_items ?? []).some((s) => s.region?.id === regionFilter);
        if (!hit) return false;
      }
      if (agentFilter !== "all") {
        const hit = (r.sample_line_items ?? []).some((s) => s.agent?.id === agentFilter);
        if (!hit) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!r.raw_text.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, reasonFilter, regionFilter, agentFilter, search]);

  // 4 KPI tiles — derived from full row set (not filtered, so the tile values
  // describe the field as a whole regardless of the active filter).
  const kpis = useMemo(() => {
    const total = rows.reduce((sum, r) => sum + r.occurrence_count, 0);
    const likelyTaco = rows.filter((r) => categorize(r) === "likely_taco").length;
    const likelyCompetitor = rows.filter((r) => categorize(r) === "likely_competitor").length;
    const avgFreq = rows.length ? total / rows.length : 0;
    return { total, likelyTaco, likelyCompetitor, avgFreq };
  }, [rows]);

  // Unique region list from sample items — for region filter (BE rows might
  // not include every region in MOCK_REGION_AREAS).
  const sampleRegions = useMemo(() => {
    const m = new Map<string, { id: string; display_path: string }>();
    for (const r of rows) {
      for (const s of r.sample_line_items ?? []) {
        if (s.region) m.set(s.region.id, { id: s.region.id, display_path: s.region.display_path });
      }
    }
    return Array.from(m.values());
  }, [rows]);

  const regionOptions = regions.length ? regions : sampleRegions.map((r) => ({ id: r.id, code: "", name: "", display_path: r.display_path, type: "area" as const }));

  return (
    <div className="space-y-5">
      <h1 className="text-[20px] font-bold text-taco-text leading-tight">
        OCR Gagal
      </h1>

      {/* 4 KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile
          label="Total OCR Gagal"
          value={kpis.total.toLocaleString("id-ID")}
          hint="Total kemunculan periode aktif"
        />
        <KpiTile
          label="Mirip Produk TACO"
          value={kpis.likelyTaco.toString()}
          hint="Kemungkinan butuh sinonim baru"
          dotColor="#1D9E75"
        />
        <KpiTile
          label="Kemungkinan Kompetitor"
          value={kpis.likelyCompetitor.toString()}
          hint="Tidak ada padanan TACO, berulang"
          dotColor="#E07B00"
        />
        <KpiTile
          label="Rata-rata Frekuensi"
          value={kpis.avgFreq.toFixed(1)}
          hint="Kemunculan per item"
        />
      </div>

      <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-taco-divider flex items-center gap-3 flex-wrap bg-taco-page">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted">
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari raw text…"
              className="h-[36px] pl-9 pr-3 border border-taco-border rounded-lg text-[13px] text-taco-text bg-white outline-none w-[240px] focus:border-taco-text"
            />
          </div>

          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value as "all" | Reason)}
            className={`h-[36px] px-2.5 border rounded-lg text-[13px] bg-white outline-none ${
              reasonFilter !== "all" ? "border-taco-text" : "border-taco-border"
            }`}
            aria-label="Filter alasan"
          >
            <option value="all">Semua Alasan</option>
            {(Object.keys(REASON_LABEL) as Reason[]).map((r) => (
              <option key={r} value={r}>
                {REASON_LABEL[r]}
              </option>
            ))}
          </select>

          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className={`h-[36px] px-2.5 border rounded-lg text-[13px] bg-white outline-none max-w-[240px] ${
              regionFilter !== "all" ? "border-taco-text" : "border-taco-border"
            }`}
            aria-label="Filter wilayah"
          >
            <option value="all">Semua Wilayah</option>
            {regionOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_path}
              </option>
            ))}
          </select>

          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className={`h-[36px] px-2.5 border rounded-lg text-[13px] bg-white outline-none ${
              agentFilter !== "all" ? "border-taco-text" : "border-taco-border"
            }`}
            aria-label="Filter agent"
          >
            <option value="all">Semua Agent</option>
            {agents.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <div className="ml-auto text-[12px] text-taco-muted">
            {filtered.length} / {rows.length} item
          </div>
        </div>

        <table className="w-full">
          <TableHeader
            cols={[
              "Raw OCR Text",
              "Frekuensi",
              "Alasan",
              "Closest TACO Match",
              "Wilayah",
              "Agent",
              "Tindak Lanjut",
            ]}
          />
          <tbody>
            {filtered.length === 0 ? (
              <EmptyRow
                colSpan={7}
                label="Tidak ada line item yang cocok dengan filter."
              />
            ) : (
              filtered.map((r) => {
                const isOpen = expanded === r.raw_text;
                const regionSet = Array.from(
                  new Set(
                    (r.sample_line_items ?? [])
                      .map((s) => s.region?.display_path)
                      .filter((x): x is string => !!x)
                  )
                );
                const agentSet = Array.from(
                  new Set(
                    (r.sample_line_items ?? [])
                      .map((s) => s.agent?.name)
                      .filter((x): x is string => !!x)
                  )
                );
                return (
                  <>
                    <tr
                      key={r.raw_text}
                      className={`border-b border-taco-divider last:border-0 cursor-pointer ${
                        isOpen ? "bg-taco-page" : "hover:bg-taco-page"
                      }`}
                      onClick={() => setExpanded(isOpen ? null : r.raw_text)}
                    >
                      <td className="px-4 py-3 text-[13px] text-taco-text max-w-[260px]">
                        <div className="flex items-center gap-2">
                          <span className={`text-taco-muted text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                          <div className="truncate" title={r.raw_text}>
                            {r.raw_text}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap">
                        <span className="font-semibold">{r.occurrence_count}</span>
                        <span className="text-taco-muted text-[11px] ml-1">x</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge tone={REASON_TONE[r.failure_reason]}>
                          {REASON_LABEL[r.failure_reason]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[12px] max-w-[220px]">
                        {r.closest_sku_candidate ? (
                          <div className="inline-flex items-center gap-2 px-2 py-1 bg-taco-page border border-taco-divider rounded-md max-w-full">
                            <span className="font-mono text-[10px] text-taco-muted flex-shrink-0">
                              {r.closest_sku_candidate.code}
                            </span>
                            <span className="text-taco-text truncate">
                              {r.closest_sku_candidate.name}
                            </span>
                            <span className="text-taco-muted text-[10px] flex-shrink-0">
                              {Math.round(r.closest_sku_candidate.similarity * 100)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-taco-muted italic text-[12px]">Tidak ada padanan</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-taco-sub max-w-[180px]">
                        <div className="truncate" title={regionSet.join(", ")}>
                          {regionSet.length === 0
                            ? "—"
                            : regionSet.length === 1
                              ? regionSet[0]
                              : `${regionSet[0]} +${regionSet.length - 1}`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-taco-sub whitespace-nowrap">
                        {agentSet.length === 0
                          ? "—"
                          : agentSet.length === 1
                            ? agentSet[0]
                            : `${agentSet[0]} +${agentSet.length - 1}`}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={followUpTone(r)}>{followUpHint(r)}</Badge>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.raw_text}-expand`} className="bg-taco-page">
                        <td colSpan={7} className="px-4 py-3 border-b border-taco-divider">
                          <div className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider mb-2">
                            Sample Line Items ({(r.sample_line_items ?? []).length})
                          </div>
                          <div className="grid grid-cols-1 gap-1.5">
                            {(r.sample_line_items ?? []).slice(0, 5).map((s) => (
                              <div
                                key={s.line_item_id}
                                className="bg-white border border-taco-divider rounded-md px-3 py-2 text-[12px] flex items-center gap-3 flex-wrap"
                              >
                                <a
                                  href={`/taro/invoices/${s.invoice_id}`}
                                  className="font-mono text-[11px] text-taco-text hover:text-taco-accent"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {s.invoice_id.slice(0, 8)}
                                </a>
                                <span className="text-taco-text truncate flex-1 min-w-0">
                                  {s.raw_text}
                                </span>
                                <span className="text-taco-muted whitespace-nowrap">
                                  {Math.round(s.confidence_score * 100)}%
                                </span>
                                <span className="text-taco-sub whitespace-nowrap max-w-[180px] truncate">
                                  {s.agent?.name ?? "—"}
                                </span>
                                <span className="text-taco-muted whitespace-nowrap text-[11px]">
                                  {formatDateTime(s.uploaded_at)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function KpiTile({
  label,
  value,
  hint,
  dotColor,
}: {
  label: string;
  value: string;
  hint?: string;
  dotColor?: string;
}) {
  return (
    <div className="bg-white border border-taco-border rounded-xl p-4">
      <div className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider flex items-center gap-1.5">
        {dotColor && (
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: dotColor }}
          />
        )}
        {label}
      </div>
      <div className="text-[22px] font-bold mt-1.5 leading-tight text-taco-text">
        {value}
      </div>
      {hint && <div className="text-[12px] text-taco-sub mt-0.5">{hint}</div>}
    </div>
  );
}
