/** TACO v2 — Intelijen Pasar (Market Intelligence) API client.
 *  Wraps the 6 read-only `/api/v2/market-intel/*` endpoints (PRD §8) that power
 *  the revamped /taro/v2/analytics page. Reuses the authed v1 axios instance.
 *
 *  HONESTY / MOCK POLICY (KC rule: no mock on the live surface):
 *  - DEFAULT = live only. If an endpoint errors (incl. pre-launch 404 before
 *    Mortar lands his module), the calling panel renders its own honest ERROR
 *    state — never fabricated numbers.
 *  - A mock dataset exists ONLY for pre-launch self-test / Demo-Day dry-runs and
 *    is OPT-IN: enable with build env `NEXT_PUBLIC_MI_MOCK=1` or, at runtime, the
 *    URL query `?mi_mock=1`. `?mi_state=thin|zero|empty|error` forces a panel
 *    state for screenshotting each AC. None of this triggers unless explicitly
 *    requested, so the shipped page is live-only and honest. */

import { api } from "@/lib/api";
import type {
  CoverageV2,
  PriceBandsV2,
  PriceBandRow,
  PriceBandOutlier,
  SkuEvidenceV2,
  SkuEvidenceRow,
  DemandMixV2,
  CompetitorBasketV2,
  DistributorPerfV2,
} from "./types";

export interface MarketScope {
  period: string;
  /** Region id; empty/undefined = all areas. */
  area?: string;
}

type MiDebugState = "thin" | "zero" | "empty" | "error" | null;

function miParams(scope: MarketScope, extra?: Record<string, string>) {
  return {
    period: scope.period,
    ...(scope.area ? { area: scope.area } : {}),
    ...(extra ?? {}),
  };
}

/** Whether the opt-in mock layer is active (env flag or `?mi_mock=1`). */
export function isMiMock(): boolean {
  if (process.env.NEXT_PUBLIC_MI_MOCK === "1") return true;
  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search).get("mi_mock") === "1";
  }
  return false;
}

function miDebugState(): MiDebugState {
  if (typeof window === "undefined") return null;
  const s = new URLSearchParams(window.location.search).get("mi_state");
  if (s === "thin" || s === "zero" || s === "empty" || s === "error") return s;
  return null;
}

// ── Mock dataset (pre-launch self-test only) ──────────────────────────────

const MOCK_DATE = "2026-06-14";

function thinCoverage(): CoverageV2 {
  return { n_invoices: 2, m_stores: 2, k_areas: 1, last_invoice_date: "2026-06-09" };
}

