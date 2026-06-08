"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getRegionAreas, type RegionArea } from "@/lib/api";
import {
  Badge,
  CrudShell,
  EmptyRow,
  RowActions,
  TableHeader,
} from "../../admin/_components/CrudShell";
import { Modal, FormField, FormSelect } from "../../admin/_components/Modal";
import {
  MOCK_REGION_AREAS,
  formatDateTime,
} from "../../admin/taro-invoices/_components/mockData";

interface TaroSalesAgent {
  id: string;
  name: string;
  email: string;
  phone: string;
  region_id: string | null;
  region_display: string | null;
  invoice_count: number;
  last_upload_at: string | null;
  active: boolean;
  avatar_url?: string | null;
}

interface AgentFormState {
  name: string;
  email: string;
  phone: string;
  region_id: string;
  password: string;
}

const EMPTY_FORM: AgentFormState = {
  name: "",
  email: "",
  phone: "",
  region_id: "",
  password: "",
};

/** Mock seed used when /api/taro-sales-agents 404s. */
const MOCK_AGENTS: TaroSalesAgent[] = [
  { id: "ag-1", name: "Andika Pratama", email: "andika@taco.id", phone: "+62 812-3456-7891", region_id: "area-w-jkt-s", region_display: "W - BU2 - ASM Jakarta Selatan", invoice_count: 42, last_upload_at: "2026-06-08T08:14:00Z", active: true },
  { id: "ag-2", name: "Sri Wahyuni", email: "sri@taco.id", phone: "+62 813-2222-1010", region_id: "area-c-bdg", region_display: "C - BU1 - ASM Bandung", invoice_count: 38, last_upload_at: "2026-06-08T07:42:00Z", active: true },
  { id: "ag-3", name: "Budi Santoso", email: "budi@taco.id", phone: "+62 811-9090-2222", region_id: "area-e-sby", region_display: "E - BU1 - ASM Surabaya", invoice_count: 34, last_upload_at: "2026-06-07T16:20:00Z", active: true },
  { id: "ag-4", name: "Lestari Putri", email: "lestari@taco.id", phone: "+62 821-8181-3333", region_id: "area-c-smg", region_display: "C - BU1 - ASM Semarang", invoice_count: 29, last_upload_at: "2026-06-07T11:05:00Z", active: true },
  { id: "ag-5", name: "Rizky Hidayat", email: "rizky@taco.id", phone: "+62 877-5454-6767", region_id: "area-n-mdn", region_display: "N - BU1 - ASM Medan", invoice_count: 27, last_upload_at: "2026-06-07T09:30:00Z", active: true },
  { id: "ag-6", name: "Maya Anggraini", email: "maya@taco.id", phone: "+62 856-3030-1111", region_id: "area-w-jkt-b", region_display: "W - BU2 - ASM Jakarta Barat", invoice_count: 24, last_upload_at: "2026-06-06T15:48:00Z", active: true },
  { id: "ag-7", name: "Dimas Saputra", email: "dimas@taco.id", phone: "+62 851-4040-2020", region_id: "area-e-mlg", region_display: "E - BU1 - ASM Malang", invoice_count: 21, last_upload_at: "2026-06-06T10:11:00Z", active: false },
  { id: "ag-8", name: "Fitri Ramadhani", email: "fitri@taco.id", phone: "+62 822-1010-9090", region_id: "area-s-plg", region_display: "S - BU1 - ASM Palembang", invoice_count: 18, last_upload_at: "2026-06-05T14:00:00Z", active: true },
];

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
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [modal, setModal] = useState<{ open: boolean; row?: TaroSalesAgent }>({
    open: false,
  });

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
    const params = new URLSearchParams();
    if (regionFilter !== "all") params.set("region_id", regionFilter);
    if (activeFilter !== "all") params.set("active", activeFilter === "active" ? "true" : "false");
    if (search.trim()) params.set("search", search.trim());
    try {
      const r = await fetch(
        `/api/taro-sales-agents${params.toString() ? `?${params.toString()}` : ""}`
      );
      if (r.ok) {
        const j = await r.json();
        const data = (j?.data ?? j) as TaroSalesAgent[];
        if (Array.isArray(data) && data.length) {
          setAgents(data);
          return;
        }
      }
    } catch {
      /* fall through */
    }
    setAgents(MOCK_AGENTS);
  }, [search, regionFilter, activeFilter]);

  useEffect(() => {
    const t = setTimeout(refetch, 200);
    return () => clearTimeout(t);
  }, [refetch]);

  // Client-side enforcement of search + filters.
  const filtered = useMemo(() => {
    return agents.filter((a) => {
      if (regionFilter !== "all" && a.region_id !== regionFilter) return false;
      if (activeFilter === "active" && !a.active) return false;
      if (activeFilter === "inactive" && a.active) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = [a.name, a.email, a.phone, a.region_display ?? ""]
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
      region_id: form.region_id || null,
      ...(form.password ? { password: form.password } : {}),
    };
    const isEdit = !!modal.row?.id;
    try {
      const r = await fetch(
        isEdit
          ? `/api/taro-sales-agents/${modal.row!.id}`
          : "/api/taro-sales-agents",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!r.ok) throw new Error("be-not-ready");
      await refetch();
    } catch {
      // Optimistic local update so the demo never blocks.
      const regionDisplay =
        regions.find((g) => g.id === form.region_id)?.display_path ?? null;
      if (isEdit) {
        setAgents((prev) =>
          prev.map((a) =>
            a.id === modal.row!.id
              ? { ...a, ...payload, region_display: regionDisplay }
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
            region_id: payload.region_id,
            region_display: regionDisplay,
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
      const r = await fetch(`/api/taro-sales-agents/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("be-not-ready");
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
        description={`${agents.length} agent · upload invoice dari PWA`}
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
            className={`h-[32px] px-2.5 text-[13px] border rounded-lg bg-white outline-none max-w-[240px] ${
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
                  <td className="px-4 py-3 text-[13px] text-taco-text max-w-[240px]">
                    <div className="truncate">
                      {a.region_display ?? (
                        <span className="italic text-taco-muted">Tanpa Region</span>
                      )}
                    </div>
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
          region_id: initial.region_id ?? "",
          password: "",
        }
      : EMPTY_FORM
  );
  const [resetPwBusy, setResetPwBusy] = useState(false);
  const [resetPwOk, setResetPwOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (k: keyof AgentFormState) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const canSave =
    form.name.trim().length > 1 &&
    form.email.trim().includes("@") &&
    (isEdit || form.password.length >= 6);

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
      const r = await fetch(`/api/taro-sales-agents/${initial.id}/reset-password`, {
        method: "POST",
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        setResetPwOk(
          (j?.temporary_password as string) ?? "Password baru sudah dikirim."
        );
      } else {
        throw new Error("be-not-ready");
      }
    } catch {
      // Demo: generate a temp password locally so the flow is testable.
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
        <FormSelect
          label="Wilayah ASM"
          value={form.region_id}
          onChange={update("region_id")}
          options={regions.map((r) => ({ value: r.id, label: r.display_path }))}
          hint="Invoice yang diupload akan terikat ke wilayah ini."
        />

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
