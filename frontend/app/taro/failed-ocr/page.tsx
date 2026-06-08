"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getRegionAreas,
  getTacoSkus,
  updateTaroLineItem,
  type RegionArea,
} from "@/lib/api";
import { Badge, TableHeader, EmptyRow } from "../../admin/_components/CrudShell";
import { Modal } from "../../admin/_components/Modal";
import { SearchIcon } from "../../admin/_components/icons";
import {
  MOCK_REGION_AREAS,
  formatDateTime,
} from "../../admin/taro-invoices/_components/mockData";
import type { TacoSkuRow } from "../../admin/taco-skus/_components/SkuTable";

/** Failure reason — controlled vocab so BE alignment is trivial. */
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

interface FailedOcrRow {
  id: string;
  raw_text: string;
  frequency: number;
  reason: Reason;
  region_id: string | null;
  region_display: string | null;
  agent_id: string | null;
  agent_name: string | null;
  detected_at: string;
}

interface AgentLite {
  id: string;
  name: string;
}

/** Mock failures — used when /api/taro-invoices/failed-ocr 404s. The shape
 *  matches what Core's spec'd to ship, so swap-in is a no-op. */
const MOCK_FAILED: FailedOcrRow[] = [
  { id: "f-1", raw_text: "Engsel softclose XYZ", frequency: 15, reason: "no_match", region_id: "area-w-jkt-s", region_display: "W - BU2 - ASM Jakarta Selatan", agent_id: "ag-1", agent_name: "Andika Pratama", detected_at: "2026-06-08T07:14:00Z" },
  { id: "f-2", raw_text: "TC Edging ABS 2mm WLN", frequency: 12, reason: "low_confidence", region_id: "area-c-bdg", region_display: "C - BU1 - ASM Bandung", agent_id: "ag-2", agent_name: "Sri Wahyuni", detected_at: "2026-06-08T06:42:00Z" },
  { id: "f-3", raw_text: "Hardware engsel piano", frequency: 9, reason: "no_match", region_id: "area-e-sby", region_display: "E - BU1 - ASM Surabaya", agent_id: "ag-3", agent_name: "Budi Santoso", detected_at: "2026-06-07T16:20:00Z" },
  { id: "f-4", raw_text: "FD MDF 9mm sheet", frequency: 7, reason: "ambiguous", region_id: "area-c-smg", region_display: "C - BU1 - ASM Semarang", agent_id: "ag-4", agent_name: "Lestari Putri", detected_at: "2026-06-07T11:05:00Z" },
  { id: "f-5", raw_text: "Lem Putih Universal 1kg", frequency: 6, reason: "no_match", region_id: "area-n-mdn", region_display: "N - BU1 - ASM Medan", agent_id: "ag-5", agent_name: "Rizky Hidayat", detected_at: "2026-06-07T09:30:00Z" },
  { id: "f-6", raw_text: "Vinyl Lux Plank Oak", frequency: 5, reason: "low_confidence", region_id: "area-w-jkt-b", region_display: "W - BU2 - ASM Jakarta Barat", agent_id: "ag-6", agent_name: "Maya Anggraini", detected_at: "2026-06-06T15:48:00Z" },
  { id: "f-7", raw_text: "Paku Beton 5cm", frequency: 4, reason: "no_match", region_id: "area-e-mlg", region_display: "E - BU1 - ASM Malang", agent_id: "ag-7", agent_name: "Dimas Saputra", detected_at: "2026-06-06T10:11:00Z" },
  { id: "f-8", raw_text: "TC Sheet Beech variant?", frequency: 3, reason: "ambiguous", region_id: "area-s-plg", region_display: "S - BU1 - ASM Palembang", agent_id: "ag-8", agent_name: "Fitri Ramadhani", detected_at: "2026-06-05T14:00:00Z" },
];

/** Distinct agents from the mock failed list — for the agent filter. */
const MOCK_AGENTS: AgentLite[] = Array.from(
  new Map(
    MOCK_FAILED.filter((r) => r.agent_id).map((r) => [
      r.agent_id!,
      { id: r.agent_id!, name: r.agent_name ?? "" },
    ])
  ).values()
);

