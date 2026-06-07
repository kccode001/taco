"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { getVisit, getBurningQuestionsForStore } from "@/lib/api";
import {
  BurningQuestionBanner,
  DeltaInlineTag,
  GroupCard,
  type GroupStatus,
} from "@/components/mobile";

type GroupKey = "info" | "data_taco" | "kompetitor" | "sinyal";

interface GroupDef {
  key: GroupKey;
  name: string;
  sub: string;
  sectionKeys: string[];
  route: string;
}

const GROUPS: GroupDef[] = [
  {
    key: "info",
    name: "Info Kunjungan",
    sub: "Siapa ditemui · Catatan penting",
    sectionKeys: ["s1_generic", "s2_notable"],
    route: "info",
  },
  {
    key: "data_taco",
    name: "Data TACO",
    sub: "Harga · Volume · Stok · POSM",
    sectionKeys: ["s4_pricing", "s5_volume", "s6_stock", "s7_posm"],
    route: "data",
  },
  {
    key: "kompetitor",
    name: "Kompetitor",
    sub: "Invoice OCR · Harga kompetitor",
    sectionKeys: ["s8_competitor"],
    route: "competitor",
  },
  {
    key: "sinyal",
    name: "Sinyal Pasar",
    sub: "Pertanyaan wajib · Sinyal Toko",
    sectionKeys: ["s3_burning", "s9_demand", "s10_sentiment"],
    route: "sinyal",
  },
];

interface VisitSection {
  section_key: string;
  data?: Record<string, unknown>;
  prefilled_from_visit_id?: string;
}

interface VisitResponse {
  id: string;
  store_id: string;
  store_name?: string;
  prior_visit_id?: string;
  prior_visit_days_ago?: number;
  sections?: VisitSection[];
}

function statusFor(
  group: GroupDef,
  sections: Record<string, VisitSection>
): GroupStatus {
  const present = group.sectionKeys.filter((k) => {
    const sec = sections[k];
    if (!sec || !sec.data) return false;
    return Object.keys(sec.data).length > 0;
  });
  if (present.length === 0) return "empty";
  if (present.length < group.sectionKeys.length) return "partial";
  return "filled";
}

function groupHasDelta(
  group: GroupDef,
  sections: Record<string, VisitSection>
): boolean {
  return group.sectionKeys.some((k) => sections[k]?.prefilled_from_visit_id);
}

