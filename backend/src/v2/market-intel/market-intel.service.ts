import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { InvoiceLineItemV2 } from '../../database/entities/v2/invoice-line-item-v2.entity';
import { InvoiceV2 } from '../../database/entities/v2/invoice-v2.entity';
import { Region, RegionType } from '../../database/entities/region.entity';
import { TacoSku } from '../../database/entities/taco-sku.entity';
import { V2Period } from '../dto/period.dto';
import {
  MarketIntelQueryDto,
  PaginatedMarketIntelQueryDto,
  PriceBandsQueryDto,
  PriceGapPairsQueryDto,
  SkuPriceHistoryQueryDto,
  SkuWhitespaceQueryDto,
  TopSkusPerAreaQueryDto,
} from './dto/market-intel.dto';

/**
 * Outlier threshold (AC-5): an invoice's unit_price is flagged when it sits
 * ≥25% away from the median of the OTHER contributing invoices for that SKU.
 * Single constant per PRD §11 — tune here if Demo Day shows it's noisy.
 */
const OUTLIER_THRESHOLD = 0.25;

/** Default rows per page for the paginated panels (R2/R3/R4) — PRD §8. */
const DEFAULT_PAGE_SIZE = 10;

interface DateScope {
  /** Inclusive lower bound (YYYY-MM-DD) or null for 'all'. */
  from: string | null;
  /** Inclusive upper bound (YYYY-MM-DD). */
  to: string;
  label: V2Period;
}

/** Coverage tuple — the (N invoice · M toko · K wilayah · terakhir) chip. */
export interface Coverage {
  n_invoices: number;
  m_stores: number;
  k_areas: number;
  last_invoice_date: string | null;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
}

type OutlierDirection = 'above' | 'below' | null;

interface RawCoverage {
  n_invoices: string;
  m_stores: string;
  k_areas: string;
  last_invoice_date: string | null;
}

interface RawPriceObs {
  sku_id: string;
  sku_name: string | null;
  invoice_id: string;
  store_id: string | null;
  area_id: string | null;
  eff_date: string | null;
  region_name: string | null;
  supplier_name: string | null;
  unit_price: string;
}

interface RawHistoryObs {
  invoice_id: string;
  store_id: string | null;
  store_name: string | null;
  area_id: string | null;
  region_name: string | null;
  supplier_name: string | null;
  invoice_date: string | null;
  unit_price: string;
  image_id: string | null;
}

interface RawDemandTotal {
  region_id: string | null;
  region_name: string | null;
  n_invoices: string;
}

interface RawDemandSku {
  region_id: string | null;
  sku_id: string;
  sku_name: string | null;
  occurrence_count: string;
}

interface RawGapPair {
  invoice_id: string;
  store_name: string | null;
  region_name: string | null;
  invoice_date: string | null;
  taco_sku_name: string | null;
  taco_unit_price: string;
  competitor_brand_name: string | null;
  competitor_sku_text: string | null;
  competitor_unit_price: string;
  image_id: string | null;
}

interface RawSeenPair {
  sku_id: string;
  area_id: string | null;
}

/**
 * TACO v2 — Market Intelligence service (the revamped `/taro/v2/analytics`).
 *
 * Read-only signals computed straight from the sampled distributor invoices —
 * every one framed honestly (presence/price/frequency, never a market total).
 * Data sources only: `taro_v2_invoices` (status='done'),
 * `taro_v2_invoice_line_items`, `taco_skus`, `competitor_brands`, `regions`,
 * `taro_v2_stores`. No schema changes; supplier normalization at query time.
 *
 * Window semantics: the period filters on the invoice's TRANSACTION date
 * (`invoice_date`, falling back to `created_at::date` when unparsed) per PRD
 * §8 — these are market signals about when a deal happened.
 *
 * Endpoint map (PRD §8 revision): coverage · price-bands (paginated+searchable)
 * · sku-price-history (R5 modal) · top-skus-per-area (R1) · price-gap-pairs (R3)
 * · sku-whitespace (R4). `competitor-basket` + `distributor-performance` are CUT
 * (F-10 retired); `demand-mix` → `top-skus-per-area`; `sku-evidence` →
 * `sku-price-history`.
 */
