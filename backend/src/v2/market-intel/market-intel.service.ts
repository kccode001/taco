import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { InvoiceLineItemV2 } from '../../database/entities/v2/invoice-line-item-v2.entity';
import { InvoiceV2 } from '../../database/entities/v2/invoice-v2.entity';
import { Region } from '../../database/entities/region.entity';
import { TacoSku } from '../../database/entities/taco-sku.entity';
import { V2Period } from '../dto/period.dto';
import {
  BrandBucketDetailQueryDto,
  BrandBucketDistributionQueryDto,
  CategoryQueryDto,
  CategorySkusQueryDto,
  MarketIntelQueryDto,
  PaginatedMarketIntelQueryDto,
  PriceBandsQueryDto,
  SkuPriceHistoryQueryDto,
  SkuStorePricingQueryDto,
  TopNonTacoInvoicesQueryDto,
  TopSkusPerAreaQueryDto,
} from './dto/market-intel.dto';

/**
 * Outlier threshold (AC-5): an invoice's unit_price is flagged when it sits
 * ≥25% away from the median of the OTHER contributing invoices for that SKU.
 * Single constant per PRD §11 — tune here if Demo Day shows it's noisy.
 */
const OUTLIER_THRESHOLD = 0.25;

/** Default rows per page for the paginated panels — PRD §8. */
const DEFAULT_PAGE_SIZE = 10;

/** Label for the NULL `catalog_category` bucket (Section 2, AC-32). */
const UNCATEGORIZED = 'Tidak terkategori';

/** Sentinel brand ids for the single-brand buckets in brand-bucket-detail. */
const TACO_BRAND = '__taco__';
const LAIN_LAIN_BRAND = '__lain_lain__';

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

/**
 * Observed-qty stats (AC-35, AC-36). One observation = one invoice (the SKU's
 * summed quantity on that invoice); min/avg/max are over the non-zero obs.
 * `qty_sum_sample` is the AC-36 Total `(tercatat di sampel terunggah)`.
 * `qty_lines_*` + `qty_missing_pct` back the AC-35 "qty terbaca dari X dari Y
 * baris" chip — these are LINE-level (a line with quantity=0 is "missing").
 */
export interface QtyStats {
  qty_min: number;
  qty_avg: number;
  qty_max: number;
  qty_sum_sample: number;
  qty_missing_pct: number;
  qty_lines_total: number;
  qty_lines_with: number;
}

interface RawCoverage {
  n_invoices: string;
  m_stores: string;
  k_areas: string;
  last_invoice_date: string | null;
}

interface RawPriceObs {
  sku_id: string;
  sku_name: string | null;
  sku_code: string | null;
  invoice_id: string;
  store_id: string | null;
  area_id: string | null;
  eff_date: string | null;
  region_name: string | null;
  supplier_name: string | null;
  unit_price: string;
  qty_obs: string;
  price_sum_obs: string;
  line_count: string;
  line_with_qty: string;
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
  qty_obs: string;
  line_count: string;
  line_with_qty: string;
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

interface RawTopNonTacoInvoice {
  invoice_id: string;
  store_name: string | null;
  region: string | null;
  invoice_date: string | null;
  taco_value: string;
  non_taco_value: string;
  qty_missing_lines: string;
  unknown_competitor_count: string;
}

interface RawCovRow {
  invoice_id: string;
  store_id: string | null;
  area_id: string | null;
  eff_date: string | null;
}

/**
 * TACO v2 — Market Intelligence service (the revamped `/taro/v2/analytics`,
 * KC's 4-section v3 layout).
 *
 * Read-only signals computed straight from the sampled distributor invoices —
 * every one framed honestly (presence/price/qty/frequency, never a market
 * total). Data sources only: `taro_v2_invoices` (status='done'),
 * `taro_v2_invoice_line_items`, `taco_skus`, `competitor_brands`, `regions`,
 * `taro_v2_stores`. No schema changes; supplier normalization at query time.
 *
 * Window semantics: the period filters on the invoice's TRANSACTION date
 * (`invoice_date`, falling back to `created_at::date` when unparsed) per PRD §8.
 *
 * Endpoint map (PRD §8 v3): coverage · top-skus-per-area (S1) ·
 * top-non-taco-invoices (S1, AC-31 value-dominance) · category-distribution /
 * category-monthly-trend / category-skus (S2) ·
 * price-bands + sku-price-history (S3, qty-extended) · sku-store-pricing (S3) ·
 * brand-bucket-distribution + brand-bucket-detail (S4).
 *
 * RETIRED in v3: `price-gap-pairs` (R3) + `sku-whitespace` (R4) — removed
 * cleanly; their AC-IDs (AC-10/11/20/21/22/23/24) do not return. R3's
 * price-comparison value is absorbed into brand-bucket-detail (AC-40).
 *
 * Bucket vocabulary (PRD §8 + AC-41), since v2 line items have NO `is_unknown`
 * column (that is v1-only): TACO = `matched_sku_id IS NOT NULL`; Kompetitor =
 * `brand_id IS NOT NULL` (resolved competitor brand); unknown-competitor =
 * `is_competitor = true AND brand_id IS NULL` (excluded from buckets, returned
 * as a footer count); Lain-lain = `matched_sku_id IS NULL AND brand_id IS NULL
 * AND is_competitor = false` — i.e. AC-41's `is_unknown = false` is faithfully
 * `is_competitor = false` here.
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

  /** Round a quantity to ≤3 decimals (quantity is numeric(18,3)). */
  private qtyRound(n: number): number {
    return Math.round(n * 1000) / 1000;
  }