function buildMockPriceBands(scope: MarketScope): PriceBandsV2 {
  const single = Boolean(scope.area);
  const coverage: CoverageV2 = single
    ? { n_invoices: 12, m_stores: 8, k_areas: 1, last_invoice_date: "2026-06-12" }
    : { n_invoices: 34, m_stores: 19, k_areas: 4, last_invoice_date: "2026-06-12" };
  const skus: PriceBandsV2["skus"] = [
    {
      sku_id: "sku-2041",
      sku_name: "TACO HPL TH-2041 Glossy",
      n_invoices: 12,
      p_min: 118000,
      p_median: 142000,
      p_max: 182000,
      spread_pct: (182000 - 118000) / 142000,
      outliers: [
        {
          invoice_id: "INV-2041",
          supplier_name: "H. DOKO",
          region_name: "Bandung",
          unit_price: 182000,
          direction: "above",
          invoice_date: "2026-06-12",
        },
      ],
    },
    {
      sku_id: "sku-118",
      sku_name: "TACO HPL Marble MW-118",
      n_invoices: 9,
      p_min: 156000,
      p_median: 171000,
      p_max: 189000,
      spread_pct: (189000 - 156000) / 171000,
      outliers: [],
    },
    {
      sku_id: "sku-pvc1",
      sku_name: "TACO Edging PVC 1mm",
      n_invoices: 7,
      p_min: 8500,
      p_median: 11800,
      p_max: 14200,
      spread_pct: (14200 - 8500) / 11800,
      outliers: [
        {
          invoice_id: "INV-2055",
          supplier_name: "Mitra Risky Abadi",
          region_name: "Bandung",
          unit_price: 8500,
          direction: "below",
          invoice_date: "2026-06-08",
        },
      ],
    },
    {
      sku_id: "sku-wg77",
      sku_name: "TACO Sheet Woodgrain WG-77",
      n_invoices: 6,
      p_min: 134000,
      p_median: 143000,
      p_max: 152000,
      spread_pct: (152000 - 134000) / 143000,
      outliers: [],
    },
    {
      sku_id: "sku-gw01",
      sku_name: "TACO HPL Glossy White GW-01",
      n_invoices: 5,
      p_min: 122000,
      p_median: 131000,
      p_max: 148000,
      spread_pct: (148000 - 122000) / 131000,
      outliers: [],
    },
    {
      sku_id: "sku-th880",
      sku_name: "TACO HPL Metallic TH-880",
      n_invoices: 5,
      p_min: 168000,
      p_median: 179000,
      p_max: 205000,
      spread_pct: (205000 - 168000) / 179000,
      outliers: [
        {
          invoice_id: "INV-2071",
          supplier_name: "HPLG Aneka Putra",
          region_name: "Surabaya",
          unit_price: 205000,
          direction: "above",
          invoice_date: "2026-06-11",
        },
      ],
    },
    {
      sku_id: "sku-abs2",
      sku_name: "TACO Edging ABS 2mm",
      n_invoices: 4,
      p_min: 14000,
      p_median: 16500,
      p_max: 19000,
      spread_pct: (19000 - 14000) / 16500,
      outliers: [],
    },
    {
      sku_id: "sku-sc09",
      sku_name: "TACO HPL Solid SC-09",
      n_invoices: 4,
      p_min: 109000,
      p_median: 118000,
      p_max: 129000,
      spread_pct: (129000 - 109000) / 118000,
      outliers: [],
    },
    {
      sku_id: "sku-st44",
      sku_name: "TACO HPL Stone ST-44",
      n_invoices: 3,
      p_min: 161000,
      p_median: 172000,
      p_max: 184000,
      spread_pct: (184000 - 161000) / 172000,
      outliers: [],
    },
    {
      sku_id: "sku-mw210",
      sku_name: "TACO HPL Marble MW-210",
      n_invoices: 3,
      p_min: 158000,
      p_median: 166000,
      p_max: 177000,
      spread_pct: (177000 - 158000) / 166000,
      outliers: [],
    },
  ];
  return { coverage, skus };
}

function buildMockEvidence(skuId: string): SkuEvidenceV2 {
  return {
    coverage: { n_invoices: 12, m_stores: 9, k_areas: 4, last_invoice_date: "2026-06-12" },
    sku_id: skuId,
    sku_name: "TACO HPL TH-2041 Glossy",
    p_min: 118000,
    p_median: 142000,
    p_max: 182000,
    invoices: [
      {
        invoice_id: "INV-2041",
        store_name: "Toko Sumber Jaya",
        region_name: "Bandung",
        supplier_name: "H. DOKO",
        invoice_date: "2026-06-12",
        unit_price: 182000,
        image_url: "https://placehold.co/600x800/png?text=INV-2041",
        outlier_direction: "above",
      },
      {
        invoice_id: "INV-2039",
        store_name: "Toko Mitra Bangunan",
        region_name: "Jakarta",
        supplier_name: "HPLG Aneka Putra",
        invoice_date: "2026-06-11",
        unit_price: 148000,
        image_url: "https://placehold.co/600x800/png?text=INV-2039",
        outlier_direction: null,
      },
      {
        invoice_id: "INV-2033",
        store_name: "Toko Karya Indah",
        region_name: "Surabaya",
        supplier_name: "H. DOKO",
        invoice_date: "2026-06-09",
        unit_price: 139000,
        image_url: "https://placehold.co/600x800/png?text=INV-2033",
        outlier_direction: null,
      },
      {
        invoice_id: "INV-2028",
        store_name: "Toko Sumber Jaya",
        region_name: "Bandung",
        supplier_name: "Mitra Risky Abadi",
        invoice_date: "2026-06-07",
        unit_price: 132000,
        image_url: null,
        outlier_direction: null,
      },
    ],
  };
}

