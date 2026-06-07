"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Store,
  Package,
  ShoppingBag,
  Tag,
  HelpCircle,
  Image,
  Target,
  FileText,
  Pencil,
  Trash2,
  X,
  Search,
  Upload,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getStores,
  createStore,
  updateStore,
  deleteStore,
  getTacoSkus,
  createTacoSku,
  updateTacoSku,
  deleteTacoSku,
  getCompetitorSkus,
  deleteCompetitorSku,
  getCompetitorBrands,
  createCompetitorBrand,
  deleteCompetitorBrand,
  getBurningQuestions,
  createBurningQuestion,
  updateBurningQuestion,
  deleteBurningQuestion,
  getPosm,
  createPosm,
  deletePosm,
  getVisitObjectives,
  createVisitObjective,
  deleteVisitObjective,
  getVisitContexts,
  createVisitContext,
  deleteVisitContext,
  getTerritories,
} from "@/lib/api";
import { DashboardLayout } from "@/components/DashboardLayout";
import { cn } from "@/lib/utils";

type AdminSection =
  | "staff"
  | "stores"
  | "taco-skus"
  | "competitor-skus"
  | "competitor-brands"
  | "burning-questions"
  | "posm"
  | "objectives"
  | "contexts";

const NAV_ITEMS: { key: AdminSection; label: string; icon: React.ElementType }[] = [
  { key: "staff", label: "Sales Staff", icon: Users },
  { key: "stores", label: "Toko", icon: Store },
  { key: "taco-skus", label: "TACO SKU", icon: Package },
  { key: "competitor-skus", label: "SKU Kompetitor", icon: ShoppingBag },
  { key: "competitor-brands", label: "Brand Kompetitor", icon: Tag },
  { key: "burning-questions", label: "Burning Questions", icon: HelpCircle },
  { key: "posm", label: "POSM Aset", icon: Image },
  { key: "objectives", label: "Tujuan Kunjungan", icon: Target },
  { key: "contexts", label: "Konteks Kunjungan", icon: FileText },
];

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [activeSection, setActiveSection] = useState<AdminSection>("staff");

  useEffect(() => {
    if (!user || user.role !== "admin") {
      router.replace("/auth/login");
    }
  }, [user, router]);

  return (
    <DashboardLayout>
      <div className="flex h-full">
        {/* Admin sidebar */}
        <div className="w-[200px] bg-white border-r border-taco-border flex-shrink-0 py-3">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={cn(
                "w-full flex items-center gap-2.5 px-4 h-[44px] text-[13px] font-medium transition-colors border-l-[3px] text-left",
                activeSection === key
                  ? "border-l-taco-accent bg-taco-accent-tint text-taco-text font-semibold"
                  : "border-l-transparent text-taco-sub hover:text-taco-text hover:bg-taco-page"
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <SectionContent section={activeSection} />
        </div>
      </div>
    </DashboardLayout>
  );
}

function SectionContent({ section }: { section: AdminSection }) {
  switch (section) {
    case "staff": return <StaffSection />;
    case "stores": return <StoresSection />;
    case "taco-skus": return <TacoSkuSection />;
    case "competitor-skus": return <CompetitorSkuSection />;
    case "competitor-brands": return <CompetitorBrandsSection />;
    case "burning-questions": return <BurningQuestionsSection />;
    case "posm": return <PosmSection />;
    case "objectives": return <ObjectivesSection />;
    case "contexts": return <ContextsSection />;
    default: return null;
  }
}

// ---- STAFF ----
function StaffSection() {
  const [staff, setStaff] = useState<Record<string, unknown>[]>([]);
  const [territories, setTerritories] = useState<{ id: string; name: string }[]>([]);
  const [modal, setModal] = useState<{ open: boolean; item?: Record<string, unknown> }>({ open: false });
  const [form, setForm] = useState<Record<string, string>>({});

  const fetch = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([getUsers({ role: "rep" }), getTerritories()]);
      setStaff(sRes.data?.data ?? sRes.data ?? []);
      setTerritories(tRes.data ?? []);
    } catch { setStaff(MOCK_STAFF); }
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  const openNew = () => { setForm({}); setModal({ open: true }); };
  const openEdit = (item: Record<string, unknown>) => { setForm(item as Record<string, string>); setModal({ open: true, item }); };

  const save = async () => {
    try {
      if (modal.item) await updateUser(modal.item.id as string, form);
      else await createUser({ ...form, role: "rep" });
      setModal({ open: false });
      fetch();
    } catch { /* mock */ setModal({ open: false }); }
  };

  const remove = async (id: string) => {
    try { await deleteUser(id); fetch(); } catch { setStaff((prev) => prev.filter((s) => s.id !== id)); }
  };

  return (
    <CrudSection
      title="Sales Staff"
      description="Kelola rep lapangan dan penugasan wilayah"
      onAdd={openNew}
      addLabel="+ Tambah Rep"
    >
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-taco-divider">
            {["Nama", "Telepon", "Wilayah", "Status", "Aksi"].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-[12px] font-semibold text-taco-sub uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id as string} className="border-b border-taco-divider last:border-0 hover:bg-taco-page">
              <td className="px-4 py-3.5 font-medium text-taco-text">{s.name as string}</td>
              <td className="px-4 py-3.5 text-taco-sub">{(s.phone as string) ?? "—"}</td>
              <td className="px-4 py-3.5 text-taco-sub">{(s.territory_name as string) ?? "—"}</td>
              <td className="px-4 py-3.5">
                <span className={cn("text-[12px] px-2 py-0.5 rounded-full font-medium", s.active !== false ? "bg-emerald-50 text-taco-success" : "bg-red-50 text-taco-error")}>
                  {s.active !== false ? "Aktif" : "Nonaktif"}
                </span>
              </td>
              <td className="px-4 py-3.5">
                <div className="flex gap-2">
                  <button onClick={() => openEdit(s)} className="p-1.5 text-taco-muted hover:text-taco-text"><Pencil size={14} /></button>
                  <button onClick={() => remove(s.id as string)} className="p-1.5 text-taco-muted hover:text-taco-error"><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal.open && (
        <Modal title={modal.item ? "Edit Rep" : "Tambah Rep"} onClose={() => setModal({ open: false })} onSave={save}>
          <FormField label="Nama" value={form.name ?? ""} onChange={(v) => setForm({ ...form, name: v })} />
          <FormField label="Email" value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} type="email" />
          <FormField label="Telepon" value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} />
          <div>
            <label className="block text-[13px] text-taco-sub mb-1">Wilayah</label>
            <select value={form.territory_id ?? ""} onChange={(e) => setForm({ ...form, territory_id: e.target.value })} className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[14px] text-taco-text bg-white outline-none">
              <option value="">Pilih wilayah…</option>
              {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </Modal>
      )}
    </CrudSection>
  );
}

