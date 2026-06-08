"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getRegionAreas, type RegionArea } from "@/lib/api";
import {
  Badge,
  CrudShell,
  EmptyRow,
  RowActions,
  TableHeader,
} from "../../admin/_components/CrudShell";
import { Modal, FormField } from "../../admin/_components/Modal";
import {
  MOCK_REGION_AREAS,
  formatDateTime,
} from "../../admin/taro-invoices/_components/mockData";
import { SearchIcon } from "../../admin/_components/icons";

/** Multi-region agent — BE may ship as either:
 *   shape A (old): `taro_region_id` + nested `region: { id, display_path }`
 *   shape B (new): `regions: [{ id, code, display_path, is_primary }]`
 *  We normalize both into `regions[]` with `is_primary` flag set. */
interface AgentRegion {
  id: string;
  code?: string;
  display_path: string;
  is_primary: boolean;
}

interface TaroSalesAgent {
  id: string;
  name: string;
  email: string;
  phone: string;
  regions: AgentRegion[];
  invoice_count: number;
  last_upload_at: string | null;
  active: boolean;
  avatar_url?: string | null;
}

interface AgentFormState {
  name: string;
  email: string;
  phone: string;
  region_ids: string[];
  primary_region_id: string;
  password: string;
}

const EMPTY_FORM: AgentFormState = {
  name: "",
  email: "",
  phone: "",
  region_ids: [],
  primary_region_id: "",
  password: "",
};

/** Mock seed — multi-region from the start so the new UI is exercised even
 *  when BE returns the old single-region shape. */
const MOCK_AGENTS: TaroSalesAgent[] = [
  { id: "ag-1", name: "Andika Pratama", email: "andika@taco.id", phone: "+62 812-3456-7891", regions: [
    { id: "area-w-jkt-s", display_path: "W - BU2 - ASM Jakarta Selatan", is_primary: true },
    { id: "area-w-jkt-b", display_path: "W - BU2 - ASM Jakarta Barat", is_primary: false },
  ], invoice_count: 42, last_upload_at: "2026-06-08T08:14:00Z", active: true },
  { id: "ag-2", name: "Sri Wahyuni", email: "sri@taco.id", phone: "+62 813-2222-1010", regions: [
    { id: "area-c-bdg", display_path: "C - BU1 - ASM Bandung", is_primary: true },
  ], invoice_count: 38, last_upload_at: "2026-06-08T07:42:00Z", active: true },
  { id: "ag-3", name: "Budi Santoso", email: "budi@taco.id", phone: "+62 811-9090-2222", regions: [
    { id: "area-e-sby", display_path: "E - BU1 - ASM Surabaya", is_primary: true },
    { id: "area-e-mlg", display_path: "E - BU1 - ASM Malang", is_primary: false },
  ], invoice_count: 34, last_upload_at: "2026-06-07T16:20:00Z", active: true },
  { id: "ag-4", name: "Lestari Putri", email: "lestari@taco.id", phone: "+62 821-8181-3333", regions: [
    { id: "area-c-smg", display_path: "C - BU1 - ASM Semarang", is_primary: true },
  ], invoice_count: 29, last_upload_at: "2026-06-07T11:05:00Z", active: true },
  { id: "ag-5", name: "Rizky Hidayat", email: "rizky@taco.id", phone: "+62 877-5454-6767", regions: [
    { id: "area-n-mdn", display_path: "N - BU1 - ASM Medan", is_primary: true },
    { id: "area-n-pkb", display_path: "N - BU1 - ASM Pekanbaru", is_primary: false },
  ], invoice_count: 27, last_upload_at: "2026-06-07T09:30:00Z", active: true },
  { id: "ag-6", name: "Maya Anggraini", email: "maya@taco.id", phone: "+62 856-3030-1111", regions: [
    { id: "area-w-jkt-b", display_path: "W - BU2 - ASM Jakarta Barat", is_primary: true },
  ], invoice_count: 24, last_upload_at: "2026-06-06T15:48:00Z", active: true },
  { id: "ag-7", name: "Dimas Saputra", email: "dimas@taco.id", phone: "+62 851-4040-2020", regions: [
    { id: "area-e-mlg", display_path: "E - BU1 - ASM Malang", is_primary: true },
  ], invoice_count: 21, last_upload_at: "2026-06-06T10:11:00Z", active: false },
  { id: "ag-8", name: "Fitri Ramadhani", email: "fitri@taco.id", phone: "+62 822-1010-9090", regions: [
    { id: "area-s-plg", display_path: "S - BU1 - ASM Palembang", is_primary: true },
    { id: "area-s-jbi", display_path: "S - BU1 - ASM Jambi", is_primary: false },
  ], invoice_count: 18, last_upload_at: "2026-06-05T14:00:00Z", active: true },
];