  private median(sorted: number[]): number {
    const n = sorted.length;
    if (n === 0) return 0;
    const mid = Math.floor(n / 2);
    return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /** True for a canonical 8-4-4-4-12 hex UUID (guards sentinel brand ids). */
  private isUuid(v: string | undefined | null): v is string {
    return (
      typeof v === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    );
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
   * distributors; the invoice lists show the RAW `supplier_name` as captured.
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

  /**
   * Roll per-invoice qty observations into the AC-35/AC-36 QtyStats. Each obs is
   * one invoice: `qty` = the SKU's summed quantity on that invoice; `lines` /
   * `linesWith` are that invoice's contributing line counts. min/avg/max ignore
   * zero-qty observations; missing% is LINE-level.
   */
  private qtyStats(
    obs: Array<{ qty: number; lines: number; linesWith: number }>,
  ): QtyStats {
    const qtyVals = obs
      .map((o) => o.qty)
      .filter((q) => q > 0)
      .sort((a, b) => a - b);
    const linesTotal = obs.reduce((s, o) => s + o.lines, 0);
    const linesWith = obs.reduce((s, o) => s + o.linesWith, 0);
    const sum = obs.reduce((s, o) => s + o.qty, 0);
    const avg = qtyVals.length
      ? qtyVals.reduce((a, b) => a + b, 0) / qtyVals.length
      : 0;
    return {
      qty_min: this.qtyRound(qtyVals.length ? qtyVals[0] : 0),
      qty_avg: this.qtyRound(avg),
      qty_max: this.qtyRound(qtyVals.length ? qtyVals[qtyVals.length - 1] : 0),
      qty_sum_sample: this.qtyRound(sum),
      qty_missing_pct:
        linesTotal > 0
          ? Math.round(((linesTotal - linesWith) / linesTotal) * 1000) / 1000
          : 0,
      qty_lines_total: linesTotal,
      qty_lines_with: linesWith,
    };
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

  // ---- 2. price-bands (AC-4, AC-5, AC-6, AC-35, AC-36) ----------------------

  /**
   * Section 3 Laporan SKU. One row per matched SKU with ≥3 contributing
   * invoices, sorted by invoice-count desc. Each carries min/median/max
   * unit_price, the spread %, flagged outliers (AC-5), AND the v3 observed-qty
   * stats (AC-35/AC-36 — min/avg/max/Total + missing-data line counts).
   *
   * Server-side search (`q`, case-insensitive substring on SKU name/code) +
   * pagination (`page`/`page_size`, default 10). The coverage chip is computed
   * over ALL matched-SKU invoices in the period/area scope (AC-2) — it does NOT
   * narrow with the in-panel search box.
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
        .addSelect('MAX(sku.code)', 'sku_code')
        .addSelect('inv.id', 'invoice_id')
        .addSelect('inv.store_id', 'store_id')
        .addSelect('inv.area_id', 'area_id')
        .addSelect(`${this.EFF_DATE_STR}`, 'eff_date')
        .addSelect('MAX(area.name)', 'region_name')
        .addSelect('MAX(inv.supplier_name)', 'supplier_name')
        .addSelect('AVG(CAST(li.unit_price AS numeric))', 'unit_price')
        .addSelect('SUM(CAST(li.quantity AS numeric))', 'qty_obs')
        .addSelect(
          'SUM(CASE WHEN CAST(li.quantity AS numeric) > 0 THEN CAST(li.unit_price AS numeric) * CAST(li.quantity AS numeric) ELSE 0 END)',
          'price_sum_obs',
        )
        .addSelect('COUNT(*)', 'line_count')
        .addSelect(
          'SUM(CASE WHEN CAST(li.quantity AS numeric) > 0 THEN 1 ELSE 0 END)',
          'line_with_qty',
        )
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
      qty_obs: number;
      price_sum_obs: number;
      line_count: number;
      line_with_qty: number;
    }
    const bySku = new Map<
      string,
      { sku_name: string; sku_code: string | null; obs: Obs[] }
    >();
    for (const r of rows) {
      if (!bySku.has(r.sku_id)) {
        bySku.set(r.sku_id, {
          sku_name: r.sku_name ?? 'SKU Tidak Diketahui',
          sku_code: r.sku_code ?? null,
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
        qty_obs: this.num(r.qty_obs),
        price_sum_obs: this.num(r.price_sum_obs),
        line_count: this.num(r.line_count),
        line_with_qty: this.num(r.line_with_qty),
      });
    }

    // All qualifying bands (≥3 invoices), sorted by invoice-count desc.
    const allBands = Array.from(bySku.entries())
      .map(([sku_id, { sku_name, sku_code, obs }]) => {
        const nInvoices = new Set(obs.map((o) => o.invoice_id)).size;
        return { sku_id, sku_name, sku_code, obs, nInvoices };
      })
      .filter((b) => b.nInvoices >= 3)
      .sort(
        (a, b) =>
          b.nInvoices - a.nInvoices || a.sku_name.localeCompare(b.sku_name),
      );

    // Server-side search (AC-4) then pagination (AC-4, page_size=10).
    const filtered = allBands.filter((b) =>
      this.matchesQ(query.q, b.sku_name, b.sku_code),
    );
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
        sku_code: b.sku_code,
        n_invoices: b.nInvoices,
        p_min: Math.round(pMin),
        p_median: Math.round(pMed),
        p_max: Math.round(pMax),
        spread_pct: spreadPct,
        // AC-36 Total column: Σ(unit_price × qty) over sampled lines with qty
        // present (qty-missing lines excluded, same honest-qty rule as qty_sum).
        price_sum_sample: Math.round(
          b.obs.reduce((s, o) => s + o.price_sum_obs, 0),
        ),
        ...this.qtyStats(
          b.obs.map((o) => ({
            qty: o.qty_obs,
            lines: o.line_count,
            linesWith: o.line_with_qty,
          })),
        ),
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

  // ---- 3. sku-price-history (AC-7, AC-25, AC-26, AC-27, AC-35, AC-36) -------

  /**
   * Section 3 detail modal — the price/qty call. Returns the SKU's price trend
   * AND a parallel qty trend over time (one point per contributing invoice),
   * the price + qty min/avg/max/Total stats (AC-26), and the contributing
   * invoice list. The in-modal Area (`area`) + Store (`store_id`) filters narrow
   * everything in place (AC-27). Defaults are "Semua / Semua" (params omitted) —
   * the FE owns dropdown state and does NOT inherit the page filter (AC-25).
   *
   * One observation = one invoice: AVG unit_price + SUM quantity across that
   * SKU's lines on the invoice. Outlier direction is the same leave-one-out
   * ±25% price rule as AC-5.
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
        ...this.qtyStats([]),
        trend: [],
        qty_trend: [],
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
        .addSelect('SUM(CAST(li.quantity AS numeric))', 'qty_obs')
        .addSelect('COUNT(*)', 'line_count')
        .addSelect(
          'SUM(CASE WHEN CAST(li.quantity AS numeric) > 0 THEN 1 ELSE 0 END)',
          'line_with_qty',
        )
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
      quantity: this.qtyRound(this.num(r.qty_obs)),
      line_count: this.num(r.line_count),
      line_with_qty: this.num(r.line_with_qty),
      image_url: this.imageUrl(r.image_id),
      outlier_direction: dirs[i],
    }));

    const prices = obs.map((o) => o.unit_price);
    const pMin = prices.length ? Math.min(...prices) : 0;
    const pMax = prices.length ? Math.max(...prices) : 0;
    const pAvg = prices.length
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : 0;

    const qtyStats = this.qtyStats(
      obs.map((o) => ({
        qty: o.quantity,
        lines: o.line_count,
        linesWith: o.line_with_qty,
      })),
    );

    // Trend: oldest→newest (chart x-axis is time). Price + qty are parallel
    // arrays keyed by the same invoice/date so the FE plots a dual line (AC-26).
    const sortedAsc = [...obs].sort((a, b) =>
      (a.invoice_date ?? '').localeCompare(b.invoice_date ?? ''),
    );
    const trend = sortedAsc.map((o) => ({
      invoice_date: o.invoice_date,
      unit_price: o.unit_price,
      invoice_id: o.invoice_id,
      store_id: o.store_id,
      store_name: o.store_name,
      region_id: o.region_id,
      region_name: o.region_name,
      outlier_direction: o.outlier_direction,
    }));
    const qty_trend = sortedAsc.map((o) => ({
      invoice_date: o.invoice_date,
      quantity: o.quantity,
      invoice_id: o.invoice_id,
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
        quantity: o.quantity,
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
      ...qtyStats,
      trend,
      qty_trend,
      invoices,
    };
  }

  // ---- 4. top-skus-per-area (AC-19, AC-30) ---------------------------------

  /**
   * Section 1 Top-10 TACO card — per-region top SKUs by line-occurrence
   * frequency (presence, NOT volume). Restricted to matched SKUs (AC-19); the
   * canonical `taco_skus.name` is shown, never the raw OCR text. `top_n`
   * defaults to 5 (the FE requests 10 for a single selected area — AC-30).
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

  // ---- 5. top-non-taco-invoices (AC-31, REVISED 2026-06-15) -----------------

  /**
   * Section 1 card 4 — "Top 10 invoice paling dikuasai non-TACO (per nilai)".
   * Ranks uploaded invoices by the non-TACO share of their VALUE
   * (Σ unit_price × qty), descending. Per invoice:
   *   taco_value     = Σ over TACO lines (`matched_sku_id IS NOT NULL`)
   *   non_taco_value = Σ over Kompetitor (`brand_id IS NOT NULL`) + Lain-lain
   *                    (`matched_sku_id IS NULL AND brand_id IS NULL AND
   *                     is_competitor = false`) lines
   *   non_taco_share = non_taco_value / (taco_value + non_taco_value)
   *
   * Honest qty (AC-31): a value-relevant line whose quantity is missing (NULL or
   * ≤ 0) is EXCLUDED from the value sums and counted in `qty_missing_lines` —
   * never silently treated as qty=1. Unknown-competitor lines (`is_competitor =
   * true AND brand_id IS NULL`) are excluded from `non_taco_value` and surfaced
   * as `unknown_competitor_count` (AC-41 / AC-38.1). Invoices with no computable
   * value (total = 0) are dropped — they can't be ranked by value-dominance.
   * Sorted by `non_taco_share` desc, tiebreak `non_taco_value` desc; `top_n`
   * defaults to 10. No "market share / sales / pangsa pasar" framing — this is
   * per-invoice value composition only.
   */
  async topNonTacoInvoices(query: TopNonTacoInvoicesQueryDto) {
    const range = this.resolveRange(query.period);
    const topN = Math.min(
      Math.max(parseInt(query.top_n ?? '10', 10) || 10, 1),
      50,
    );

    const QTY = 'CAST(li.quantity AS numeric)';
    const PRICE = 'COALESCE(CAST(li.unit_price AS numeric), 0)';
    // Value-relevant = the three pie buckets (excludes unknown-competitor lines).
    const VALUE_REL =
      '(li.matched_sku_id IS NOT NULL OR li.brand_id IS NOT NULL OR (li.matched_sku_id IS NULL AND li.brand_id IS NULL AND li.is_competitor = false))';

    const raw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('taro_v2_stores', 'store', 'store.id = inv.store_id')
        .leftJoin('regions', 'area', 'area.id = inv.area_id')
        .select('inv.id', 'invoice_id')
        .addSelect('MAX(store.name)', 'store_name')
        .addSelect('MAX(area.name)', 'region')
        .addSelect(`MAX(${this.EFF_DATE_STR})`, 'invoice_date')
        .addSelect(
          `SUM(CASE WHEN li.matched_sku_id IS NOT NULL AND ${QTY} > 0 THEN ${PRICE} * ${QTY} ELSE 0 END)`,
          'taco_value',
        )
        .addSelect(
          `SUM(CASE WHEN (li.brand_id IS NOT NULL OR (li.matched_sku_id IS NULL AND li.brand_id IS NULL AND li.is_competitor = false)) AND ${QTY} > 0 THEN ${PRICE} * ${QTY} ELSE 0 END)`,
          'non_taco_value',
        )
        .addSelect(
          `SUM(CASE WHEN ${VALUE_REL} AND (${QTY} IS NULL OR ${QTY} <= 0) THEN 1 ELSE 0 END)`,
          'qty_missing_lines',
        )
        .addSelect(
          'SUM(CASE WHEN li.is_competitor = true AND li.brand_id IS NULL THEN 1 ELSE 0 END)',
          'unknown_competitor_count',
        ),
      range,
      query.area,
    )
      .groupBy('inv.id')
      .getRawMany<RawTopNonTacoInvoice>();

    const rows = raw
      .map((r) => {
        const taco_value = Math.round(this.num(r.taco_value));
        const non_taco_value = Math.round(this.num(r.non_taco_value));
        const total_value = taco_value + non_taco_value;
        return {
          invoice_id: r.invoice_id,
          store_name: r.store_name ?? null,
          region: r.region ?? null,
          invoice_date: r.invoice_date ?? null,
          taco_value,
          non_taco_value,
          total_value,
          taco_share: this.pct(taco_value, total_value),
          non_taco_share: this.pct(non_taco_value, total_value),
          qty_missing_lines: this.num(r.qty_missing_lines),
          unknown_competitor_count: this.num(r.unknown_competitor_count),
        };
      })
      .filter((r) => r.total_value > 0)
      .sort(
        (a, b) =>
          b.non_taco_share - a.non_taco_share ||
          b.non_taco_value - a.non_taco_value,
      )
      .slice(0, topN);

    return { period: range.label, rows };
  }

  // ---- 6. category-distribution (AC-32) ------------------------------------

  /**
   * Section 2 Komposisi kategori TACO pie. Per-category line-item counts of
   * matched-TACO lines grouped by `taco_skus.catalog_category` (NULL → "Tidak
   * terkategori"); each slice carries its absolute count + % OF TACO LINE ITEMS.
   * Categories are returned as they appear in the catalog (not a fixed list) so
   * any catalog value renders honestly.
   */
  async categoryDistribution(query: CategoryQueryDto) {
    const range = this.resolveRange(query.period);

    const raw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('li.matched_sku', 'sku')
        .select(
          `COALESCE(sku.catalog_category, '${UNCATEGORIZED}')`,
          'category',
        )
        .addSelect('COUNT(*)', 'n_lines')
        .where('li.matched_sku_id IS NOT NULL'),
      range,
      query.area,
    )
      .groupBy(`COALESCE(sku.catalog_category, '${UNCATEGORIZED}')`)
      .getRawMany<{ category: string; n_lines: string }>();

    const total = raw.reduce((s, r) => s + this.num(r.n_lines), 0);
    const categories = raw
      .map((r) => {
        const n = this.num(r.n_lines);
        return {
          category: r.category,
          n_lines: n,
          pct_of_taco_lines: this.pct(n, total),
        };
      })
      .sort((a, b) => b.n_lines - a.n_lines);

    return {
      period: range.label,
      coverage: await this.bucketCoverage(range, query.area, 'taco'),
      total_taco_lines: total,
      categories,
    };
  }

  // ---- 7. category-monthly-trend (AC-33) -----------------------------------

  /**
   * Section 2 Tren unggahan kategori line. One row per (month, category):
   * `invoice_count` = distinct uploaded invoices in that month containing ≥1
   * TACO line of that category. Honest framing: this tracks upload cadence, not
   * market dynamics (AC-33 sub-line is the FE's guardrail).
   */
  async categoryMonthlyTrend(query: CategoryQueryDto) {
    const range = this.resolveRange(query.period);

    const raw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('li.matched_sku', 'sku')
        .select(`to_char(${this.EFF_DATE}, 'YYYY-MM')`, 'month')
        .addSelect(
          `COALESCE(sku.catalog_category, '${UNCATEGORIZED}')`,
          'category',
        )
        .addSelect('COUNT(DISTINCT inv.id)', 'invoice_count')
        .where('li.matched_sku_id IS NOT NULL'),
      range,
      query.area,
    )
      .groupBy(`to_char(${this.EFF_DATE}, 'YYYY-MM')`)
      .addGroupBy(`COALESCE(sku.catalog_category, '${UNCATEGORIZED}')`)
      .getRawMany<{ month: string; category: string; invoice_count: string }>();

    const rows = raw
      .map((r) => ({
        month: r.month,
        category: r.category,
        invoice_count: this.num(r.invoice_count),
      }))
      .sort(
        (a, b) =>
          a.month.localeCompare(b.month) ||
          a.category.localeCompare(b.category),
      );

    const months = Array.from(new Set(rows.map((r) => r.month))).sort();
    const categories = Array.from(new Set(rows.map((r) => r.category))).sort();

    return {
      period: range.label,
      granularity: 'month' as const,
      months,
      categories,
      rows,
    };
  }