const MOCK_STAFF = [
  { id: "1", name: "Budi Santoso", phone: "08123456789", territory_name: "Tangerang Selatan", active: true },
  { id: "2", name: "Sari Dewi", phone: "08234567890", territory_name: "Bekasi", active: true },
];

// ---- STORES ----
function StoresSection() {
  const [stores, setStores] = useState<Record<string, unknown>[]>([]);
  const [modal, setModal] = useState<{ open: boolean; item?: Record<string, unknown> }>({ open: false });
  const [form, setForm] = useState<Record<string, string>>({});

  const fetch = useCallback(async () => {
    try {
      const res = await getStores();
      setStores(res.data?.data ?? res.data ?? []);
    } catch { setStores(MOCK_STORES); }
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  const save = async () => {
    try {
      if (modal.item) await updateStore(modal.item.id as string, form);
      else await createStore(form);
      setModal({ open: false }); fetch();
    } catch { setModal({ open: false }); }
  };

  const remove = async (id: string) => {
    try { await deleteStore(id); fetch(); } catch { setStores((prev) => prev.filter((s) => s.id !== id)); }
  };

  return (
    <CrudSection title="Toko" description="Kelola daftar toko dan penugasan rep" onAdd={() => { setForm({}); setModal({ open: true }); }} addLabel="+ Tambah Toko">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-taco-divider">
            {["Kode", "Nama", "Tipe", "Wilayah", "Rep", "Status", "Aksi"].map((h) => (
              <th key={h} className="text-left px-3 py-3 text-[12px] font-semibold text-taco-sub uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.id as string} className="border-b border-taco-divider last:border-0 hover:bg-taco-page">
              <td className="px-3 py-3.5 text-taco-muted font-mono text-[13px]">{(s.code as string) ?? "—"}</td>
              <td className="px-3 py-3.5 font-medium text-taco-text">{s.name as string}</td>
              <td className="px-3 py-3.5">
                <span className="text-[12px] bg-taco-page border border-taco-border px-2 py-0.5 rounded-full text-taco-sub">
                  {(s.type_name as string) ?? "Toko"}
                </span>
              </td>
              <td className="px-3 py-3.5 text-taco-sub">{(s.territory_name as string) ?? "—"}</td>
              <td className="px-3 py-3.5 text-taco-sub">
                {s.assigned_rep_name ? <span>{s.assigned_rep_name as string}</span> : <span className="text-taco-warning text-[12px] font-medium">Perlu Assign</span>}
              </td>
              <td className="px-3 py-3.5">
                <span className={cn("text-[12px] px-2 py-0.5 rounded-full font-medium", s.active !== false ? "bg-emerald-50 text-taco-success" : "bg-red-50 text-taco-error")}>
                  {s.active !== false ? "Aktif" : "Nonaktif"}
                </span>
              </td>
              <td className="px-3 py-3.5">
                <div className="flex gap-2">
                  <button onClick={() => { setForm(s as Record<string, string>); setModal({ open: true, item: s }); }} className="p-1.5 text-taco-muted hover:text-taco-text"><Pencil size={14} /></button>
                  <button onClick={() => remove(s.id as string)} className="p-1.5 text-taco-muted hover:text-taco-error"><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal.open && (
        <Modal title={modal.item ? "Edit Toko" : "Tambah Toko"} onClose={() => setModal({ open: false })} onSave={save}>
          <FormField label="Kode Toko" value={form.code ?? ""} onChange={(v) => setForm({ ...form, code: v })} />
          <FormField label="Nama Toko" value={form.name ?? ""} onChange={(v) => setForm({ ...form, name: v })} />
          <FormField label="Alamat" value={form.address ?? ""} onChange={(v) => setForm({ ...form, address: v })} />
        </Modal>
      )}
    </CrudSection>
  );
}

const MOCK_STORES = [
  { id: "1", code: "TBS-001", name: "Toko Bangunan Maju Jaya", type_name: "Toko", territory_name: "Tangerang Selatan", assigned_rep_name: "Budi Santoso", active: true },
  { id: "2", code: "TBS-002", name: "UD Bahan Bangunan Sejahtera", type_name: "Distributor", territory_name: "Bekasi", assigned_rep_name: null, active: true },
];

// ---- TACO SKUs ----
function TacoSkuSection() {
  const [skus, setSkus] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; item?: Record<string, unknown> }>({ open: false });
  const [form, setForm] = useState<Record<string, string>>({});

  const fetch = useCallback(async () => {
    try {
      const res = await getTacoSkus(search ? { search } : {});
      setSkus(res.data?.data ?? res.data ?? []);
    } catch { setSkus(MOCK_TACO_SKUS); }
  }, [search]);
  useEffect(() => { const t = setTimeout(fetch, 300); return () => clearTimeout(t); }, [search, fetch]);

  const save = async () => {
    try {
      if (modal.item) await updateTacoSku(modal.item.id as string, form);
      else await createTacoSku(form);
      setModal({ open: false }); fetch();
    } catch { setModal({ open: false }); }
  };

  return (
    <CrudSection
      title="TACO SKU"
      description="Katalog produk TACO — drives OCR matching"
      onAdd={() => { setForm({}); setModal({ open: true }); }}
      addLabel="+ Tambah SKU"
      extraActions={
        <button className="flex items-center gap-2 h-[36px] px-3 border border-taco-border rounded-lg text-[13px] text-taco-sub hover:text-taco-text bg-white">
          <Upload size={13} />
          Import CSV
        </button>
      }
      searchValue={search}
      onSearch={setSearch}
    >
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-taco-divider">
            {["Kode", "Nama", "Kategori", "Harga Standar", "Aksi"].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-[12px] font-semibold text-taco-sub uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {skus.map((s) => (
            <tr key={s.id as string} className="border-b border-taco-divider last:border-0 hover:bg-taco-page">
              <td className="px-4 py-3.5 font-mono text-[13px] text-taco-muted">{s.code as string}</td>
              <td className="px-4 py-3.5 font-medium text-taco-text">{s.name as string}</td>
              <td className="px-4 py-3.5 text-taco-sub">{(s.category as string) ?? "—"}</td>
              <td className="px-4 py-3.5 text-taco-text">{s.standard_price ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(s.standard_price as number) : "—"}</td>
              <td className="px-4 py-3.5">
                <div className="flex gap-2">
                  <button onClick={() => { setForm(s as Record<string, string>); setModal({ open: true, item: s }); }} className="p-1.5 text-taco-muted hover:text-taco-text"><Pencil size={14} /></button>
                  <button onClick={async () => { try { await deleteTacoSku(s.id as string); fetch(); } catch { setSkus((prev) => prev.filter((x) => x.id !== s.id)); } }} className="p-1.5 text-taco-muted hover:text-taco-error"><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal.open && (
        <Modal title={modal.item ? "Edit SKU" : "Tambah TACO SKU"} onClose={() => setModal({ open: false })} onSave={save}>
          <FormField label="Kode SKU" value={form.code ?? ""} onChange={(v) => setForm({ ...form, code: v })} />
          <FormField label="Nama" value={form.name ?? ""} onChange={(v) => setForm({ ...form, name: v })} />
          <FormField label="Kategori" value={form.category ?? ""} onChange={(v) => setForm({ ...form, category: v })} />
          <FormField label="Harga Standar" value={form.standard_price ?? ""} onChange={(v) => setForm({ ...form, standard_price: v })} type="number" />
        </Modal>
      )}
    </CrudSection>
  );
}

const MOCK_TACO_SKUS = [
  { id: "1", code: "TL-LAM-8M", name: "TACO Laminate Classic 8mm", category: "Laminate", standard_price: 88000 },
  { id: "2", code: "TL-VIN-C", name: "TACO Vinyl Classic", category: "Vinyl", standard_price: 95000 },
  { id: "3", code: "TL-HPL-M", name: "TACO HPL Matte", category: "HPL", standard_price: 120000 },
];

// ---- COMPETITOR SKUs ----
function CompetitorSkuSection() {
  const [skus, setSkus] = useState<Record<string, unknown>[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "review">("all");

  const fetch = useCallback(async () => {
    try {
      const params: Record<string, string> = activeTab === "review" ? { flagged: "true" } : {};
      const res = await getCompetitorSkus(params);
      setSkus(res.data?.data ?? res.data ?? []);
    } catch { setSkus(MOCK_COMP_SKUS); }
  }, [activeTab]);
  useEffect(() => { fetch(); }, [activeTab, fetch]);

  return (
    <CrudSection title="SKU Kompetitor" description="Peta SKU kompetitor — diisi otomatis dari OCR" onAdd={() => {}} addLabel="+ Tambah Manual">
      <div className="flex gap-2 mb-4">
        {(["all", "review"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={cn("h-[36px] px-4 rounded-lg text-[13px] font-medium transition-colors", activeTab === t ? "bg-taco-text text-white" : "bg-taco-page border border-taco-border text-taco-sub hover:text-taco-text")}
          >
            {t === "all" ? "Semua" : "Perlu Review"}
          </button>
        ))}
      </div>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-taco-divider">
            {["Nama Raw", "Canonical", "Brand", "TACO Equivalent", "Status", "Aksi"].map((h) => (
              <th key={h} className="text-left px-3 py-3 text-[12px] font-semibold text-taco-sub uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {skus.map((s) => (
            <tr key={s.id as string} className="border-b border-taco-divider last:border-0 hover:bg-taco-page">
              <td className="px-3 py-3.5 text-taco-text font-medium">{s.raw_name as string}</td>
              <td className="px-3 py-3.5 text-taco-sub">{(s.canonical_name as string) ?? "—"}</td>
              <td className="px-3 py-3.5 text-taco-sub">{(s.competitor_brand as string) ?? "—"}</td>
              <td className="px-3 py-3.5 text-taco-sub">{(s.mapped_sku_name as string) ?? "—"}</td>
              <td className="px-3 py-3.5">
                <span className={cn("text-[12px] px-2 py-0.5 rounded-full font-medium", s.flagged_for_review ? "bg-amber-50 text-taco-warning" : "bg-emerald-50 text-taco-success")}>
                  {s.flagged_for_review ? "Perlu Review" : "Konfirmasi"}
                </span>
              </td>
              <td className="px-3 py-3.5">
                <button onClick={async () => { try { await deleteCompetitorSku(s.id as string); fetch(); } catch { setSkus((prev) => prev.filter((x) => x.id !== s.id)); } }} className="p-1.5 text-taco-muted hover:text-taco-error"><Trash2 size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </CrudSection>
  );
}

const MOCK_COMP_SKUS = [
  { id: "1", raw_name: "Krono Original 8mm AC4", canonical_name: "Krono Original 8mm", competitor_brand: "Krono", mapped_sku_name: "TACO Laminate Classic 8mm", flagged_for_review: false },
  { id: "2", raw_name: "Pergo Sensation Oak", canonical_name: "Pergo Sensation Oak", competitor_brand: "Pergo", mapped_sku_name: "TACO Premium Oak", flagged_for_review: false },
  { id: "3", raw_name: "Unk-brand-xyz-laminate", canonical_name: null, competitor_brand: null, mapped_sku_name: null, flagged_for_review: true },
];

// ---- COMPETITOR BRANDS ----
function CompetitorBrandsSection() {
  const [brands, setBrands] = useState<Record<string, unknown>[]>([]);

  const fetch = useCallback(async () => {
    try { const res = await getCompetitorBrands(); setBrands(res.data ?? []); } catch {
      setBrands([{ id: "1", name: "Krono", origin: "Germany" }, { id: "2", name: "Pergo", origin: "Belgium" }, { id: "3", name: "Egger", origin: "Austria" }]);
    }
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  return (
    <SimpleListSection
      title="Brand Kompetitor"
      description="Daftar brand kompetitor yang dikenali sistem"
      items={brands}
      fields={["name", "origin"]}
      labels={["Nama Brand", "Negara Asal"]}
      onAdd={async (f) => { try { await createCompetitorBrand(f); fetch(); } catch { setBrands((prev) => [...prev, { id: Date.now().toString(), ...f }]); } }}
      onDelete={async (id) => { try { await deleteCompetitorBrand(id); fetch(); } catch { setBrands((prev) => prev.filter((b) => b.id !== id)); } }}
    />
  );
}

// ---- BURNING QUESTIONS ----
function BurningQuestionsSection() {
  const [questions, setQuestions] = useState<Record<string, unknown>[]>([]);
  const [modal, setModal] = useState<{ open: boolean; item?: Record<string, unknown> }>({ open: false });
  const [form, setForm] = useState<Record<string, string>>({});

  const fetch = useCallback(async () => {
    try { const res = await getBurningQuestions(); setQuestions(res.data ?? []); } catch {
      setQuestions(MOCK_BQ);
    }
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  const save = async () => {
    try {
      if (modal.item) await updateBurningQuestion(modal.item.id as string, form);
      else await createBurningQuestion(form);
      setModal({ open: false }); fetch();
    } catch { setModal({ open: false }); }
  };

  return (
    <CrudSection title="Burning Questions" description="Pertanyaan wajib yang muncul di S3 kunjungan" onAdd={() => { setForm({}); setModal({ open: true }); }} addLabel="+ Tambah Pertanyaan">
      <div className="space-y-2">
        {questions.map((q) => (
          <div key={q.id as string} className="flex items-start gap-3 bg-white border border-taco-border rounded-xl p-4">
            <div className="flex-1">
              <div className="text-[15px] text-taco-text">{q.text as string}</div>
              <div className="text-[12px] text-taco-sub mt-1">
                Lingkup: {(q.scope_type as string) === "company" ? "Seluruh perusahaan" : (q.scope_type as string) === "region" ? "Per wilayah" : "Per toko"}
                {" · "}
                <span className={cn("font-medium", q.active ? "text-taco-success" : "text-taco-muted")}>
                  {q.active ? "Aktif" : "Nonaktif"}
                </span>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => { setForm(q as Record<string, string>); setModal({ open: true, item: q }); }} className="p-1.5 text-taco-muted hover:text-taco-text"><Pencil size={14} /></button>
              <button onClick={async () => { try { await deleteBurningQuestion(q.id as string); fetch(); } catch { setQuestions((prev) => prev.filter((x) => x.id !== q.id)); } }} className="p-1.5 text-taco-muted hover:text-taco-error"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {modal.open && (
        <Modal title={modal.item ? "Edit Pertanyaan" : "Tambah Burning Question"} onClose={() => setModal({ open: false })} onSave={save}>
          <div>
            <label className="block text-[13px] text-taco-sub mb-1">Teks Pertanyaan</label>
            <textarea
              value={form.text ?? ""}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              rows={3}
              className="w-full border border-taco-border rounded-lg p-3 text-[14px] text-taco-text outline-none resize-none"
            />
          </div>
          <div>
            <label className="block text-[13px] text-taco-sub mb-1">Lingkup</label>
            <select value={form.scope_type ?? "company"} onChange={(e) => setForm({ ...form, scope_type: e.target.value })} className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[14px] text-taco-text bg-white outline-none">
              <option value="company">Seluruh perusahaan</option>
              <option value="region">Per wilayah</option>
              <option value="store">Per toko</option>
            </select>
          </div>
        </Modal>
      )}
    </CrudSection>
  );
}

const MOCK_BQ = [
  { id: "1", text: "Apakah ada perubahan distributor utama di toko ini dalam 30 hari terakhir?", scope_type: "company", active: true },
  { id: "2", text: "Produk TACO apa yang paling sering ditanyakan customer bulan ini?", scope_type: "company", active: true },
  { id: "3", text: "Apakah ada produk kompetitor baru yang masuk ke toko dalam 2 minggu terakhir?", scope_type: "region", active: true },
];

// ---- POSM ----
function PosmSection() {
  const [posms, setPosms] = useState<Record<string, unknown>[]>([]);
  const fetch = useCallback(async () => {
    try { const res = await getPosm(); setPosms(res.data ?? []); } catch {
      setPosms([{ id: "1", name: "Standing Banner" }, { id: "2", name: "Shelf Strip" }, { id: "3", name: "Price Tag" }]);
    }
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  return (
    <SimpleListSection
      title="POSM Aset"
      description="Aset POSM yang wajib difoto di S7 kunjungan"
      items={posms}
      fields={["name", "description"]}
      labels={["Nama Aset", "Deskripsi"]}
      onAdd={async (f) => { try { await createPosm(f); fetch(); } catch { setPosms((prev) => [...prev, { id: Date.now().toString(), ...f }]); } }}
      onDelete={async (id) => { try { await deletePosm(id); fetch(); } catch { setPosms((prev) => prev.filter((p) => p.id !== id)); } }}
    />
  );
}

// ---- OBJECTIVES ----
function ObjectivesSection() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const fetch = useCallback(async () => {
    try { const res = await getVisitObjectives(); setItems(res.data ?? []); } catch {
      setItems([{ id: "1", name: "Kunjungan Rutin" }, { id: "2", name: "Follow-up Stok" }, { id: "3", name: "Pengenalan Produk Baru" }]);
    }
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  return (
    <SimpleListSection
      title="Tujuan Kunjungan"
      description="Pilihan tujuan kunjungan di S1"
      items={items}
      fields={["name"]}
      labels={["Nama Tujuan"]}
      onAdd={async (f) => { try { await createVisitObjective(f); fetch(); } catch { setItems((prev) => [...prev, { id: Date.now().toString(), ...f }]); } }}
      onDelete={async (id) => { try { await deleteVisitObjective(id); fetch(); } catch { setItems((prev) => prev.filter((x) => x.id !== id)); } }}
    />
  );
}

// ---- CONTEXTS ----
function ContextsSection() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const fetch = useCallback(async () => {
    try { const res = await getVisitContexts(); setItems(res.data ?? []); } catch {
      setItems([{ id: "1", name: "Distributor Langsung" }, { id: "2", name: "Sub-distributor" }, { id: "3", name: "Modern Trade" }, { id: "4", name: "Traditional Trade" }]);
    }
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  return (
    <SimpleListSection
      title="Konteks Kunjungan"
      description="Pilihan konteks kunjungan di S1"
      items={items}
      fields={["name"]}
      labels={["Nama Konteks"]}
      onAdd={async (f) => { try { await createVisitContext(f); fetch(); } catch { setItems((prev) => [...prev, { id: Date.now().toString(), ...f }]); } }}
      onDelete={async (id) => { try { await deleteVisitContext(id); fetch(); } catch { setItems((prev) => prev.filter((x) => x.id !== id)); } }}
    />
  );
}

// ---- Reusable UI components ----

function CrudSection({
  title,
  description,
  onAdd,
  addLabel,
  extraActions,
  searchValue,
  onSearch,
  children,
}: {
  title: string;
  description?: string;
  onAdd: () => void;
  addLabel: string;
  extraActions?: React.ReactNode;
  searchValue?: string;
  onSearch?: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[20px] font-bold text-taco-text">{title}</h2>
          {description && <p className="text-[13px] text-taco-sub mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {onSearch && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted" />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Cari…"
                className="h-[36px] pl-9 pr-4 border border-taco-border rounded-lg text-[13px] text-taco-text bg-white outline-none w-[180px]"
              />
            </div>
          )}
          {extraActions}
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 h-[36px] px-4 bg-taco-accent text-white rounded-lg text-[13px] font-medium hover:bg-taco-accent-dark transition-colors"
          >
            {addLabel}
          </button>
        </div>
      </div>
      <div className="bg-white border border-taco-border rounded-xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function SimpleListSection({
  title,
  description,
  items,
  fields,
  labels,
  onAdd,
  onDelete,
}: {
  title: string;
  description?: string;
  items: Record<string, unknown>[];
  fields: string[];
  labels: string[];
  onAdd: (form: Record<string, string>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const save = async () => {
    await onAdd(form);
    setModal(false);
    setForm({});
  };

  return (
    <CrudSection title={title} description={description} onAdd={() => setModal(true)} addLabel={`+ Tambah`}>
      <div className="divide-y divide-taco-divider">
        {items.map((item) => (
          <div key={item.id as string} className="flex items-center px-5 py-3.5 min-h-[52px]">
            <div className="flex-1 flex items-center gap-6">
              {fields.map((f) => (
                <span key={f} className={f === fields[0] ? "font-medium text-taco-text text-[15px]" : "text-[14px] text-taco-sub"}>
                  {(item[f] as string) ?? "—"}
                </span>
              ))}
            </div>
            <button onClick={() => onDelete(item.id as string)} className="p-1.5 text-taco-muted hover:text-taco-error">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={`Tambah ${title}`} onClose={() => setModal(false)} onSave={save}>
          {fields.map((f, i) => (
            <FormField key={f} label={labels[i]} value={form[f] ?? ""} onChange={(v) => setForm({ ...form, [f]: v })} />
          ))}
        </Modal>
      )}
    </CrudSection>
  );
}

function Modal({
  title,
  onClose,
  onSave,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-[480px] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-taco-divider">
          <div className="text-[17px] font-semibold text-taco-text">{title}</div>
          <button onClick={onClose} className="p-1 text-taco-muted hover:text-taco-text"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 h-[44px] border border-taco-border rounded-lg text-[14px] font-medium text-taco-sub hover:text-taco-text">
            Batal
          </button>
          <button onClick={onSave} className="flex-1 h-[44px] bg-taco-accent text-white rounded-lg text-[14px] font-semibold hover:bg-taco-accent-dark transition-colors">
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[13px] text-taco-sub mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-[44px] border border-taco-border rounded-lg px-3 text-[14px] text-taco-text bg-white outline-none focus:border-taco-accent"
      />
    </div>
  );
}