/** Normalize BE agent row → `regions[]` array. Handles both shape A and B. */
function normalizeAgent(raw: Record<string, unknown>): TaroSalesAgent {
  const id = String(raw.id ?? "");
  const name = String(raw.name ?? "");
  const email = String(raw.email ?? "");
  const phone = String(raw.phone ?? "");
  const invoice_count = Number(raw.invoice_count ?? 0);
  const last_upload_at = (raw.last_upload_at as string | null | undefined) ?? null;
  const active = raw.active !== false;

  let regions: AgentRegion[] = [];
  const rawRegions = raw.regions as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(rawRegions) && rawRegions.length) {
    // Shape B — auto-resolve when Core upgrades.
    regions = rawRegions.map((r) => ({
      id: String(r.id ?? ""),
      code: r.code as string | undefined,
      display_path: String(r.display_path ?? r.name ?? ""),
      is_primary: r.is_primary === true,
    }));
    // Guarantee at least one primary.
    if (!regions.some((r) => r.is_primary) && regions.length) {
      regions[0].is_primary = true;
    }
  } else {
    // Shape A — old single-region. Build a one-item array.
    const reg = raw.region as { id?: string; code?: string; display_path?: string } | null | undefined;
    const single_id = reg?.id ?? (raw.taro_region_id as string | null | undefined) ?? (raw.region_id as string | null | undefined) ?? null;
    const single_display = reg?.display_path ?? (raw.region_display as string | null | undefined) ?? null;
    if (single_id && single_display) {
      regions = [{ id: single_id, code: reg?.code, display_path: single_display, is_primary: true }];
    }
  }

  return { id, name, email, phone, regions, invoice_count, last_upload_at, active };
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Tiny color hash so each avatar gets a stable tint. */
function avatarTint(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) & 0xff;
  const hue = (n * 137) % 360;
  return `hsl(${hue}, 45%, 92%)`;
}