  // ---- 8. category-skus (AC-34) --------------------------------------------

  /**
   * Section 2 category drill — the matched TACO SKUs seen in `category` under
   * the current scope (canonical name + code + the finer `taco_skus.category`
   * enum for optional secondary grouping), sorted by N invoices desc (AC-34).
   */
  async categorySkus(query: CategorySkusQueryDto) {
    const range = this.resolveRange(query.period);
    const category = query.category ?? UNCATEGORIZED;
    const isUncat = category === UNCATEGORIZED;

    const qb = this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('li.matched_sku', 'sku')
        .select('li.matched_sku_id', 'sku_id')
        .addSelect('MAX(sku.name)', 'sku_name')
        .addSelect('MAX(sku.code)', 'sku_code')
        .addSelect('MAX(sku.category::text)', 'sub_category')
        .addSelect('COUNT(DISTINCT inv.id)', 'n_invoices')
        .where('li.matched_sku_id IS NOT NULL'),
      range,
      query.area,
    );
    if (isUncat) {
      qb.andWhere('sku.catalog_category IS NULL');
    } else {
      qb.andWhere('sku.catalog_category = :category', { category });
    }

    const raw = await qb.groupBy('li.matched_sku_id').getRawMany<{
      sku_id: string;
      sku_name: string | null;
      sku_code: string | null;
      sub_category: string | null;
      n_invoices: string;
    }>();