function buildMockDemand(scope: MarketScope): DemandMixV2 {
  const mk = (
    region_id: string,
    region_name: string,
    n_invoices: number,
    skus: [string, number][]
  ) => ({
    region_id,
    region_name,
    n_invoices,
    skus: skus.map(([name, pct], i) => ({
      sku_id: `${region_id}-s${i}`,
      sku_name: name,
      occurrence_count: Math.round((pct / 100) * n_invoices),
      occurrence_pct: pct / 100,
    })),
  });
  if (scope.area) {
    // Single-area → one region, top 10.
    return {
      coverage: { n_invoices: 12, m_stores: 8, k_areas: 1, last_invoice_date: "2026-06-12" },
      regions: [
        mk("r-bdg", "Bandung", 12, [
          ["TH-2041 Glossy", 75],
          ["Marble MW-118", 58],
          ["Edging PVC 1mm", 42],
          ["Woodgrain WG-77", 33],
          ["Solid SC-09", 25],
          ["Glossy White GW-01", 25],
          ["Metallic TH-880", 17],
          ["Stone ST-44", 17],
          ["Marble MW-210", 8],
          ["Edging ABS 2mm", 8],
        ]),
      ],
    };
  }
  return {
    coverage: { n_invoices: 31, m_stores: 17, k_areas: 4, last_invoice_date: "2026-06-12" },
    regions: [
      mk("r-bdg", "Bandung", 12, [
        ["TH-2041 Glossy", 75],
        ["Marble MW-118", 58],
        ["Edging PVC 1mm", 42],
        ["Woodgrain WG-77", 33],
        ["Solid SC-09", 25],
      ]),
      mk("r-sby", "Surabaya", 9, [
        ["Marble MW-118", 67],
        ["TH-2041 Glossy", 55],
        ["Metallic TH-880", 44],
        ["Edging ABS 2mm", 33],
        ["Stone ST-44", 22],
      ]),
      mk("r-jkt", "Jakarta", 7, [
        ["TH-2041 Glossy", 71],
        ["Glossy White GW-01", 57],
        ["Marble MW-118", 43],
        ["Edging PVC 1mm", 29],
        ["Woodgrain WG-77", 29],
      ]),
      mk("r-smg", "Semarang", 3, [
        ["Marble MW-118", 67],
        ["TH-2041 Glossy", 67],
        ["Solid SC-09", 33],
      ]),
    ],
  };
}

function buildMockCompetitor(scope: MarketScope): CompetitorBasketV2 {
  return {
    coverage: { n_invoices: 28, m_stores: 16, k_areas: scope.area ? 1 : 4, last_invoice_date: "2026-06-11" },
    n_invoices: 28,
    n_with_taco_and_competitor: 11,
    co_occurrence_pct: 11 / 28,
    top_brands: [
      { brand_id: "b-grace", brand_name: "Grace HPL", n_invoices: 7 },
      { brand_id: "b-violam", brand_name: "Violam", n_invoices: 5 },
      { brand_id: "b-prod", brand_name: "ProDesign", n_invoices: 3 },
    ],
    n_unknown_competitor: 2,
  };
}

function buildMockDistributor(): DistributorPerfV2 {
  return {
    coverage: { n_invoices: 34, m_stores: 19, k_areas: 4, last_invoice_date: "2026-06-12" },
    distributors: [
      {
        supplier_name_normalized: "H. Doko",
        supplier_name_raw_sample: "H. DOKO",
        n_invoices: 18,
        avg_invoice_value: 4820000,
        last_invoice_date: "2026-06-12",
      },
      {
        supplier_name_normalized: "Aneka Putra",
        supplier_name_raw_sample: "HPLG Aneka Putra",
        n_invoices: 11,
        avg_invoice_value: 6140000,
        last_invoice_date: "2026-06-11",
      },
      {
        supplier_name_normalized: "Mitra Risky Abadi",
        supplier_name_raw_sample: "Mitra Risky Abadi",
        n_invoices: 5,
        avg_invoice_value: 3275000,
        last_invoice_date: "2026-06-09",
      },
    ],
  };
}