@Injectable()
export class MarketIntelService {
  constructor(
    @InjectRepository(InvoiceLineItemV2)
    private readonly lineItems: Repository<InvoiceLineItemV2>,
    @InjectRepository(InvoiceV2)
    private readonly invoices: Repository<InvoiceV2>,
    @InjectRepository(Region)
    private readonly regions: Repository<Region>,
    @InjectRepository(TacoSku)
    private readonly skus: Repository<TacoSku>,
  ) {}

  // ---- helpers -------------------------------------------------------------

  private num(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  private pct(num: number, den: number): number {
    if (den === 0) return 0;
    return Math.round((num / den) * 1000) / 10; // 1 decimal
  }

  private median(sorted: number[]): number {
    const n = sorted.length;
    if (n === 0) return 0;
    const mid = Math.floor(n / 2);
    return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /** Clamp 1-based page + page_size from the (string) query params. */
  private resolvePage(query: PaginatedMarketIntelQueryDto): {
    page: number;
    pageSize: number;
  } {
    const page = Math.max(parseInt(query.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(
        parseInt(query.page_size ?? String(DEFAULT_PAGE_SIZE), 10) ||
          DEFAULT_PAGE_SIZE,
        1,
      ),
      100,
    );
    return { page, pageSize };
  }

  /** Case-insensitive substring match (null-safe), for server-side search. */
  private matchesQ(
    q: string | undefined,
    ...fields: (string | null)[]
  ): boolean {
    if (!q) return true;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return fields.some((f) => (f ?? '').toLowerCase().includes(needle));
  }

  /** YYYY-MM-DD in the server's local frame (matches the `date` column). */
  private dateOnly(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /**
   * `normalize_supplier(raw)` (PRD §8 — retained): lower-case, strip a leading
   * Indonesian honorific (`PT`/`CV`/`H.`/`HPLG` and common kin, optional
   * trailing dot), collapse whitespace. Available if a future panel groups
   * distributors; R5's invoice list shows the RAW `supplier_name` as captured.
   */
  private normalizeSupplier(raw: string | null): string {
    let s = (raw ?? '').toLowerCase().trim();
    s = s.replace(/^(pt|cv|ud|hplg|hj|h)\.?\s+/, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  private resolveRange(period?: V2Period): DateScope {
    const now = new Date();
    const label: V2Period = period ?? '30d';
    let from: Date | null;
    let to: Date = now;

    switch (label) {
      case '7d':
        from = new Date(now.getTime() - 7 * 864e5);
        break;
      case '30d':
        from = new Date(now.getTime() - 30 * 864e5);
        break;
      case '90d':
        from = new Date(now.getTime() - 90 * 864e5);
        break;
      case 'this_month':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        to = new Date(now.getFullYear(), now.getMonth(), 0); // last day prev month
        break;
      case 'this_quarter':
        from = new Date(
          now.getFullYear(),
          Math.floor(now.getMonth() / 3) * 3,
          1,
        );
        break;
      case 'ytd':
        from = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all':
        from = null;
        break;
      default:
        from = new Date(now.getTime() - 30 * 864e5);
    }
    return {
      from: from ? this.dateOnly(from) : null,
      to: this.dateOnly(to),
      label,
    };
  }

  /** SQL expr for the effective transaction date (invoice_date → created_at). */
  private readonly EFF_DATE =
    'COALESCE(inv.invoice_date, inv.created_at::date)';

  /**
   * Same as EFF_DATE but rendered as a 'YYYY-MM-DD' text — used in SELECTs so
   * the value never round-trips through a JS Date (the node-pg `date` parser
   * shifts it by the server's UTC offset and serializes a misleading ISO
   * timestamp). Comparisons in WHERE keep using the raw EFF_DATE.
   */
  private readonly EFF_DATE_STR = `to_char(${'COALESCE(inv.invoice_date, inv.created_at::date)'}, 'YYYY-MM-DD')`;

  /** Scalar subquery: one valid image id (text) for the invoice, or NULL. */
  private readonly IMAGE_ID_SUBQUERY = `(SELECT i.id::text FROM taro_v2_invoice_images i WHERE i.invoice_id = inv.id AND i.validation_status = 'valid' ORDER BY i.created_at ASC LIMIT 1)`;

  private imageUrl(imageId: string | null): string | null {
    return imageId ? `/api/v2/invoice-images/${imageId}/image` : null;
  }

  /**
   * Apply status='done' + the transaction-date window + optional area filter to
   * a query whose invoice alias is `inv`.
   */
  private applyScope<T extends import('typeorm').ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    range: DateScope,
    area?: string,
  ): SelectQueryBuilder<T> {
    qb.andWhere("inv.status = 'done'");
    if (range.from) {
      qb.andWhere(`${this.EFF_DATE} >= :from`, { from: range.from });
    }
    qb.andWhere(`${this.EFF_DATE} <= :to`, { to: range.to });
    if (area) qb.andWhere('inv.area_id = :area', { area });
    return qb;
  }

  /** Build a coverage tuple from a set of contributing invoice rows. */
  private coverageOf(
    rows: Array<{
      invoice_id: string;
      store_id: string | null;
      area_id: string | null;
      eff_date: string | null;
    }>,
  ): Coverage {
    const invoices = new Set<string>();
    const stores = new Set<string>();
    const areas = new Set<string>();
    let last: string | null = null;
    for (const r of rows) {
      invoices.add(r.invoice_id);
      if (r.store_id) stores.add(r.store_id);
      if (r.area_id) areas.add(r.area_id);
      if (r.eff_date && (last === null || r.eff_date > last)) last = r.eff_date;
    }
    return {
      n_invoices: invoices.size,
      m_stores: stores.size,
      k_areas: areas.size,
      last_invoice_date: last,
    };
  }

  /**
   * Per-observation outlier direction (AC-5): leave-one-out median-of-others,
   * ±OUTLIER_THRESHOLD. `prices` is parallel to the returned array; index i is
   * flagged relative to the OTHER prices.
   */
  private outlierDirections(prices: number[]): OutlierDirection[] {
    return prices.map((p, i) => {
      const others = prices.filter((_, j) => j !== i).sort((a, b) => a - b);
      if (others.length === 0) return null;
      const medOthers = this.median(others);
      if (medOthers <= 0) return null;
      if (p >= medOthers * (1 + OUTLIER_THRESHOLD)) return 'above';
      if (p <= medOthers * (1 - OUTLIER_THRESHOLD)) return 'below';
      return null;
    });
  }

  // ---- 1. coverage (AC-1, AC-2) --------------------------------------------

  /** Page-level coverage for the truth banner: N invoice · M toko · K wilayah. */
  async coverage(
    query: MarketIntelQueryDto,
  ): Promise<Coverage & { period: V2Period }> {
    const range = this.resolveRange(query.period);
    const raw = await this.applyScope(
      this.invoices
        .createQueryBuilder('inv')
        .select('COUNT(DISTINCT inv.id)', 'n_invoices')
        .addSelect('COUNT(DISTINCT inv.store_id)', 'm_stores')
        .addSelect('COUNT(DISTINCT inv.area_id)', 'k_areas')
        .addSelect(
          `to_char(MAX(${this.EFF_DATE}), 'YYYY-MM-DD')`,
          'last_invoice_date',
        ),
      range,
      query.area,
    ).getRawOne<RawCoverage>();

    return {
      period: range.label,
      n_invoices: this.num(raw?.n_invoices),
      m_stores: this.num(raw?.m_stores),
      k_areas: this.num(raw?.k_areas),
      last_invoice_date: raw?.last_invoice_date ?? null,
    };
  }

  // ---- 2. price-bands (AC-4, AC-5, AC-6) -----------------------------------

  /**
   * R2 hero (Peta Harga Nyata). One row per matched SKU with ≥3 contributing
   * invoices, sorted by invoice-count desc. Each carries min/median/max
   * unit_price, the spread %, and flagged outliers (≥25% off median-of-others).
   *
   * Server-side search (`q`, case-insensitive substring on SKU name) +
   * pagination (`page`/`page_size`, default 10). The coverage chip is computed
   * over ALL matched-SKU invoices in the period/area scope (AC-2) — it does NOT
   * narrow with the in-panel search box, which is a within-panel refinement.
   */
  async priceBands(query: PriceBandsQueryDto) {
    const range = this.resolveRange(query.period);
    const { page, pageSize } = this.resolvePage(query);

    const rows = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('li.matched_sku', 'sku')
        .leftJoin('regions', 'area', 'area.id = inv.area_id')
        .select('li.matched_sku_id', 'sku_id')
        .addSelect('MAX(sku.name)', 'sku_name')
        .addSelect('inv.id', 'invoice_id')
        .addSelect('inv.store_id', 'store_id')
        .addSelect('inv.area_id', 'area_id')
        .addSelect(`${this.EFF_DATE_STR}`, 'eff_date')
        .addSelect('MAX(area.name)', 'region_name')
        .addSelect('MAX(inv.supplier_name)', 'supplier_name')
        .addSelect('AVG(CAST(li.unit_price AS numeric))', 'unit_price')
        .where('li.matched_sku_id IS NOT NULL')
        .andWhere('CAST(li.unit_price AS numeric) > 0'),
      range,
      query.area,
    )
      .groupBy('li.matched_sku_id')
      .addGroupBy('inv.id')
      .addGroupBy('inv.store_id')
      .addGroupBy('inv.area_id')
      .addGroupBy(`${this.EFF_DATE}`)
      .getRawMany<RawPriceObs>();

    // Group observations (one priced invoice = one observation) per SKU.
    interface Obs {
      invoice_id: string;
      store_id: string | null;
      area_id: string | null;
      eff_date: string | null;
      region_name: string | null;
      supplier_name: string | null;
      unit_price: number;
    }
    const bySku = new Map<string, { sku_name: string; obs: Obs[] }>();
    for (const r of rows) {
      if (!bySku.has(r.sku_id)) {
        bySku.set(r.sku_id, {
          sku_name: r.sku_name ?? 'SKU Tidak Diketahui',
          obs: [],
        });
      }
      bySku.get(r.sku_id)!.obs.push({
        invoice_id: r.invoice_id,
        store_id: r.store_id,
        area_id: r.area_id,
        eff_date: r.eff_date,
        region_name: r.region_name,
        supplier_name: r.supplier_name,
        unit_price: this.num(r.unit_price),
      });
    }

    // All qualifying bands (≥3 invoices), sorted by invoice-count desc.
    const allBands = Array.from(bySku.entries())
      .map(([sku_id, { sku_name, obs }]) => {
        const nInvoices = new Set(obs.map((o) => o.invoice_id)).size;
        return { sku_id, sku_name, obs, nInvoices };
      })
      .filter((b) => b.nInvoices >= 3)
      .sort(
        (a, b) =>
          b.nInvoices - a.nInvoices || a.sku_name.localeCompare(b.sku_name),
      );

    // Server-side search (AC-4) then pagination (AC-4, page_size=10).
    const filtered = allBands.filter((b) => this.matchesQ(query.q, b.sku_name));
    const total = filtered.length;
    const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

    const price_bands = pageRows.map((b) => {
      const prices = b.obs.map((o) => o.unit_price).sort((x, y) => x - y);
      const pMin = prices[0];
      const pMax = prices[prices.length - 1];
      const pMed = this.median(prices);
      const spreadPct =
        pMed > 0 ? Math.round(((pMax - pMin) / pMed) * 1000) / 10 : 0;

      // Outliers (AC-5): leave-one-out median-of-others, ±25%, with tooltip data.
      const dirs = this.outlierDirections(b.obs.map((o) => o.unit_price));
      const outliers = b.obs
        .map((o, i) => {
          const direction = dirs[i];
          if (!direction) return null;
          return {
            invoice_id: o.invoice_id,
            supplier_name: o.supplier_name ?? null,
            region_name: o.region_name ?? null,
            unit_price: Math.round(o.unit_price),
            direction,
          };
        })
        .filter((o): o is NonNullable<typeof o> => o !== null);

      return {
        sku_id: b.sku_id,
        sku_name: b.sku_name,
        n_invoices: b.nInvoices,
        p_min: Math.round(pMin),
        p_median: Math.round(pMed),
        p_max: Math.round(pMax),
        spread_pct: spreadPct,
        outliers,
      };
    });

    const pagination: Pagination = { page, page_size: pageSize, total };

    return {
      period: range.label,
      coverage: this.coverageOf(rows.map((r) => ({ ...r }))),
      price_bands,
      pagination,
    };
  }

  // ---- 3. sku-price-history (AC-7, AC-25, AC-26, AC-27) ---------------------

  /**
   * R5 modal — the ONLY call the modal makes. Returns the SKU's price trend over
   * time (one point per contributing invoice), min/avg/max, and the contributing
   * invoice list. The in-modal Area (`area`) + Store (`store_id`) filters narrow
   * the trend, the min/avg/max, the coverage chip, and the invoice list in place
   * (AC-27). Defaults are "Semua / Semua" (params omitted) — the FE owns dropdown
   * state and does NOT inherit the page filter (AC-25).
   *
   * One observation = one invoice (AVG unit_price across that SKU's lines on the
   * invoice), consistent with the R2 band math. Outlier direction is the same
   * leave-one-out ±25% rule as AC-5.
   */
  async skuPriceHistory(query: SkuPriceHistoryQueryDto) {
    const range = this.resolveRange(query.period);

    if (!query.sku_id) {
      return {
        period: range.label,
        sku_id: null,
        coverage: this.coverageOf([]),
        p_min: 0,
        p_avg: 0,
        p_max: 0,
        trend: [],
        invoices: [],
      };
    }

    const qb = this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('regions', 'area', 'area.id = inv.area_id')
        .leftJoin('taro_v2_stores', 'store', 'store.id = inv.store_id')
        .select('inv.id', 'invoice_id')
        .addSelect('inv.store_id', 'store_id')
        .addSelect('inv.area_id', 'area_id')
        .addSelect('MAX(store.name)', 'store_name')
        .addSelect('MAX(area.name)', 'region_name')
        .addSelect('MAX(inv.supplier_name)', 'supplier_name')
        .addSelect(
          `to_char(MAX(${this.EFF_DATE}), 'YYYY-MM-DD')`,
          'invoice_date',
        )
        .addSelect('AVG(CAST(li.unit_price AS numeric))', 'unit_price')
        .addSelect(this.IMAGE_ID_SUBQUERY, 'image_id')
        .where('li.matched_sku_id = :sku_id', { sku_id: query.sku_id })
        .andWhere('CAST(li.unit_price AS numeric) > 0'),
      range,
      query.area,
    )
      .groupBy('inv.id')
      .addGroupBy('inv.store_id')
      .addGroupBy('inv.area_id');

    if (query.store_id) {
      qb.andWhere('inv.store_id = :store_id', { store_id: query.store_id });
    }

    const rows = await qb.getRawMany<RawHistoryObs>();

    // Outlier direction per observation (AC-5/AC-26), parallel to `rows`.
    const dirs = this.outlierDirections(
      rows.map((r) => this.num(r.unit_price)),
    );

    const obs = rows.map((r, i) => ({
      invoice_id: r.invoice_id,
      store_id: r.store_id,
      store_name: r.store_name ?? null,
      region_id: r.area_id,
      region_name: r.region_name ?? null,
      supplier_name: r.supplier_name ?? null,
      invoice_date: r.invoice_date ?? null,
      unit_price: Math.round(this.num(r.unit_price)),
      image_url: this.imageUrl(r.image_id),
      outlier_direction: dirs[i],
    }));

    const prices = obs.map((o) => o.unit_price);
    const pMin = prices.length ? Math.min(...prices) : 0;
    const pMax = prices.length ? Math.max(...prices) : 0;
    const pAvg = prices.length
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : 0;

    // Trend: oldest→newest (chart x-axis is time).
    const trend = [...obs]
      .sort((a, b) =>
        (a.invoice_date ?? '').localeCompare(b.invoice_date ?? ''),
      )
      .map((o) => ({
        invoice_date: o.invoice_date,
        unit_price: o.unit_price,
        invoice_id: o.invoice_id,
        store_id: o.store_id,
        store_name: o.store_name,
        region_id: o.region_id,
        region_name: o.region_name,
        outlier_direction: o.outlier_direction,
      }));

    // Invoice list: newest-first (AC-7).
    const invoices = [...obs]
      .sort((a, b) =>
        (b.invoice_date ?? '').localeCompare(a.invoice_date ?? ''),
      )
      .map((o) => ({
        invoice_id: o.invoice_id,
        store_name: o.store_name,
        region_name: o.region_name,
        supplier_name: o.supplier_name,
        invoice_date: o.invoice_date,
        unit_price: o.unit_price,
        image_url: o.image_url,
        outlier_direction: o.outlier_direction,
      }));

    return {
      period: range.label,
      sku_id: query.sku_id,
      coverage: this.coverageOf(
        rows.map((r) => ({
          invoice_id: r.invoice_id,
          store_id: r.store_id,
          area_id: r.area_id,
          eff_date: r.invoice_date,
        })),
      ),
      p_min: pMin,
      p_avg: pAvg,
      p_max: pMax,
      trend,
      invoices,
    };
  }

  // ---- 4. top-skus-per-area (AC-8, AC-9, AC-18, AC-19) ----------------------

  /**
   * R1 — per-region top SKUs by line-occurrence frequency (presence, NOT
   * volume). Restricted to matched SKUs (AC-19); the canonical `taco_skus.name`
   * is shown, never the raw OCR text. `top_n` defaults to 5 (the FE requests 10
   * when a single area is selected — AC-9). Per-region thin-data degradation is
   * a FE concern (AC-18); the BE returns honest per-region counts.
   */
  async topSkusPerArea(query: TopSkusPerAreaQueryDto) {
    const range = this.resolveRange(query.period);
    const topN = Math.min(
      Math.max(parseInt(query.top_n ?? '5', 10) || 5, 1),
      20,
    );

    // Region denominators: all done invoices per region in scope.
    const totals = await this.applyScope(
      this.invoices
        .createQueryBuilder('inv')
        .leftJoin('regions', 'area', 'area.id = inv.area_id')
        .select('inv.area_id', 'region_id')
        .addSelect('MAX(area.name)', 'region_name')
        .addSelect('COUNT(DISTINCT inv.id)', 'n_invoices'),
      range,
      query.area,
    )
      .groupBy('inv.area_id')
      .getRawMany<RawDemandTotal>();

    // Per-region per-SKU occurrence: distinct invoices containing the matched SKU.
    const skuRows = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('li.matched_sku', 'sku')
        .select('inv.area_id', 'region_id')
        .addSelect('li.matched_sku_id', 'sku_id')
        .addSelect('MAX(sku.name)', 'sku_name')
        .addSelect('COUNT(DISTINCT inv.id)', 'occurrence_count')
        .where('li.matched_sku_id IS NOT NULL'),
      range,
      query.area,
    )
      .groupBy('inv.area_id')
      .addGroupBy('li.matched_sku_id')
      .getRawMany<RawDemandSku>();

    const skusByRegion = new Map<
      string,
      { sku_id: string; sku_name: string; occurrence_count: number }[]
    >();
    for (const r of skuRows) {
      const key = r.region_id ?? '__none__';
      if (!skusByRegion.has(key)) skusByRegion.set(key, []);
      skusByRegion.get(key)!.push({
        sku_id: r.sku_id,
        sku_name: r.sku_name ?? 'SKU Tidak Diketahui',
        occurrence_count: this.num(r.occurrence_count),
      });
    }

    const regions = totals
      .map((t) => {
        const key = t.region_id ?? '__none__';
        const n = this.num(t.n_invoices);
        const skus = (skusByRegion.get(key) ?? [])
          .sort((a, b) => b.occurrence_count - a.occurrence_count)
          .slice(0, topN)
          .map((s) => ({
            sku_id: s.sku_id,
            sku_name: s.sku_name,
            occurrence_count: s.occurrence_count,
            occurrence_pct: this.pct(s.occurrence_count, n),
          }));
        return {
          region_id: t.region_id ?? null,
          region_name: t.region_name ?? 'Tanpa Area',
          n_invoices: n,
          skus,
        };
      })
      .sort((a, b) => b.n_invoices - a.n_invoices);

    return { period: range.label, regions };
  }

  // ---- 5. price-gap-pairs (AC-10, AC-11, AC-20, AC-21, AC-22) ---------------

  /**
   * R3 — same-receipt TACO vs resolved-competitor price gaps. Each row pairs a
   * matched TACO line with a resolved-competitor line (`brand_id IS NOT NULL`,
   * `is_competitor=true`) on the SAME invoice (AC-10). Unknown-brand competitor
   * observations are excluded from rows and counted in `unknown_competitor_count`
   * (AC-11 footer). Sorted by |% gap| desc (AC-20), searchable by TACO SKU /
   * competitor brand / store (AC-21), paginated 10/page.
   *
   * `total_same_receipt_pairs` (resolved + unknown) lets the FE drive AC-22:
   *   total<3 → thin-data; total≥3 && resolved total (pagination.total)==0 →
   *   the distinct zero-pair copy + the AC-11 footer.
   */
  async priceGapPairs(query: PriceGapPairsQueryDto) {
    const range = this.resolveRange(query.period);
    const { page, pageSize } = this.resolvePage(query);

    const raw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .innerJoin(
          'taro_v2_invoice_line_items',
          'c',
          'c.invoice_id = inv.id AND c.is_competitor = true AND c.brand_id IS NOT NULL',
        )
        .leftJoin('taco_skus', 'sku', 'sku.id = li.matched_sku_id')
        .leftJoin('competitor_brands', 'brand', 'brand.id = c.brand_id')
        .leftJoin('regions', 'area', 'area.id = inv.area_id')
        .leftJoin('taro_v2_stores', 'store', 'store.id = inv.store_id')
        .select('inv.id', 'invoice_id')
        .addSelect('store.name', 'store_name')
        .addSelect('area.name', 'region_name')
        .addSelect(`${this.EFF_DATE_STR}`, 'invoice_date')
        .addSelect('sku.name', 'taco_sku_name')
        .addSelect('CAST(li.unit_price AS numeric)', 'taco_unit_price')
        .addSelect('brand.name', 'competitor_brand_name')
        .addSelect('c.raw_text', 'competitor_sku_text')
        .addSelect('CAST(c.unit_price AS numeric)', 'competitor_unit_price')
        .addSelect(this.IMAGE_ID_SUBQUERY, 'image_id')
        .where('li.matched_sku_id IS NOT NULL')
        .andWhere('CAST(li.unit_price AS numeric) > 0')
        .andWhere('CAST(c.unit_price AS numeric) > 0'),
      range,
      query.area,
    ).getRawMany<RawGapPair>();

    // Build + compute the gap per pair (small N — sort by |%| desc in JS, AC-20).
    const allRows = raw
      .map((r) => {
        const tacoPrice = Math.round(this.num(r.taco_unit_price));
        const compPrice = Math.round(this.num(r.competitor_unit_price));
        const gapRp = tacoPrice - compPrice;
        const gapPct =
          compPrice > 0 ? Math.round((gapRp / compPrice) * 1000) / 10 : 0;
        return {
          invoice_id: r.invoice_id,
          image_url: this.imageUrl(r.image_id),
          store_name: r.store_name ?? null,
          region_name: r.region_name ?? null,
          invoice_date: r.invoice_date ?? null,
          taco_sku_name: r.taco_sku_name ?? 'SKU Tidak Diketahui',
          taco_unit_price: tacoPrice,
          competitor_brand_name:
            r.competitor_brand_name ?? 'Merek Tidak Diketahui',
          competitor_sku_text: r.competitor_sku_text ?? null,
          competitor_unit_price: compPrice,
          gap_rp: gapRp,
          gap_pct: gapPct,
        };
      })
      .sort((a, b) => Math.abs(b.gap_pct) - Math.abs(a.gap_pct));

    // Search (AC-21): TACO SKU / competitor brand / store name.
    const filtered = allRows.filter((r) =>
      this.matchesQ(
        query.q,
        r.taco_sku_name,
        r.competitor_brand_name,
        r.store_name,
      ),
    );
    const total = filtered.length;
    const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

    // AC-11 footer: unknown-brand competitor observations on TACO receipts.
    const unknownRow = await this.applyScope(
      this.lineItems
        .createQueryBuilder('c')
        .innerJoin('c.invoice', 'inv')
        .select('COUNT(*)', 'cnt')
        .where('c.is_competitor = true')
        .andWhere('c.brand_id IS NULL')
        .andWhere(
          'EXISTS (SELECT 1 FROM taro_v2_invoice_line_items tt WHERE tt.invoice_id = inv.id AND tt.matched_sku_id IS NOT NULL)',
        ),
      range,
      query.area,
    ).getRawOne<{ cnt: string }>();
    const unknownCompetitorCount = this.num(unknownRow?.cnt);

    // AC-22 N: ALL same-receipt TACO+competitor pairs (resolved + unknown).
    const totalPairRow = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .innerJoin(
          'taro_v2_invoice_line_items',
          'c',
          'c.invoice_id = inv.id AND c.is_competitor = true',
        )
        .select('COUNT(*)', 'cnt')
        .where('li.matched_sku_id IS NOT NULL'),
      range,
      query.area,
    ).getRawOne<{ cnt: string }>();
    const totalSameReceiptPairs = this.num(totalPairRow?.cnt);

    // Coverage (AC-2): invoices that hold BOTH a TACO line and ANY competitor
    // line — the same-receipt universe this panel is computed from. Renders even
    // when resolved rows are 0 (the zero-pair state still shows the chip).
    const covRows = await this.applyScope(
      this.invoices
        .createQueryBuilder('inv')
        .select('inv.id', 'invoice_id')
        .addSelect('inv.store_id', 'store_id')
        .addSelect('inv.area_id', 'area_id')
        .addSelect(`${this.EFF_DATE_STR}`, 'eff_date')
        .where(
          'EXISTS (SELECT 1 FROM taro_v2_invoice_line_items t WHERE t.invoice_id = inv.id AND t.matched_sku_id IS NOT NULL)',
        )
        .andWhere(
          'EXISTS (SELECT 1 FROM taro_v2_invoice_line_items cc WHERE cc.invoice_id = inv.id AND cc.is_competitor = true)',
        ),
      range,
      query.area,
    ).getRawMany<{
      invoice_id: string;
      store_id: string | null;
      area_id: string | null;
      eff_date: string | null;
    }>();

    const pagination: Pagination = { page, page_size: pageSize, total };

    return {
      period: range.label,
      coverage: this.coverageOf(covRows),
      rows,
      pagination,
      unknown_competitor_count: unknownCompetitorCount,
      total_same_receipt_pairs: totalSameReceiptPairs,
    };
  }