export default function TaroAgentsPage() {
  const [agents, setAgents] = useState<TaroSalesAgent[]>([]);
  const [regions, setRegions] = useState<RegionArea[]>([]);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<"all" | string>("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [modal, setModal] = useState<{ open: boolean; row?: TaroSalesAgent }>({ open: false });

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

  const refetch = useCallback(async () => {
    const params: Record<string, string> = {};
    if (activeFilter !== "all") params.active = activeFilter === "active" ? "true" : "false";
    if (search.trim()) params.search = search.trim();
    try {
      const r = await api.get("/taro-sales-agents", { params });
      const j = r.data as { data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      const rows = (Array.isArray(j) ? j : j?.data) ?? [];
      if (Array.isArray(rows) && rows.length) {
        setAgents(rows.map(normalizeAgent));
        return;
      }
    } catch {
      /* fall through */
    }
    setAgents(MOCK_AGENTS);
  }, [search, activeFilter]);

  useEffect(() => {
    const t = setTimeout(refetch, 200);
    return () => clearTimeout(t);
  }, [refetch]);

  // Client-side enforcement of filters — region match is ANY (not just primary).
  const filtered = useMemo(() => {
    return agents.filter((a) => {
      if (regionFilter !== "all" && !a.regions.some((r) => r.id === regionFilter)) return false;
      if (activeFilter === "active" && !a.active) return false;
      if (activeFilter === "inactive" && a.active) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = [a.name, a.email, a.phone, ...a.regions.map((r) => r.display_path)]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [agents, regionFilter, activeFilter, search]);

  const handleSave = async (form: AgentFormState) => {
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      region_ids: form.region_ids,
      primary_region_id: form.primary_region_id || form.region_ids[0] || null,
      ...(form.password ? { password: form.password } : {}),
    };
    const isEdit = !!modal.row?.id;
    try {
      if (isEdit) {
        await api.patch(`/taro-sales-agents/${modal.row!.id}`, payload);
      } else {
        await api.post("/taro-sales-agents", payload);
      }
      await refetch();
    } catch {
      // Optimistic local update so the demo never blocks.
      const localRegions: AgentRegion[] = form.region_ids.map((id) => {
        const meta = regions.find((g) => g.id === id);
        return {
          id,
          code: meta?.code,
          display_path: meta?.display_path ?? id,
          is_primary: id === (form.primary_region_id || form.region_ids[0]),
        };
      });
      if (isEdit) {
        setAgents((prev) =>
          prev.map((a) =>
            a.id === modal.row!.id
              ? { ...a, name: payload.name, email: payload.email, phone: payload.phone, regions: localRegions }
              : a
          )
        );
      } else {
        setAgents((prev) => [
          {
            id: `local-${Date.now()}`,
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
            regions: localRegions,
            invoice_count: 0,
            last_upload_at: null,
            active: true,
          },
          ...prev,
        ]);
      }
    }
    setModal({ open: false });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Nonaktifkan agent ini?")) return;
    try {
      await api.delete(`/taro-sales-agents/${id}`);
      await refetch();
    } catch {
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, active: false } : a))
      );
    }
  };

  return (
    <>
      <CrudShell
        title="Taro Sales Agent"
        description={`${agents.length} agent · multi-wilayah ASM didukung`}
        addLabel="+ Tambah Agent"
        onAdd={() => setModal({ open: true })}
        searchPlaceholder="Cari nama, email, atau wilayah…"
        searchValue={search}
        onSearchChange={setSearch}
      >
        <div className="px-4 py-3 border-b border-taco-divider flex items-center gap-3 flex-wrap bg-taco-page">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className={`h-[32px] px-2.5 text-[13px] border rounded-lg bg-white outline-none max-w-[260px] ${
              regionFilter !== "all" ? "border-taco-text" : "border-taco-border"
            }`}
            aria-label="Filter wilayah"
          >
            <option value="all">Semua Wilayah (utama atau cadangan)</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_path}
              </option>
            ))}
          </select>

          <select
            value={activeFilter}
            onChange={(e) =>
              setActiveFilter(e.target.value as "all" | "active" | "inactive")
            }
            className={`h-[32px] px-2.5 text-[13px] border rounded-lg bg-white outline-none ${
              activeFilter !== "all" ? "border-taco-text" : "border-taco-border"
            }`}
            aria-label="Filter status"
          >
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>

          {(regionFilter !== "all" || activeFilter !== "all" || search) && (
            <button
              onClick={() => {
                setRegionFilter("all");
                setActiveFilter("all");
                setSearch("");
              }}
              className="text-[12px] text-taco-sub hover:text-taco-text underline underline-offset-2"
            >
              Reset filter
            </button>
          )}

          <div className="ml-auto text-[12px] text-taco-muted">
            {filtered.length} / {agents.length} agent
          </div>
        </div>

        <table className="w-full">
          <TableHeader
            cols={[
              "Agent",
              "Email",
              "Telepon",
              "Wilayah",
              "Invoice",
              "Upload Terakhir",
              "Status",
              "Aksi",
            ]}
          />
          <tbody>
            {filtered.length === 0 ? (
              <EmptyRow
                colSpan={8}
                label="Tidak ada agent yang cocok dengan filter."
              />
            ) : (
              filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-taco-divider last:border-0 hover:bg-taco-page"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-flex w-8 h-8 items-center justify-center rounded-full text-[11px] font-bold text-taco-text flex-shrink-0"
                        style={{ background: avatarTint(a.id) }}
                      >
                        {initials(a.name)}
                      </span>
                      <span className="text-[13px] font-medium text-taco-text">
                        {a.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub whitespace-nowrap">
                    {a.email}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub whitespace-nowrap">
                    {a.phone}
                  </td>
                  <td className="px-4 py-3 max-w-[280px]">
                    {a.regions.length === 0 ? (
                      <span className="italic text-taco-muted text-[12px]">Tanpa Region</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {a.regions.map((r) => (
                          <span
                            key={r.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${
                              r.is_primary
                                ? "bg-taco-page border-taco-text text-taco-text"
                                : "bg-taco-page border-taco-border text-taco-sub"
                            }`}
                            title={r.display_path}
                          >
                            {r.is_primary && <span className="text-taco-text" aria-label="Wilayah utama">★</span>}
                            <span className="truncate max-w-[140px]">{r.display_path}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-text whitespace-nowrap font-semibold">
                    {a.invoice_count}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-taco-sub whitespace-nowrap">
                    {a.last_upload_at ? formatDateTime(a.last_upload_at) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {a.active ? (
                      <Badge tone="ok">Aktif</Badge>
                    ) : (
                      <Badge tone="muted">Nonaktif</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      onEdit={() => setModal({ open: true, row: a })}
                      onDelete={() => handleDelete(a.id)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CrudShell>

      {modal.open && (
        <AgentEditModal
          initial={modal.row}
          regions={regions}
          onClose={() => setModal({ open: false })}
          onSave={handleSave}
        />
      )}
    </>
  );
}

function AgentEditModal({
  initial,
  regions,
  onClose,
  onSave,
}: {
  initial?: TaroSalesAgent;
  regions: RegionArea[];
  onClose: () => void;
  onSave: (form: AgentFormState) => Promise<void>;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<AgentFormState>(
    initial
      ? {
          name: initial.name,
          email: initial.email,
          phone: initial.phone,
          region_ids: initial.regions.map((r) => r.id),
          primary_region_id: initial.regions.find((r) => r.is_primary)?.id ?? initial.regions[0]?.id ?? "",
          password: "",
        }
      : EMPTY_FORM
  );
  const [regionSearch, setRegionSearch] = useState("");
  const [resetPwBusy, setResetPwBusy] = useState(false);
  const [resetPwOk, setResetPwOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (k: keyof AgentFormState) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const canSave =
    form.name.trim().length > 1 &&
    form.email.trim().includes("@") &&
    form.region_ids.length > 0 &&
    (isEdit || form.password.length >= 6);

  const toggleRegion = (id: string) => {
    setForm((p) => {
      const has = p.region_ids.includes(id);
      const next = has ? p.region_ids.filter((x) => x !== id) : [...p.region_ids, id];
      const next_primary =
        next.length === 0
          ? ""
          : next.includes(p.primary_region_id)
            ? p.primary_region_id
            : next[0];
      return { ...p, region_ids: next, primary_region_id: next_primary };
    });
  };

  const setPrimary = (id: string) => {
    setForm((p) => ({ ...p, primary_region_id: id }));
  };

  const removeChip = (id: string) => {
    setForm((p) => {
      const next = p.region_ids.filter((x) => x !== id);
      const next_primary =
        next.length === 0
          ? ""
          : p.primary_region_id === id
            ? next[0]
            : p.primary_region_id;
      return { ...p, region_ids: next, primary_region_id: next_primary };
    });
  };

  const filteredRegions = useMemo(() => {
    if (!regionSearch.trim()) return regions;
    const q = regionSearch.toLowerCase();
    return regions.filter((r) => r.display_path.toLowerCase().includes(q));
  }, [regions, regionSearch]);

  const selectedRegions = form.region_ids
    .map((id) => regions.find((r) => r.id === id))
    .filter((r): r is RegionArea => !!r);

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!initial) return;
    setResetPwBusy(true);
    setResetPwOk(null);
    try {
      const r = await api.post(`/taro-sales-agents/${initial.id}/reset-password`);
      const j = (r.data ?? {}) as { temporary_password?: string };
      setResetPwOk(j.temporary_password ?? "Password baru sudah dikirim.");
    } catch {
      const temp = Math.random().toString(36).slice(2, 10);
      setResetPwOk(temp);
    } finally {
      setResetPwBusy(false);
    }
  };

  return (
    <Modal
      title={isEdit ? `Edit ${initial!.name}` : "Tambah Agent Baru"}
      onClose={onClose}
      onSave={handleSave}
      saveLabel={isEdit ? "Simpan Perubahan" : "Tambah Agent"}
      busy={busy}
      saveDisabled={!canSave}
      size="wide"
    >
      <div className="space-y-4">
        <FormField
          label="Nama Lengkap"
          value={form.name}
          onChange={update("name")}
          placeholder="Mis. Andika Pratama"
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Email"
            value={form.email}
            onChange={update("email")}
            type="email"
            placeholder="agent@taco.id"
          />
          <FormField
            label="Telepon"
            value={form.phone}
            onChange={update("phone")}
            placeholder="+62 812-…"
          />
        </div>

        {/* MULTI-REGION PICKER */}
        <div>
          <label className="block text-[13px] font-medium text-taco-text mb-1">
            Wilayah ASM yang dicakup
          </label>
          <div className="text-[12px] text-taco-muted mb-2">
            Pilih satu atau lebih wilayah. Tandai satu sebagai wilayah utama (default upload di PWA).
          </div>

          {/* Selected chips */}
          {selectedRegions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 p-2 bg-taco-page border border-taco-divider rounded-lg">
              {selectedRegions.map((r) => {
                const isPrimary = r.id === form.primary_region_id;
                return (
                  <span
                    key={r.id}
                    className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full border text-[12px] ${
                      isPrimary
                        ? "bg-white border-taco-text text-taco-text"
                        : "bg-white border-taco-border text-taco-sub"
                    }`}
                  >
                    {isPrimary && <span className="text-taco-text" aria-label="Wilayah utama">★</span>}
                    <span className="truncate max-w-[180px]">{r.display_path}</span>
                    <button
                      type="button"
                      aria-label={`Hapus ${r.display_path}`}
                      onClick={() => removeChip(r.id)}
                      className="w-4 h-4 inline-flex items-center justify-center rounded-full text-taco-muted hover:text-taco-text hover:bg-taco-border/60"
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Search + checkbox list */}
          <div className="border border-taco-border rounded-lg">
            <div className="relative border-b border-taco-divider">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted">
                <SearchIcon size={14} />
              </span>
              <input
                type="text"
                value={regionSearch}
                onChange={(e) => setRegionSearch(e.target.value)}
                placeholder="Cari wilayah…"
                className="w-full h-[40px] pl-9 pr-3 text-[13px] text-taco-text bg-white outline-none rounded-t-lg"
              />
            </div>
            <div className="max-h-[200px] overflow-y-auto divide-y divide-taco-divider">
              {filteredRegions.length === 0 ? (
                <div className="px-3 py-3 text-[12px] text-taco-muted">Tidak ada wilayah cocok.</div>
              ) : (
                filteredRegions.map((r) => {
                  const checked = form.region_ids.includes(r.id);
                  const isPrimary = r.id === form.primary_region_id;
                  return (
                    <div
                      key={r.id}
                      className={`px-3 py-2 flex items-center gap-3 ${checked ? "bg-taco-page" : ""}`}
                    >
                      <label className="flex items-center gap-2 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRegion(r.id)}
                          className="w-[16px] h-[16px] accent-taco-text cursor-pointer"
                        />
                        <span className="text-[13px] text-taco-text">{r.display_path}</span>
                      </label>
                      {checked && (
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] text-taco-sub">
                          <input
                            type="radio"
                            name={`primary-${r.id}`}
                            checked={isPrimary}
                            onChange={() => setPrimary(r.id)}
                            className="w-[14px] h-[14px] accent-taco-text cursor-pointer"
                          />
                          {isPrimary ? <span className="text-taco-text font-medium">Utama</span> : <span>Jadikan utama</span>}
                        </label>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          {form.region_ids.length === 0 && (
            <div className="text-[12px] text-taco-error mt-1.5">
              Pilih minimal satu wilayah.
            </div>
          )}
        </div>

        {!isEdit && (
          <FormField
            label="Password Sementara"
            value={form.password}
            onChange={update("password")}
            type="password"
            placeholder="Minimal 6 karakter"
            hint="Agent dapat mengubah password setelah login pertama."
          />
        )}

        {isEdit && (
          <div className="border border-taco-divider rounded-lg p-3 bg-taco-page">
            <div className="text-[13px] font-medium text-taco-text mb-1">
              Reset Password
            </div>
            <div className="text-[12px] text-taco-sub mb-2">
              Kirim password sementara baru ke agent. Password lama akan langsung tidak berlaku.
            </div>
            <button
              onClick={handleResetPassword}
              disabled={resetPwBusy}
              className="h-[36px] px-3 border border-taco-text rounded-md text-[13px] font-medium text-taco-text hover:bg-taco-text hover:text-white transition-colors disabled:opacity-60"
              type="button"
            >
              {resetPwBusy ? "Memproses…" : "Reset Password Sekarang"}
            </button>
            {resetPwOk && (
              <div className="mt-2 text-[12px] text-taco-success">
                Password baru: <code className="font-mono">{resetPwOk}</code>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