// ── BE wire shapes + adapters ──────────────────────────────────────────────
// Mortar's live `/api/v2/market-intel/*` JSON differs from the FE canonical
// types in three ways the page would otherwise break on:
//   • field names: BE `price_bands`→`skus`, `evidence`→`invoices`,
//     `n_with_unknown_competitor`→`n_unknown_competitor`.
//   • percent convention: BE returns already-multiplied percents (e.g. 34.0,
//     75.0); the FE canonical types + page treat these as FRACTIONS (0.34) and
//     multiply by 100 at render. Adapters divide by 100.
//   • demand-mix omits a panel `coverage` (page falls back to scope coverage).
// The mock dataset above is authored directly in canonical shape, so ONLY the
// live path is adapted here.

const pctToFrac = (p: number | null | undefined): number =>
  typeof p === "number" && Number.isFinite(p) ? p / 100 : 0;

/** Extra band context for tagging evidence rows (outlier ▲/▼) — AC-7. The BE
 *  /sku-evidence route returns the raw invoice list only; the band + its
 *  outliers live on the price-bands row the manager clicked, so the page hands
 *  them in. Absent (e.g. a cold retry) → rows render without the outlier tag. */
export interface SkuEvidenceMeta {
  sku_name?: string;
  p_min?: number;
  p_median?: number;
  p_max?: number;
  outliers?: PriceBandOutlier[];
}

interface BePriceBands {
  coverage?: CoverageV2;
  price_bands: Array<Omit<PriceBandRow, "spread_pct"> & { spread_pct: number }>;
}
interface BeSkuEvidence {
  coverage?: CoverageV2;
  sku_id: string;
  evidence: Array<Omit<SkuEvidenceRow, "outlier_direction">>;
}
interface BeDemandMix {
  coverage?: CoverageV2;
  regions: Array<{
    region_id: string | null;
    region_name: string;
    n_invoices: number;
    skus: Array<{
      sku_id: string;
      sku_name: string;
      occurrence_count: number;
      occurrence_pct: number;
    }>;
  }>;
}
interface BeCompetitorBasket {
  coverage?: CoverageV2;
  n_invoices: number;
  n_with_taco_and_competitor: number;
  co_occurrence_pct: number;
  n_with_unknown_competitor: number;
  top_brands: CompetitorBasketV2["top_brands"];
}

function adaptPriceBands(be: BePriceBands): PriceBandsV2 {
  return {
    coverage: be.coverage,
    skus: (be.price_bands ?? []).map((b) => ({
      ...b,
      spread_pct: pctToFrac(b.spread_pct),
    })),
  };
}

function adaptSkuEvidence(
  be: BeSkuEvidence,
  meta?: SkuEvidenceMeta
): SkuEvidenceV2 {
  const dir = new Map<string, "above" | "below">();
  for (const o of meta?.outliers ?? []) dir.set(o.invoice_id, o.direction);
  return {
    coverage: be.coverage,
    sku_id: be.sku_id,
    sku_name: meta?.sku_name ?? "",
    p_min: meta?.p_min ?? 0,
    p_median: meta?.p_median ?? 0,
    p_max: meta?.p_max ?? 0,
    invoices: (be.evidence ?? []).map((e) => ({
      ...e,
      outlier_direction: dir.get(e.invoice_id) ?? null,
    })),
  };
}

function adaptDemandMix(be: BeDemandMix): DemandMixV2 {
  return {
    coverage: be.coverage,
    regions: (be.regions ?? []).map((r) => ({
      ...r,
      skus: (r.skus ?? []).map((s) => ({
        ...s,
        occurrence_pct: pctToFrac(s.occurrence_pct),
      })),
    })),
  };
}

function adaptCompetitorBasket(be: BeCompetitorBasket): CompetitorBasketV2 {
  return {
    coverage: be.coverage,
    n_invoices: be.n_invoices,
    n_with_taco_and_competitor: be.n_with_taco_and_competitor,
    co_occurrence_pct: pctToFrac(be.co_occurrence_pct),
    top_brands: be.top_brands ?? [],
    n_unknown_competitor: be.n_with_unknown_competitor ?? 0,
  };
}

// ── Fetchers (live-first; mock only when explicitly opted in) ──────────────