  // ---- 6. sku-whitespace (AC-23, AC-24) ------------------------------------

  /**
   * R4 — (taco_sku × region) combinations NOT yet observed in the sample under
   * the current period/area filter (AC-23). A combo is white-space when ZERO
   * done invoices in scope for that region carry a line matched to that SKU.
   * Framed as a research lead, not a distribution claim (AC-24 sub-line, FE).
   *
   * The cross product is `active taco_skus × active area-regions` (single region
   * when the area filter is set); searchable by SKU / region name (AC-24),
   * paginated 10/page. Coverage reflects the sample the anti-join is taken
   * against (all done invoices in scope).
   */
  async skuWhitespace(query: SkuWhitespaceQueryDto) {
    const range = this.resolveRange(query.period);
    const { page, pageSize } = this.resolvePage(query);

    // Region universe: active leaf areas (single region when the filter is set).
    const regionQb = this.regions
      .createQueryBuilder('r')
      .select(['r.id AS id', 'r.name AS name'])
      .where('r.type = :type', { type: RegionType.AREA })
      .andWhere('r.active = true');
    if (query.area) regionQb.andWhere('r.id = :area', { area: query.area });
    const regionRows = await regionQb
      .orderBy('r.name', 'ASC')
      .getRawMany<{ id: string; name: string }>();

    // SKU universe: the active TACO catalog.
    const skuRows = await this.skus
      .createQueryBuilder('s')
      .select(['s.id AS id', 's.name AS name'])
      .where('s.is_active = true')
      .orderBy('s.name', 'ASC')
      .getRawMany<{ id: string; name: string }>();

    // Seen set: (matched_sku_id, area_id) observed in done invoices in scope.
    const seenRows = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .select('li.matched_sku_id', 'sku_id')
        .addSelect('inv.area_id', 'area_id')
        .where('li.matched_sku_id IS NOT NULL')
        .groupBy('li.matched_sku_id')
        .addGroupBy('inv.area_id'),
      range,
      query.area,
    ).getRawMany<RawSeenPair>();

    const seen = new Set<string>();
    for (const r of seenRows) {
      if (r.sku_id && r.area_id) seen.add(`${r.sku_id}|${r.area_id}`);
    }

    // Anti-join: every (sku, region) NOT in the seen set, then search-filter.
    const allRows: Array<{
      sku_id: string;
      sku_name: string;
      region_id: string;
      region_name: string;
    }> = [];
    for (const region of regionRows) {
      for (const sku of skuRows) {
        if (seen.has(`${sku.id}|${region.id}`)) continue;
        if (!this.matchesQ(query.q, sku.name, region.name)) continue;
        allRows.push({
          sku_id: sku.id,
          sku_name: sku.name,
          region_id: region.id,
          region_name: region.name,
        });
      }
    }

    const total = allRows.length;
    const rows = allRows.slice((page - 1) * pageSize, page * pageSize);
    const pagination: Pagination = { page, page_size: pageSize, total };

    const page0 = await this.coverage(query);
    const coverage: Coverage = {
      n_invoices: page0.n_invoices,
      m_stores: page0.m_stores,
      k_areas: page0.k_areas,
      last_invoice_date: page0.last_invoice_date,
    };

    return { period: range.label, coverage, rows, pagination };
  }
}