function todayLabel(): string {
  const d = new Date();
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function VisitOverviewPage() {
  const router = useRouter();
  const params = useParams();
  const visitId = params?.id as string;
  const { user } = useAuthStore();

  const [visit, setVisit] = useState<VisitResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [burnCount, setBurnCount] = useState(0);

  const loadVisit = useCallback(async () => {
    try {
      const res = await getVisit(visitId);
      const v = (res.data as { data?: VisitResponse })?.data ??
        (res.data as VisitResponse);
      setVisit(v);
      if (v?.store_id) {
        try {
          const bq = await getBurningQuestionsForStore(v.store_id);
          const list =
            (bq.data as { data?: { id: string }[] })?.data ??
            (bq.data as { id: string }[]) ??
            [];
          setBurnCount(Array.isArray(list) ? list.length : 0);
        } catch {
          setBurnCount(0);
        }
      }
    } catch {
      setError("Gagal memuat kunjungan.");
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => {
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    loadVisit();
  }, [user, router, loadVisit]);

  const sections = useMemo<Record<string, VisitSection>>(() => {
    const m: Record<string, VisitSection> = {};
    for (const s of visit?.sections ?? []) m[s.section_key] = s;
    return m;
  }, [visit]);

  const groupStatuses = useMemo(
    () => GROUPS.map((g) => ({ g, status: statusFor(g, sections), delta: groupHasDelta(g, sections) })),
    [sections]
  );

  const filledCount = groupStatuses.filter((x) => x.status === "filled").length;
  const isPrefilled = !!visit?.prior_visit_id;
  const priorDays = visit?.prior_visit_days_ago;

  if (loading) {
    return (
      <div className="min-h-screen bg-taco-page flex items-center justify-center">
        <div className="text-center">
          <div className="w-11 h-11 mx-auto rounded-full border-2 border-taco-border border-t-taco-text taco-spin" />
          <div className="mt-4 text-[15px] text-taco-sub">Memuat kunjungan…</div>
        </div>
      </div>
    );
  }

  if (error || !visit) {
    return (
      <div className="min-h-screen bg-taco-page flex flex-col items-center justify-center px-8 text-center">
        <p className="text-[16px] text-taco-sub">
          {error ?? "Kunjungan tidak ditemukan."}
        </p>
        <button
          type="button"
          onClick={() => router.push("/app/stores")}
          className="mt-4 px-4 h-[44px] rounded-xl border border-taco-border text-[14px] text-taco-text"
        >
          Kembali ke daftar toko
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[180px]">
        {/* Header */}
        <div className="bg-white border-b border-taco-divider px-5 pt-3 pb-3.5">
          <div className="flex items-center justify-between min-h-[36px]">
            <button
              type="button"
              onClick={() => router.push("/app/stores")}
              className="inline-flex items-center gap-1 text-taco-sub text-[15px] min-h-[44px] -ml-1"
            >
              <ChevronLeft size={18} />
              Kembali
            </button>
            <span className="text-[13px] text-taco-muted">{todayLabel()}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <img
              src="https://manage.taco.co.id/asset-images/logo.svg"
              alt="TACO"
              className="h-[26px]"
            />
          </div>
        </div>

        <div className="flex-1 px-3.5 pt-3.5">
          {/* Store info card */}
          <div className="bg-white border border-taco-border rounded-2xl p-4 mb-3.5">
            <div className="text-[20px] font-bold text-taco-text leading-tight">
              {visit.store_name ?? "Toko"}
            </div>
            <div className="text-[14px] text-taco-sub mt-1.5">
              {isPrefilled && typeof priorDays === "number"
                ? `Kunjungan ${priorDays} hari lalu`
                : "Kunjungan pertama"}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[13px] text-taco-muted">
                {filledCount} dari 4 kelompok selesai
              </span>
              {isPrefilled && (
                <DeltaInlineTag daysAgo={priorDays} />
              )}
            </div>
          </div>

          {/* Burning Q banner — RED */}
          <BurningQuestionBanner
            count={burnCount}
            onClick={() => router.push(`/app/visit/${visitId}/sinyal`)}
          />

          {/* 4 group cards */}
          {groupStatuses.map(({ g, status, delta }) => (
            <GroupCard
              key={g.key}
              name={g.name}
              sub={delta ? `${g.sub} · Diperbarui` : g.sub}
              status={g.key === "sinyal" && burnCount > 0 ? "burn" : status}
              burnCount={g.key === "sinyal" ? burnCount : undefined}
              onClick={() => router.push(`/app/visit/${visitId}/${g.route}`)}
            />
          ))}
        </div>

        {/* Bottom CTA — orange Rekam Suara + Isi Manual ghost */}
        <div className="fixed bottom-0 left-0 right-0 phone-shell mx-auto bg-white border-t border-taco-divider px-5 pt-3.5 pb-8 z-30">
          <button
            type="button"
            onClick={() => router.push(`/app/visit/${visitId}/voice`)}
            className="w-full h-14 rounded-xl bg-taco-accent text-white text-[16px] font-semibold inline-flex items-center justify-center gap-2 active:bg-taco-accent-dark"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            Rekam Suara
          </button>
          <button
            type="button"
            onClick={() => router.push(`/app/visit/${visitId}/info`)}
            className="w-full h-11 mt-1.5 text-[15px] text-taco-sub"
          >
            Isi Manual
          </button>
        </div>
      </div>
    </div>
  );
}