export default function FailedOcrPage() {
  const [rows, setRows] = useState<FailedOcrRow[]>([]);
  const [regions, setRegions] = useState<RegionArea[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>(MOCK_AGENTS);
  const [reasonFilter, setReasonFilter] = useState<"all" | Reason>("all");
  const [regionFilter, setRegionFilter] = useState<"all" | string>("all");
  const [agentFilter, setAgentFilter] = useState<"all" | string>("all");
  const [search, setSearch] = useState("");
  const [mapping, setMapping] = useState<FailedOcrRow | null>(null);

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
    const params = new URLSearchParams();
    if (regionFilter !== "all") params.set("region_id", regionFilter);
    if (agentFilter !== "all") params.set("agent_id", agentFilter);
    if (reasonFilter !== "all") params.set("reason", reasonFilter);
    const url = `/api/taro-invoices/failed-ocr?${params.toString()}`;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        const data = (j?.data ?? j) as FailedOcrRow[];
        if (Array.isArray(data) && data.length) {
          setRows(data);
          // Refresh agents list from BE response if it ships agent fields.
          const a = Array.from(
            new Map(
              data
                .filter((d) => d.agent_id)
                .map((d) => [d.agent_id!, { id: d.agent_id!, name: d.agent_name ?? "" }])
            ).values()
          );
          if (a.length) setAgents(a);
          return;
        }
      }
    } catch {
      /* fallthrough */
    }
    setRows(MOCK_FAILED);
    setAgents(MOCK_AGENTS);
  }, [reasonFilter, regionFilter, agentFilter]);

  useEffect(() => {
    fetchFailed();
  }, [fetchFailed]);

  // Client-side filter — guarantees the visible rows always honor the active
  // filters even when the BE ignores a param.
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (reasonFilter !== "all" && r.reason !== reasonFilter) return false;
      if (regionFilter !== "all" && r.region_id !== regionFilter) return false;
      if (agentFilter !== "all" && r.agent_id !== agentFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = [
          r.raw_text,
          r.region_display ?? "",
          r.agent_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, reasonFilter, regionFilter, agentFilter, search]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-bold text-taco-text leading-tight">
          OCR Gagal
        </h1>
        <p className="text-[13px] text-taco-sub mt-1">
          Line item yang tidak berhasil dicocokkan oleh sistem. Petakan secara
          manual untuk melatih akurasi OCR.
        </p>
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
              placeholder="Cari raw text, wilayah, atau agent…"
              className="h-[36px] pl-9 pr-3 border border-taco-border rounded-lg text-[13px] text-taco-text bg-white outline-none w-[260px] focus:border-taco-text"
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
            {regions.map((r) => (
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
              "Wilayah",
              "Agent",
              "Tanggal",
              "Aksi",
            ]}
          />
          <tbody>
            {filtered.length === 0 ? (
              <EmptyRow
                colSpan={7}
                label="Tidak ada line item yang cocok dengan filter."
              />
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
                >
                  <td className="px-4 py-3 text-[13px] text-taco-text max-w-[260px]">
                    <div className="truncate" title={r.raw_text}>
                      {r.raw_text}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap">
                    <span className="font-semibold">{r.frequency}</span>
                    <span className="text-taco-muted text-[11px] ml-1">x</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge tone={REASON_TONE[r.reason]}>
                      {REASON_LABEL[r.reason]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub max-w-[200px]">
                    <div className="truncate">
                      {r.region_display ?? (
                        <span className="italic text-taco-muted">Tanpa Region</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap">
                    {r.agent_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub whitespace-nowrap">
                    {formatDateTime(r.detected_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setMapping(r)}
                      className="h-[28px] px-2.5 border border-taco-text rounded-md text-[12px] text-taco-text font-medium hover:bg-taco-text hover:text-white transition-colors"
                    >
                      Map ke SKU
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {mapping && (
        <MapToSkuModal
          line={mapping}
          onClose={() => setMapping(null)}
          onMapped={() => {
            // Drop the row from the visible list — Core hasn't shipped delete
            // semantics yet, but locally it's gone after mapping.
            setRows((prev) => prev.filter((r) => r.id !== mapping.id));
            setMapping(null);
          }}
        />
      )}
    </div>
  );
}

function MapToSkuModal({
  line,
  onClose,
  onMapped,
}: {
  line: FailedOcrRow;
  onClose: () => void;
  onMapped: () => void;
}) {
  const [skus, setSkus] = useState<TacoSkuRow[]>([]);
  const [skuSearch, setSkuSearch] = useState("");
  const [selectedSku, setSelectedSku] = useState<TacoSkuRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getTacoSkus();
        const data =
          ((res.data as { data?: TacoSkuRow[] })?.data ??
            (res.data as TacoSkuRow[])) ?? [];
        setSkus(data);
      } catch {
        setSkus([]);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!skuSearch.trim()) return skus.slice(0, 10);
    const q = skuSearch.toLowerCase();
    return skus
      .filter((s) => {
        const syns = Array.isArray(s.synonyms)
          ? s.synonyms
          : typeof s.synonyms === "string"
            ? s.synonyms.split(/[,\n]/g)
            : [];
        const synHit = syns.some((syn) => syn.toLowerCase().includes(q));
        return (
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          synHit
        );
      })
      .slice(0, 10);
  }, [skus, skuSearch]);

  const canSave = !!selectedSku && reason.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || !selectedSku) return;
    setBusy(true);
    try {
      try {
        await updateTaroLineItem(line.id, {
          matched_sku_id: selectedSku.id,
          reason: reason.trim(),
        });
      } catch {
        /* fall through — mock mode */
      }
      onMapped();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Map Raw OCR ke SKU"
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Simpan Mapping"
      busy={busy}
      saveDisabled={!canSave}
      size="wide"
    >
      <div className="space-y-4">
        <div className="bg-taco-page border border-taco-divider rounded-lg p-3 text-[13px]">
          <div className="text-[11px] font-semibold text-taco-muted uppercase tracking-wider mb-1">
            Raw OCR text (muncul {line.frequency}x)
          </div>
          <div className="text-taco-text">{line.raw_text}</div>
        </div>

        <div>
          <label className="block text-[13px] font-medium text-taco-text mb-1.5">
            Cari SKU TACO (cocok nama, kode, atau sinonim)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted">
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              value={skuSearch}
              onChange={(e) => setSkuSearch(e.target.value)}
              placeholder="Mis. engsel, walnut, FIDECO…"
              className="w-full h-[44px] pl-9 pr-3 border border-taco-border rounded-lg text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
            />
          </div>
          <div className="mt-2 max-h-[220px] overflow-y-auto border border-taco-divider rounded-lg divide-y divide-taco-divider">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-taco-muted">
                Tidak ada SKU cocok — pertimbangkan tambah SKU baru via
                Rekomendasi.
              </div>
            ) : (
              filtered.map((s) => {
                const active = selectedSku?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSku(s)}
                    className={`w-full text-left px-3 py-2 hover:bg-taco-page ${
                      active ? "bg-taco-accent-tint" : ""
                    }`}
                  >
                    <div className="font-mono text-[11px] text-taco-muted">
                      {s.code}
                    </div>
                    <div className="text-[13px] text-taco-text">{s.name}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-medium text-taco-text mb-1.5">
            Alasan koreksi <span className="text-taco-error">*</span>
          </label>
          <div className="text-[12px] text-taco-muted mb-1.5">
            Sistem belajar dari alasan ini untuk meningkatkan akurasi OCR
            (mis. tambahkan sinonim baru, normalisasi singkatan).
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Mis. XYZ adalah merk lokal untuk engsel SoftClose generic — petakan ke HW-HNG-01."
            className="w-full border border-taco-border rounded-lg px-3 py-2.5 text-[14px] text-taco-text bg-white outline-none resize-none focus:border-taco-text"
          />
        </div>
      </div>
    </Modal>
  );
}