async function liveOrMock<T>(
  live: () => Promise<T>,
  mock: () => T
): Promise<T> {
  if (isMiMock()) {
    const dbg = miDebugState();
    if (dbg === "error") throw new Error("mi_state=error (forced)");
    return mock();
  }
  return live();
}

export async function fetchCoverage(scope: MarketScope): Promise<CoverageV2> {
  return liveOrMock<CoverageV2>(
    async () =>
      (
        await api.get<CoverageV2>("/v2/market-intel/coverage", {
          params: miParams(scope),
        })
      ).data,
    () => {
      if (miDebugState() === "thin") return thinCoverage();
      return scope.area
        ? { n_invoices: 12, m_stores: 8, k_areas: 1, last_invoice_date: "2026-06-12" }
        : { n_invoices: 37, m_stores: 21, k_areas: 4, last_invoice_date: MOCK_DATE };
    }
  );
}

export async function fetchPriceBands(scope: MarketScope): Promise<PriceBandsV2> {
  return liveOrMock<PriceBandsV2>(
    async () =>
      adaptPriceBands(
        (
          await api.get<BePriceBands>("/v2/market-intel/price-bands", {
            params: miParams(scope, { limit: "10" }),
          })
        ).data
      ),
    () => {
      const dbg = miDebugState();
      if (dbg === "thin") return { coverage: thinCoverage(), skus: [] };
      if (dbg === "empty")
        return {
          coverage: { n_invoices: 8, m_stores: 5, k_areas: 2, last_invoice_date: "2026-06-12" },
          skus: [],
        };
      return buildMockPriceBands(scope);
    }
  );
}

export async function fetchSkuEvidence(
  skuId: string,
  scope: MarketScope,
  meta?: SkuEvidenceMeta
): Promise<SkuEvidenceV2> {
  return liveOrMock<SkuEvidenceV2>(
    async () =>
      adaptSkuEvidence(
        (
          await api.get<BeSkuEvidence>("/v2/market-intel/sku-evidence", {
            params: miParams(scope, { sku_id: skuId }),
          })
        ).data,
        meta
      ),
    () => buildMockEvidence(skuId)
  );
}

export async function fetchDemandMix(scope: MarketScope): Promise<DemandMixV2> {
  return liveOrMock<DemandMixV2>(
    async () =>
      adaptDemandMix(
        (
          await api.get<BeDemandMix>("/v2/market-intel/demand-mix", {
            params: miParams(scope, { top_n: scope.area ? "10" : "5" }),
          })
        ).data
      ),
    () => {
      const dbg = miDebugState();
      if (dbg === "thin") return { coverage: thinCoverage(), regions: [] };
      return buildMockDemand(scope);
    }
  );
}

export async function fetchCompetitorBasket(
  scope: MarketScope
): Promise<CompetitorBasketV2> {
  return liveOrMock<CompetitorBasketV2>(
    async () =>
      adaptCompetitorBasket(
        (
          await api.get<BeCompetitorBasket>("/v2/market-intel/competitor-basket", {
            params: miParams(scope),
          })
        ).data
      ),
    () => {
      const dbg = miDebugState();
      if (dbg === "thin")
        return {
          coverage: thinCoverage(),
          n_invoices: 2,
          n_with_taco_and_competitor: 0,
          co_occurrence_pct: 0,
          top_brands: [],
          n_unknown_competitor: 0,
        };
      if (dbg === "zero")
        return {
          coverage: { n_invoices: 6, m_stores: 4, k_areas: 1, last_invoice_date: "2026-06-10" },
          n_invoices: 6,
          n_with_taco_and_competitor: 0,
          co_occurrence_pct: 0,
          top_brands: [],
          n_unknown_competitor: 0,
        };
      return buildMockCompetitor(scope);
    }
  );
}

export async function fetchDistributorPerformance(
  scope: MarketScope
): Promise<DistributorPerfV2> {
  return liveOrMock<DistributorPerfV2>(
    async () =>
      (
        await api.get<DistributorPerfV2>(
          "/v2/market-intel/distributor-performance",
          { params: miParams(scope) }
        )
      ).data,
    () => {
      const dbg = miDebugState();
      if (dbg === "thin") return { coverage: thinCoverage(), distributors: [] };
      return buildMockDistributor();
    }
  );
}
