import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { InvoiceLineItemV2 } from '../../database/entities/v2/invoice-line-item-v2.entity';
import { InvoiceV2 } from '../../database/entities/v2/invoice-v2.entity';
import { V2Period } from '../dto/period.dto';
import {
  DemandMixQueryDto,
  MarketIntelQueryDto,
  PriceBandsQueryDto,
  SkuEvidenceQueryDto,
} from './dto/market-intel.dto';

/**
 * Outlier threshold (AC-5): an invoice's unit_price is flagged when it sits
 * ≥25% away from the median of the OTHER contributing invoices for that SKU.
 * Single constant per PRD §11 — tune here if Demo Day shows it's noisy.
 */
const OUTLIER_THRESHOLD = 0.25;

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

interface RawEvidence {
  invoice_id: string;
  store_name: string | null;
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

interface RawBasketInvoice {
  has_taco: boolean;
  has_comp: boolean;
  has_unknown_comp: boolean;
}

interface RawBrand {
  brand_id: string;
  brand_name: string | null;
  n_invoices: string;
}

interface RawDistInvoice {
  invoice_id: string;
  store_id: string | null;
  area_id: string | null;
  supplier_name: string | null;
  eff_date: string | null;
  invoice_value: string;
}

/**
 * TACO v2 — Market Intelligence service (the revamped `/taro/v2/analytics`).
 *
 * Six read-only signals computed straight from the sampled distributor
 * invoices — every one framed honestly (presence/price/frequency, never a
 * market total). Data sources only: `taro_v2_invoices` (status='done'),
 * `taro_v2_invoice_line_items`, `taco_skus`, `competitor_brands`, `regions`.
 * No schema changes; supplier normalization happens at query time.
 *
 * Window semantics: the period filters on the invoice's TRANSACTION date
 * (`invoice_date`, falling back to `created_at::date` when unparsed) per PRD
 * §8 — these are market signals about when a deal happened.
 */
@Injectable()
export class MarketIntelService {
  constructor(
    @InjectRepository(InvoiceLineItemV2)
    private readonly lineItems: Repository<InvoiceLineItemV2>,
    @InjectRepository(InvoiceV2)
    private readonly invoices: Repository<InvoiceV2>,
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

  /** YYYY-MM-DD in the server's local frame (matches the `date` column). */
  private dateOnly(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /**
   * `normalize_supplier(raw)` (PRD §8): lower-case, strip a leading Indonesian
   * honorific (`PT`/`CV`/`H.`/`HPLG` and common kin, optional trailing dot),
   * collapse whitespace. Used to GROUP distributors; the raw form is shown in
   * the drill-down so a manager can spot a normalization collision.
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
        .addSelect(`to_char(MAX(${this.EFF_DATE}), 'YYYY-MM-DD')`, 'last_invoice_date'),
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
   * Per-SKU real-price bands (Peta Harga Nyata). One row per matched SKU with
   * ≥3 contributing invoices, sorted by invoice-count desc, capped at `limit`
   * (default 10). Each carries min/median/max unit_price, the spread %, and the
   * flagged outlier invoices (≥25% off the median-of-others).
   */
  async priceBands(query: PriceBandsQueryDto) {
    const range = this.resolveRange(query.period);
    const limit = Math.min(
      Math.max(parseInt(query.limit ?? '10', 10) || 10, 1),
      50,
    );

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

    const bands = Array.from(bySku.entries())
      .map(([sku_id, { sku_name, obs }]) => {
        const nInvoices = new Set(obs.map((o) => o.invoice_id)).size;
        return { sku_id, sku_name, obs, nInvoices };
      })
      .filter((b) => b.nInvoices >= 3)
      .sort((a, b) => b.nInvoices - a.nInvoices)
      .slice(0, limit)
      .map((b) => {
        const prices = b.obs.map((o) => o.unit_price).sort((x, y) => x - y);
        const pMin = prices[0];
        const pMax = prices[prices.length - 1];
        const pMed = this.median(prices);
        const spreadPct =
          pMed > 0 ? Math.round(((pMax - pMin) / pMed) * 1000) / 10 : 0;

        // Outliers (AC-5): leave-one-out median-of-others, ±25%.
        const outliers = b.obs
          .map((o) => {
            const others = b.obs
              .filter((x) => x !== o)
              .map((x) => x.unit_price)
              .sort((x, y) => x - y);
            if (others.length === 0) return null;
            const medOthers = this.median(others);
            if (medOthers <= 0) return null;
            let direction: 'above' | 'below' | null = null;
            if (o.unit_price >= medOthers * (1 + OUTLIER_THRESHOLD))
              direction = 'above';
            else if (o.unit_price <= medOthers * (1 - OUTLIER_THRESHOLD))
              direction = 'below';
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

    return {
      period: range.label,
      coverage: this.coverageOf(rows.map((r) => ({ ...r }))),
      price_bands: bands,
    };
  }

  // ---- 3. sku-evidence (AC-7) ----------------------------------------------

  /** Every invoice contributing to one SKU's band, newest-first. */
  async skuEvidence(query: SkuEvidenceQueryDto) {
    const range = this.resolveRange(query.period);
    if (!query.sku_id) {
      return {
        period: range.label,
        sku_id: null,
        coverage: this.coverageOf([]),
        evidence: [],
      };
    }

    const rows = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('regions', 'area', 'area.id = inv.area_id')
        .leftJoin('taro_v2_stores', 'store', 'store.id = inv.store_id')
        .leftJoin(
          'taro_v2_invoice_images',
          'img',
          "img.invoice_id = inv.id AND img.validation_status = 'valid'",
        )
        .select('inv.id', 'invoice_id')
        .addSelect('MAX(store.name)', 'store_name')
        .addSelect('MAX(area.name)', 'region_name')
        .addSelect('MAX(inv.supplier_name)', 'supplier_name')
        .addSelect(`to_char(MAX(${this.EFF_DATE}), 'YYYY-MM-DD')`, 'invoice_date')
        .addSelect('AVG(CAST(li.unit_price AS numeric))', 'unit_price')
        .addSelect('MIN(img.id::text)', 'image_id')
        .addSelect('inv.store_id', 'store_id')
        .addSelect('inv.area_id', 'area_id')
        .where('li.matched_sku_id = :sku_id', { sku_id: query.sku_id }),
      range,
      query.area,
    )
      .groupBy('inv.id')
      .addGroupBy('inv.store_id')
      .addGroupBy('inv.area_id')
      .orderBy('invoice_date', 'DESC')
      .getRawMany<
        RawEvidence & { store_id: string | null; area_id: string | null }
      >();

    const evidence = rows.map((r) => ({
      invoice_id: r.invoice_id,
      store_name: r.store_name ?? null,
      region_name: r.region_name ?? null,
      supplier_name: r.supplier_name ?? null,
      invoice_date: r.invoice_date ?? null,
      unit_price: Math.round(this.num(r.unit_price)),
      image_url: r.image_id
        ? `/api/v2/invoice-images/${r.image_id}/image`
        : null,
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
      evidence,
    };
  }

  // ---- 4. demand-mix (AC-8, AC-9) ------------------------------------------

  /** Per-region top SKUs by line-occurrence frequency (presence, not volume). */
  async demandMix(query: DemandMixQueryDto) {
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

  // ---- 5. competitor-basket (AC-10, AC-11) ---------------------------------

  /**
   * Per-invoice co-occurrence of TACO + a competitor (share-of-basket, NOT
   * market share). Headline counts any competitor (incl. unknown); the named
   * brand rows list only resolved brands (brand_id NOT NULL) per AC-11.
   */
  async competitorBasket(query: MarketIntelQueryDto) {
    const range = this.resolveRange(query.period);

    // Denominator = page coverage (all done invoices in scope).
    const page = await this.coverage(query);
    const cov: Coverage = {
      n_invoices: page.n_invoices,
      m_stores: page.m_stores,
      k_areas: page.k_areas,
      last_invoice_date: page.last_invoice_date,
    };

    // Per-invoice presence flags.
    const invRows = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .select('inv.id', 'invoice_id')
        .addSelect('bool_or(li.matched_sku_id IS NOT NULL)', 'has_taco')
        .addSelect('bool_or(li.is_competitor = true)', 'has_comp')
        .addSelect(
          'bool_or(li.is_competitor = true AND li.brand_id IS NULL)',
          'has_unknown_comp',
        ),
      range,
      query.area,
    )
      .groupBy('inv.id')
      .getRawMany<RawBasketInvoice & { invoice_id: string }>();

    let nWith = 0;
    let nUnknown = 0;
    for (const r of invRows) {
      if (r.has_taco && r.has_comp) nWith += 1;
      if (r.has_taco && r.has_unknown_comp) nUnknown += 1;
    }

    // Resolved brands co-occurring with a TACO line, by distinct-invoice count.
    const brandRows = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .innerJoin('competitor_brands', 'brand', 'brand.id = li.brand_id')
        .select('li.brand_id', 'brand_id')
        .addSelect('MAX(brand.name)', 'brand_name')
        .addSelect('COUNT(DISTINCT inv.id)', 'n_invoices')
        .where('li.is_competitor = true')
        .andWhere('li.brand_id IS NOT NULL')
        .andWhere(
          'EXISTS (SELECT 1 FROM taro_v2_invoice_line_items t WHERE t.invoice_id = inv.id AND t.matched_sku_id IS NOT NULL)',
        ),
      range,
      query.area,
    )
      .groupBy('li.brand_id')
      .orderBy('n_invoices', 'DESC')
      .limit(10)
      .getRawMany<RawBrand>();

    return {
      period: range.label,
      coverage: cov,
      n_invoices: cov.n_invoices,
      n_with_taco_and_competitor: nWith,
      co_occurrence_pct: this.pct(nWith, cov.n_invoices),
      n_with_unknown_competitor: nUnknown,
      top_brands: brandRows.map((b) => ({
        brand_id: b.brand_id,
        brand_name: b.brand_name ?? 'Merek Tidak Diketahui',
        n_invoices: this.num(b.n_invoices),
      })),
    };
  }

  // ---- 6. distributor-performance (AC-16, AC-17) ---------------------------

  /**
   * Per normalized distributor: # sampled invoices, avg invoice value, last
   * seen. Grouped by `normalize_supplier`; the raw form is returned as a sample
   * for the hover tooltip. Sorted n_invoices desc, then last_invoice_date desc.
   */
  async distributorPerformance(query: MarketIntelQueryDto) {
    const range = this.resolveRange(query.period);

    const rows = await this.applyScope(
      this.invoices
        .createQueryBuilder('inv')
        .leftJoin('taro_v2_invoice_line_items', 'li', 'li.invoice_id = inv.id')
        .select('inv.id', 'invoice_id')
        .addSelect('inv.store_id', 'store_id')
        .addSelect('inv.area_id', 'area_id')
        .addSelect('MAX(inv.supplier_name)', 'supplier_name')
        .addSelect(`to_char(MAX(${this.EFF_DATE}), 'YYYY-MM-DD')`, 'eff_date')
        .addSelect(
          'COALESCE(SUM(CAST(li.total_price AS numeric)), 0)',
          'invoice_value',
        ),
      range,
      query.area,
    )
      .groupBy('inv.id')
      .addGroupBy('inv.store_id')
      .addGroupBy('inv.area_id')
      .getRawMany<RawDistInvoice>();

    interface Group {
      normalized: string;
      raw_sample: string;
      raw_sample_date: string;
      n_invoices: number;
      total_value: number;
      last_invoice_date: string | null;
    }
    const groups = new Map<string, Group>();
    for (const r of rows) {
      const normalized = this.normalizeSupplier(r.supplier_name);
      if (!normalized) continue; // no honest distributor name → not a row
      const eff = r.eff_date ?? '';
      const g = groups.get(normalized) ?? {
        normalized,
        raw_sample: r.supplier_name ?? normalized,
        raw_sample_date: eff,
        n_invoices: 0,
        total_value: 0,
        last_invoice_date: null,
      };
      g.n_invoices += 1;
      g.total_value += this.num(r.invoice_value);
      if (
        r.eff_date &&
        (g.last_invoice_date === null || r.eff_date > g.last_invoice_date)
      ) {
        g.last_invoice_date = r.eff_date;
      }
      // raw sample from the most-recent invoice in the group
      if (r.supplier_name && eff >= g.raw_sample_date) {
        g.raw_sample = r.supplier_name;
        g.raw_sample_date = eff;
      }
      groups.set(normalized, g);
    }

    const distributors = Array.from(groups.values())
      .map((g) => ({
        supplier_name_normalized: g.normalized,
        supplier_name_raw_sample: g.raw_sample,
        n_invoices: g.n_invoices,
        avg_invoice_value:
          g.n_invoices > 0 ? Math.round(g.total_value / g.n_invoices) : 0,
        last_invoice_date: g.last_invoice_date,
      }))
      .sort(
        (a, b) =>
          b.n_invoices - a.n_invoices ||
          (b.last_invoice_date ?? '').localeCompare(a.last_invoice_date ?? ''),
      );

    return {
      period: range.label,
      coverage: this.coverageOf(
        rows.map((r) => ({
          invoice_id: r.invoice_id,
          store_id: r.store_id,
          area_id: r.area_id,
          eff_date: r.eff_date,
        })),
      ),
      distributors,
    };
  }
}