    const skus = raw
      .map((r) => ({
        sku_id: r.sku_id,
        sku_name: r.sku_name ?? 'SKU Tidak Diketahui',
        sku_code: r.sku_code ?? null,
        sub_category: r.sub_category ?? null,
        n_invoices: this.num(r.n_invoices),
      }))
      .sort(
        (a, b) =>
          b.n_invoices - a.n_invoices || a.sku_name.localeCompare(b.sku_name),
      );

    return { period: range.label, category, skus };
  }

  // ---- 9. sku-store-pricing (AC-37) ----------------------------------------

  /**
   * Section 3 per-store sub-section + store pricing history. Per `taro_v2_store`
   * that contributed to the SKU under scope: N invoices + min/avg/max unit_price
   * for that SKU at that store, plus a `history` time-series (one point per
   * invoice) for the store-pricing-history line. One observation = one invoice
   * (AVG unit_price across the SKU's lines on it).
   */
  async skuStorePricing(query: SkuStorePricingQueryDto) {
    const range = this.resolveRange(query.period);

    if (!query.sku_id) {
      return {
        period: range.label,
        sku_id: null,
        coverage: this.coverageOf([]),
        stores: [],
      };
    }

    const rows = await this.applyScope(
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
        .addSelect(
          `to_char(MAX(${this.EFF_DATE}), 'YYYY-MM-DD')`,
          'invoice_date',
        )
        .addSelect('AVG(CAST(li.unit_price AS numeric))', 'unit_price')
        .where('li.matched_sku_id = :sku_id', { sku_id: query.sku_id })
        .andWhere('CAST(li.unit_price AS numeric) > 0'),
      range,
      query.area,
    )
      .groupBy('inv.id')
      .addGroupBy('inv.store_id')
      .addGroupBy('inv.area_id')
      .getRawMany<{
        invoice_id: string;
        store_id: string | null;
        area_id: string | null;
        store_name: string | null;
        region_name: string | null;
        invoice_date: string | null;
        unit_price: string;
      }>();

    interface StoreAgg {
      store_id: string | null;
      store_name: string | null;
      region_name: string | null;
      prices: number[];
      history: Array<{
        invoice_date: string | null;
        unit_price: number;
        invoice_id: string;
      }>;
    }
    const byStore = new Map<string, StoreAgg>();
    for (const r of rows) {
      const key = r.store_id ?? '__none__';
      if (!byStore.has(key)) {
        byStore.set(key, {
          store_id: r.store_id,
          store_name: r.store_name ?? 'Toko Tidak Diketahui',
          region_name: r.region_name ?? null,
          prices: [],
          history: [],
        });
      }
      const s = byStore.get(key)!;
      const price = Math.round(this.num(r.unit_price));
      s.prices.push(price);
      s.history.push({
        invoice_date: r.invoice_date,
        unit_price: price,
        invoice_id: r.invoice_id,
      });
    }

    const stores = Array.from(byStore.values())
      .map((s) => {
        const sorted = [...s.prices].sort((a, b) => a - b);
        const avg = sorted.length
          ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
          : 0;
        return {
          store_id: s.store_id,
          store_name: s.store_name,
          region_name: s.region_name,
          n_invoices: s.history.length,
          p_min: sorted.length ? sorted[0] : 0,
          p_avg: avg,
          p_max: sorted.length ? sorted[sorted.length - 1] : 0,
          history: s.history.sort((a, b) =>
            (a.invoice_date ?? '').localeCompare(b.invoice_date ?? ''),
          ),
        };
      })
      .sort((a, b) => b.n_invoices - a.n_invoices);

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
      stores,
    };
  }

  // ---- 10. brand-bucket-distribution (AC-38, AC-41) ------------------------

  /**
   * Section 4 Komposisi merek pie. Line-item counts in the three slices
   * TACO / Kompetitor / Lain-lain, plus `unknown_competitor_count` for the
   * AC-41 footer. % is of TOTAL line items in scope — so the three slices sum to
   * <100% by exactly the unknown-competitor fraction (which sits in the footer,
   * not in a slice). See the class header for the bucket SQL.
   */
  async brandBucketDistribution(query: BrandBucketDistributionQueryDto) {
    const range = this.resolveRange(query.period);

    const raw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .select(
          'SUM(CASE WHEN li.matched_sku_id IS NOT NULL THEN 1 ELSE 0 END)',
          'taco',
        )
        .addSelect(
          'SUM(CASE WHEN li.brand_id IS NOT NULL THEN 1 ELSE 0 END)',
          'kompetitor',
        )
        .addSelect(
          'SUM(CASE WHEN li.matched_sku_id IS NULL AND li.brand_id IS NULL AND li.is_competitor = false THEN 1 ELSE 0 END)',
          'lain_lain',
        )
        .addSelect(
          'SUM(CASE WHEN li.is_competitor = true AND li.brand_id IS NULL THEN 1 ELSE 0 END)',
          'unknown_comp',
        )
        .addSelect('COUNT(*)', 'total'),
      range,
      query.area,
    ).getRawOne<{
      taco: string;
      kompetitor: string;
      lain_lain: string;
      unknown_comp: string;
      total: string;
    }>();

    const total = this.num(raw?.total);
    const mk = (bucket: string, n: number) => ({
      bucket,
      n_lines: n,
      pct: this.pct(n, total),
    });

    return {
      period: range.label,
      coverage: await this.bucketCoverage(range, query.area, 'all'),
      total_lines: total,
      buckets: [
        mk('taco', this.num(raw?.taco)),
        mk('kompetitor', this.num(raw?.kompetitor)),
        mk('lain_lain', this.num(raw?.lain_lain)),
      ],
      unknown_competitor_count: this.num(raw?.unknown_comp),
    };
  }

  // ---- 11. brand-bucket-detail (AC-39, AC-40) ------------------------------

  /**
   * Section 4 brand-bucket drill — one endpoint, three levels (see the DTO):
   *   level=brands    → the bucket's brand list (paginated) + unknown footer
   *   level=skus      → per-brand SKU list with Min·Avg·Maks price stats (AC-40,
   *                     absorbs the retired R3 value) + 3 sample invoice ids
   *   level=invoices  → the invoice list for that SKU (AC-39)
   * Price stats use one observation per invoice (AVG unit_price), matching the
   * Section 3 band math. `q` filters brand names (brands level) or SKU labels
   * (skus level). All paginated at page_size=10.
   */
  async brandBucketDetail(query: BrandBucketDetailQueryDto) {
    const range = this.resolveRange(query.period);
    const { page, pageSize } = this.resolvePage(query);

    // Level is driven by which params are present (see the DTO docblock).
    if (!query.brand_id) {
      return this.bucketBrands(query, range, page, pageSize);
    }
    if (!query.sku) {
      return this.bucketSkus(query, range, page, pageSize);
    }
    return this.bucketInvoices(query, range, page, pageSize);
  }

  /** brand-bucket-detail level 1 — the brand list for the bucket. */
  private async bucketBrands(
    query: BrandBucketDetailQueryDto,
    range: DateScope,
    page: number,
    pageSize: number,
  ) {
    const { bucket } = query;
    let rows: Array<{
      id: string;
      name: string;
      n_lines: number;
      n_invoices: number;
    }> = [];

    if (bucket === 'kompetitor') {
      const raw = await this.applyScope(
        this.lineItems
          .createQueryBuilder('li')
          .innerJoin('li.invoice', 'inv')
          .leftJoin('competitor_brands', 'brand', 'brand.id = li.brand_id')
          .select('li.brand_id', 'id')
          .addSelect('MAX(brand.name)', 'name')
          .addSelect('COUNT(*)', 'n_lines')
          .addSelect('COUNT(DISTINCT inv.id)', 'n_invoices')
          .where('li.brand_id IS NOT NULL'),
        range,
        query.area,
      )
        .groupBy('li.brand_id')
        .getRawMany<{
          id: string;
          name: string | null;
          n_lines: string;
          n_invoices: string;
        }>();
      rows = raw.map((r) => ({
        id: r.id,
        name: r.name ?? 'Merek Kompetitor',
        n_lines: this.num(r.n_lines),
        n_invoices: this.num(r.n_invoices),
      }));
    } else {
      // taco / lain_lain collapse to a single pseudo-brand row.
      const where =
        bucket === 'taco'
          ? 'li.matched_sku_id IS NOT NULL'
          : 'li.matched_sku_id IS NULL AND li.brand_id IS NULL AND li.is_competitor = false';
      const raw = await this.applyScope(
        this.lineItems
          .createQueryBuilder('li')
          .innerJoin('li.invoice', 'inv')
          .select('COUNT(*)', 'n_lines')
          .addSelect('COUNT(DISTINCT inv.id)', 'n_invoices')
          .where(where),
        range,
        query.area,
      ).getRawOne<{ n_lines: string; n_invoices: string }>();
      const n_lines = this.num(raw?.n_lines);
      if (n_lines > 0) {
        rows = [
          {
            id: bucket === 'taco' ? TACO_BRAND : LAIN_LAIN_BRAND,
            name: bucket === 'taco' ? 'TACO' : 'Lain-lain',
            n_lines,
            n_invoices: this.num(raw?.n_invoices),
          },
        ];
      }
    }

    const filtered = rows
      .filter((r) => this.matchesQ(query.q, r.name))
      .sort((a, b) => b.n_invoices - a.n_invoices || b.n_lines - a.n_lines);
    const total = filtered.length;
    const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

    return {
      period: range.label,
      level: 'brands' as const,
      bucket,
      coverage: await this.bucketCoverage(range, query.area, bucket),
      unknown_competitor_count: await this.unknownCompetitorCount(
        range,
        query.area,
      ),
      rows: pageRows,
      pagination: { page, page_size: pageSize, total },
    };
  }

  /** brand-bucket-detail level 2 — the SKU list (with price stats) for a brand. */
  private async bucketSkus(
    query: BrandBucketDetailQueryDto,
    range: DateScope,
    page: number,
    pageSize: number,
  ) {
    const { bucket, brand_id } = query;

    // label/key are sku.name+sku_id for TACO; raw_text for competitor/lain-lain.
    const qb = this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('li.matched_sku', 'sku')
        .select('inv.id', 'invoice_id')
        .addSelect('AVG(CAST(li.unit_price AS numeric))', 'unit_price'),
      range,
      query.area,
    );

    if (bucket === 'taco') {
      qb.addSelect('li.matched_sku_id', 'key')
        .addSelect('MAX(sku.name)', 'label')
        .where('li.matched_sku_id IS NOT NULL')
        .groupBy('li.matched_sku_id')
        .addGroupBy('inv.id');
    } else if (bucket === 'kompetitor') {
      if (!this.isUuid(brand_id)) {
        return this.emptySkus(query, range, page, pageSize);
      }
      qb.addSelect('li.raw_text', 'key')
        .addSelect('li.raw_text', 'label')
        .where('li.brand_id = :brand_id', { brand_id })
        .groupBy('li.raw_text')
        .addGroupBy('inv.id');
    } else {
      qb.addSelect('li.raw_text', 'key')
        .addSelect('li.raw_text', 'label')
        .where(
          'li.matched_sku_id IS NULL AND li.brand_id IS NULL AND li.is_competitor = false',
        )
        .groupBy('li.raw_text')
        .addGroupBy('inv.id');
    }

    const raw = await qb.getRawMany<{
      invoice_id: string;
      key: string | null;
      label: string | null;
      unit_price: string;
    }>();

    interface SkuAgg {
      key: string;
      label: string;
      invoices: Set<string>;
      prices: number[];
    }
    const bySku = new Map<string, SkuAgg>();
    for (const r of raw) {
      const key = r.key ?? '∅';
      if (!bySku.has(key)) {
        bySku.set(key, {
          key,
          label: (r.label ?? key).trim() || key,
          invoices: new Set<string>(),
          prices: [],
        });
      }
      const s = bySku.get(key)!;
      s.invoices.add(r.invoice_id);
      const p = this.num(r.unit_price);
      if (p > 0) s.prices.push(p);
    }

    const allRows = Array.from(bySku.values())
      .map((s) => {
        const sorted = [...s.prices].sort((a, b) => a - b);
        const avg = sorted.length
          ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
          : 0;
        return {
          key: s.key,
          label: s.label,
          n_invoices: s.invoices.size,
          p_min: sorted.length ? Math.round(sorted[0]) : 0,
          p_avg: avg,
          p_max: sorted.length ? Math.round(sorted[sorted.length - 1]) : 0,
          sample_invoice_ids: Array.from(s.invoices).slice(0, 3),
        };
      })
      .filter((r) => this.matchesQ(query.q, r.label))
      .sort(
        (a, b) => b.n_invoices - a.n_invoices || a.label.localeCompare(b.label),
      );

    const total = allRows.length;
    const pageRows = allRows.slice((page - 1) * pageSize, page * pageSize);

    return {
      period: range.label,
      level: 'skus' as const,
      bucket,
      brand_id: brand_id ?? null,
      coverage: await this.bucketCoverage(range, query.area, bucket),
      rows: pageRows,
      pagination: { page, page_size: pageSize, total },
    };
  }

  private emptySkus(
    query: BrandBucketDetailQueryDto,
    range: DateScope,
    page: number,
    pageSize: number,
  ) {
    return {
      period: range.label,
      level: 'skus' as const,
      bucket: query.bucket,
      brand_id: query.brand_id ?? null,
      coverage: this.coverageOf([]),
      rows: [],
      pagination: { page, page_size: pageSize, total: 0 },
    };
  }

  /** brand-bucket-detail level 3 — the invoice list for one SKU. */
  private async bucketInvoices(
    query: BrandBucketDetailQueryDto,
    range: DateScope,
    page: number,
    pageSize: number,
  ) {
    const { bucket, brand_id, sku } = query;

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
        .addSelect(this.IMAGE_ID_SUBQUERY, 'image_id'),
      range,
      query.area,
    )
      .groupBy('inv.id')
      .addGroupBy('inv.store_id')
      .addGroupBy('inv.area_id');

    if (bucket === 'taco') {
      if (!this.isUuid(sku))
        return this.emptyInvoices(query, range, page, pageSize);
      qb.where('li.matched_sku_id = :sku', { sku });
    } else if (bucket === 'kompetitor') {
      if (!this.isUuid(brand_id)) {
        return this.emptyInvoices(query, range, page, pageSize);
      }
      qb.where('li.brand_id = :brand_id', { brand_id }).andWhere(
        'li.raw_text = :sku',
        { sku },
      );
    } else {
      qb.where(
        'li.matched_sku_id IS NULL AND li.brand_id IS NULL AND li.is_competitor = false',
      ).andWhere('li.raw_text = :sku', { sku });
    }

    const raw = await qb.getRawMany<RawHistoryObs>();

    const all = raw
      .map((r) => ({
        invoice_id: r.invoice_id,
        store_id: r.store_id,
        area_id: r.area_id,
        store_name: r.store_name ?? null,
        region_name: r.region_name ?? null,
        supplier_name: r.supplier_name ?? null,
        invoice_date: r.invoice_date ?? null,
        unit_price: Math.round(this.num(r.unit_price)),
        image_url: this.imageUrl(r.image_id),
      }))
      .sort((a, b) =>
        (b.invoice_date ?? '').localeCompare(a.invoice_date ?? ''),
      );

    const total = all.length;
    const pageRows = all.slice((page - 1) * pageSize, page * pageSize);

    return {
      period: range.label,
      level: 'invoices' as const,
      bucket,
      brand_id: brand_id ?? null,
      sku: sku ?? null,
      coverage: this.coverageOf(
        all.map((r) => ({
          invoice_id: r.invoice_id,
          store_id: r.store_id,
          area_id: r.area_id,
          eff_date: r.invoice_date,
        })),
      ),
      rows: pageRows.map((r) => ({
        invoice_id: r.invoice_id,
        store_name: r.store_name,
        region_name: r.region_name,
        supplier_name: r.supplier_name,
        invoice_date: r.invoice_date,
        unit_price: r.unit_price,
        image_url: r.image_url,
      })),
      pagination: { page, page_size: pageSize, total },
    };
  }

  private emptyInvoices(
    query: BrandBucketDetailQueryDto,
    range: DateScope,
    page: number,
    pageSize: number,
  ) {
    return {
      period: range.label,
      level: 'invoices' as const,
      bucket: query.bucket,
      brand_id: query.brand_id ?? null,
      sku: query.sku ?? null,
      coverage: this.coverageOf([]),
      rows: [],
      pagination: { page, page_size: pageSize, total: 0 },
    };
  }

  // ---- shared bucket helpers -----------------------------------------------

  /** Coverage over the invoices contributing to a bucket ('all' = every line). */
  private async bucketCoverage(
    range: DateScope,
    area: string | undefined,
    bucket: 'all' | 'taco' | 'kompetitor' | 'lain_lain',
  ): Promise<Coverage> {
    const qb = this.applyScope(
      this.invoices
        .createQueryBuilder('inv')
        .select('inv.id', 'invoice_id')
        .addSelect('inv.store_id', 'store_id')
        .addSelect('inv.area_id', 'area_id')
        .addSelect(`${this.EFF_DATE_STR}`, 'eff_date'),
      range,
      area,
    );

    const pred: Record<typeof bucket, string | null> = {
      all: null,
      taco: 'li.matched_sku_id IS NOT NULL',
      kompetitor: 'li.brand_id IS NOT NULL',
      lain_lain:
        'li.matched_sku_id IS NULL AND li.brand_id IS NULL AND li.is_competitor = false',
    };
    const linePred = pred[bucket];
    if (linePred) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM taro_v2_invoice_line_items li WHERE li.invoice_id = inv.id AND ${linePred})`,
      );
    }

    const rows = await qb.getRawMany<RawCovRow>();
    return this.coverageOf(rows);
  }

  /** Unknown-competitor line count in scope (AC-41 footer). */
  private async unknownCompetitorCount(
    range: DateScope,
    area: string | undefined,
  ): Promise<number> {
    const raw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .select('COUNT(*)', 'cnt')
        .where('li.is_competitor = true')
        .andWhere('li.brand_id IS NULL'),
      range,
      area,
    ).getRawOne<{ cnt: string }>();
    return this.num(raw?.cnt);
  }
}
