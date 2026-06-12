import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { InvoiceLineItemV2 } from '../../database/entities/v2/invoice-line-item-v2.entity';
import { InvoiceV2 } from '../../database/entities/v2/invoice-v2.entity';
import { StoreV2 } from '../../database/entities/v2/store-v2.entity';
import { TacoSku } from '../../database/entities/taco-sku.entity';
import { AnalyticsQueryDto, AnalyticsDrillQueryDto, V2Period } from '../dto/period.dto';

interface DateRange {
  from: Date | null;
  to: Date;
  priorFrom: Date | null;
  priorTo: Date | null;
  label: V2Period;
  /** 'week' if period ≤ 30d, 'month' otherwise. */
  bucket: 'week' | 'month';
}

// Raw shapes -----------------------------------------------------------------

interface RawShare {
  area_id: string | null;
  area_name: string | null;
  // value-based
  taco_value: string;
  total_value: string;
  // qty-based
  taco_qty: string;
  total_qty: string;
  // frequency-based (invoice level)
  taco_invoice_count: string;
  total_invoice_count: string;
  // extras
  competitor_value: string;
  unresolved_count: string;
  invoice_count: string;
  taco_sku_count: string;
}

interface RawTrend {
  area_id: string | null;
  area_name: string | null;
  bucket: string;
  taco_value: string;
  total_value: string;
}

interface RawSkuRow {
  sku_id: string;
  sku_name: string;
  catalog_category: string | null;
  total_value: string;
  total_qty: string;
  store_count: string;
  invoice_count: string;
}

interface RawCompetitorBrand {
  area_id: string | null;
  area_name: string | null;
  brand_name: string | null;
  brand_value: string;
  total_value: string;
}

interface RawKpi {
  invoice_count: string;
  taco_value: string;
  total_value: string;
  competitor_value: string;
  unresolved_count: string;
}

interface RawStoreRow {
  store_id: string;
  store_name: string;
  invoice_count: string;
  taco_value: string;
  total_value: string;
  top_sku_name: string | null;
}

/**
 * TACO v2 — Management Analytics service.
 *
 * All time filtering uses `created_at` (upload date) per locked Decision 3.
 * TACO = `matched_sku_id IS NOT NULL` per locked Decision 4.
 */
@Injectable()
export class V2AnalyticsService {
  constructor(
    @InjectRepository(InvoiceLineItemV2)
    private readonly lineItems: Repository<InvoiceLineItemV2>,
    @InjectRepository(InvoiceV2)
    private readonly invoices: Repository<InvoiceV2>,
    @InjectRepository(StoreV2)
    private readonly stores: Repository<StoreV2>,
    @InjectRepository(TacoSku)
    private readonly skus: Repository<TacoSku>,
  ) {}

  // ---- helpers ---------------------------------------------------------------

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

  private toLocalNaive(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
      `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
  }

  private resolveRange(period?: V2Period): DateRange {
    const to = new Date();
    const label: V2Period = period ?? '30d';

    let from: Date | null;
    let priorFrom: Date | null = null;
    let priorTo: Date | null = null;

    switch (label) {
      case '7d':
        from = new Date(to.getTime() - 7 * 864e5);
        priorFrom = new Date(to.getTime() - 14 * 864e5);
        priorTo = from;
        break;
      case '30d':
        from = new Date(to.getTime() - 30 * 864e5);
        priorFrom = new Date(to.getTime() - 60 * 864e5);
        priorTo = from;
        break;
      case '90d':
        from = new Date(to.getTime() - 90 * 864e5);
        priorFrom = new Date(to.getTime() - 180 * 864e5);
        priorTo = from;
        break;
      case 'this_month':
        from = new Date(to.getFullYear(), to.getMonth(), 1);
        priorFrom = new Date(to.getFullYear(), to.getMonth() - 1, 1);
        priorTo = from;
        break;
      case 'last_month':
        from = new Date(to.getFullYear(), to.getMonth() - 1, 1);
        priorFrom = new Date(to.getFullYear(), to.getMonth() - 2, 1);
        priorTo = from;
        to.setMonth(to.getMonth(), 0); // end of last month
        break;
      case 'this_quarter': {
        const qStart = Math.floor(to.getMonth() / 3) * 3;
        from = new Date(to.getFullYear(), qStart, 1);
        priorFrom = new Date(to.getFullYear(), qStart - 3, 1);
        priorTo = from;
        break;
      }
      case 'ytd':
        from = new Date(to.getFullYear(), 0, 1);
        priorFrom = new Date(to.getFullYear() - 1, 0, 1);
        priorTo = from;
        break;
      case 'all':
      default:
        from = null;
    }

    const daysSpan = from
      ? Math.round((to.getTime() - from.getTime()) / 864e5)
      : 365;

    return {
      from,
      to,
      priorFrom,
      priorTo,
      label,
      bucket: daysSpan <= 30 ? 'week' : 'month',
    };
  }

  /** Apply created_at window + optional area UUID filter to a line-item QBuilder. */
  private applyScope<T extends import('typeorm').ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    range: DateRange,
    area?: string | string[],
  ): SelectQueryBuilder<T> {
    if (range.from) {
      qb.andWhere('inv.created_at >= :from', {
        from: this.toLocalNaive(range.from),
      });
    }
    qb.andWhere('inv.created_at < :to', { to: this.toLocalNaive(range.to) });
    if (area) {
      const areaArr = Array.isArray(area) ? area : [area];
      if (areaArr.length === 1) {
        qb.andWhere('inv.area_id = :area', { area: areaArr[0] });
      } else if (areaArr.length > 1) {
        qb.andWhere('inv.area_id IN (:...areas)', { areas: areaArr });
      }
    }
    return qb;
  }

  /** Same scope helpers but for a prior window. */
  private applyPriorScope<T extends import('typeorm').ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    range: DateRange,
    area?: string | string[],
  ): SelectQueryBuilder<T> {
    if (range.priorFrom) {
      qb.andWhere('inv.created_at >= :pFrom', {
        pFrom: this.toLocalNaive(range.priorFrom),
      });
    }
    if (range.priorTo) {
      qb.andWhere('inv.created_at < :pTo', {
        pTo: this.toLocalNaive(range.priorTo),
      });
    }
    if (area) {
      const areaArr = Array.isArray(area) ? area : [area];
      if (areaArr.length === 1) {
        qb.andWhere('inv.area_id = :area', { area: areaArr[0] });
      } else if (areaArr.length > 1) {
        qb.andWhere('inv.area_id IN (:...areas)', { areas: areaArr });
      }
    }
    return qb;
  }

  /** Build the base line-item QBuilder with invoice + area joins. */
  private baseQb() {
    return this.lineItems
      .createQueryBuilder('li')
      .innerJoin('li.invoice', 'inv')
      .leftJoin('regions', 'area', 'area.id = inv.area_id');
  }

  /** Compute per-area KPIs for a given scope. */
  private async shareRows(range: DateRange, area?: string | string[]) {
    const raw = await this.applyScope(
      this.baseQb()
        .select('inv.area_id', 'area_id')
        .addSelect('MAX(area.name)', 'area_name')
        // value-based TACO share
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.matched_sku_id IS NOT NULL THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
          'taco_value',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.total_price IS NOT NULL AND CAST(li.total_price AS numeric) > 0 THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
          'total_value',
        )
        // qty-based TACO share
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.matched_sku_id IS NOT NULL THEN CAST(li.quantity AS numeric) ELSE 0 END), 0)',
          'taco_qty',
        )
        .addSelect(
          'COALESCE(SUM(CAST(li.quantity AS numeric)), 0)',
          'total_qty',
        )
        // frequency: invoices that contain ≥1 confirmed TACO line / all invoices
        .addSelect(
          'COUNT(DISTINCT CASE WHEN li.matched_sku_id IS NOT NULL THEN inv.id END)',
          'taco_invoice_count',
        )
        .addSelect('COUNT(DISTINCT inv.id)', 'total_invoice_count')
        // competitor
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.is_competitor = true THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
          'competitor_value',
        )
        // unresolved (needs_review=true)
        .addSelect(
          'COUNT(CASE WHEN li.needs_review = true THEN 1 END)',
          'unresolved_count',
        )
        // invoice count + SKU count for header strip
        .addSelect('COUNT(DISTINCT inv.id)', 'invoice_count')
        .addSelect(
          'COUNT(DISTINCT li.matched_sku_id) FILTER (WHERE li.matched_sku_id IS NOT NULL)',
          'taco_sku_count',
        ),
      range,
      area,
    )
      .groupBy('inv.area_id')
      .orderBy('MAX(area.name)', 'ASC')
      .getRawMany<RawShare>();

    return raw.map((r) => {
      const tacoValue = this.num(r.taco_value);
      const totalValue = this.num(r.total_value);
      const tacoQty = this.num(r.taco_qty);
      const totalQty = this.num(r.total_qty);
      const tacoInvCount = this.num(r.taco_invoice_count);
      const totalInvCount = this.num(r.total_invoice_count);
      const competitorValue = this.num(r.competitor_value);
      return {
        area_id: r.area_id ?? null,
        area_name: r.area_name ?? 'Tanpa Area',
        taco_share_value_pct: this.pct(tacoValue, totalValue),
        taco_share_qty_pct: this.pct(tacoQty, totalQty),
        taco_share_freq_pct: this.pct(tacoInvCount, totalInvCount),
        competitor_share_pct: this.pct(competitorValue, totalValue),
        taco_value: tacoValue,
        total_value: totalValue,
        competitor_value: competitorValue,
        unresolved_count: this.num(r.unresolved_count),
        invoice_count: this.num(r.invoice_count),
        taco_sku_count: this.num(r.taco_sku_count),
      };
    });
  }

  // ---- summary (KPI header strip) ------------------------------------------

  async summary(query: AnalyticsQueryDto) {
    const range = this.resolveRange(query.period);
    const area = query.area;

    // Current window totals
    const kpiRaw = await this.applyScope(
      this.baseQb()
        .select('COUNT(DISTINCT inv.id)', 'invoice_count')
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.matched_sku_id IS NOT NULL THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
          'taco_value',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.total_price IS NOT NULL AND CAST(li.total_price AS numeric) > 0 THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
          'total_value',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.is_competitor = true THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
          'competitor_value',
        )
        .addSelect(
          'COUNT(CASE WHEN li.needs_review = true THEN 1 END)',
          'unresolved_count',
        ),
      range,
      area,
    ).getRawOne<RawKpi>();

    const invoiceCount = this.num(kpiRaw?.invoice_count);
    const tacoValue = this.num(kpiRaw?.taco_value);
    const totalValue = this.num(kpiRaw?.total_value);
    const competitorValue = this.num(kpiRaw?.competitor_value);
    const unresolvedCount = this.num(kpiRaw?.unresolved_count);

    const tacoSharePct = this.pct(tacoValue, totalValue);
    const competitorPct = this.pct(competitorValue, totalValue);

    // Prior window for deltas
    let priorInvoiceCount = 0;
    let priorTacoValue = 0;
    let priorTotalValue = 0;
    let priorCompetitorValue = 0;

    if (range.priorFrom && range.priorTo) {
      const priorRaw = await this.applyPriorScope(
        this.baseQb()
          .select('COUNT(DISTINCT inv.id)', 'invoice_count')
          .addSelect(
            'COALESCE(SUM(CASE WHEN li.matched_sku_id IS NOT NULL THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
            'taco_value',
          )
          .addSelect(
            'COALESCE(SUM(CASE WHEN li.total_price IS NOT NULL AND CAST(li.total_price AS numeric) > 0 THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
            'total_value',
          )
          .addSelect(
            'COALESCE(SUM(CASE WHEN li.is_competitor = true THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
            'competitor_value',
          ),
        range,
        area,
      ).getRawOne<Omit<RawKpi, 'unresolved_count'>>();

      priorInvoiceCount = this.num(priorRaw?.invoice_count);
      priorTacoValue = this.num(priorRaw?.taco_value);
      priorTotalValue = this.num(priorRaw?.total_value);
      priorCompetitorValue = this.num(priorRaw?.competitor_value);
    }

    const deltaPct = (cur: number, prior: number): number | null => {
      if (prior === 0) return cur > 0 ? null : null;
      return Math.round(((cur - prior) / prior) * 1000) / 10;
    };
    const deltaShare = (cur: number, prior: number, priorD: number, curD: number): number | null => {
      const curPct = this.pct(cur, curD);
      const priorPct = this.pct(prior, priorD);
      if (priorPct === 0) return null;
      return Math.round((curPct - priorPct) * 10) / 10; // pp difference
    };

    return {
      period: range.label,
      range: {
        from: range.from?.toISOString() ?? null,
        to: range.to.toISOString(),
      },
      filter_area: area ?? null,
      kpis: {
        invoice_count: invoiceCount,
        invoice_count_delta: deltaPct(invoiceCount, priorInvoiceCount),
        taco_share_pct: tacoSharePct,
        taco_share_delta_pp: deltaShare(tacoValue, priorTacoValue, priorTotalValue, totalValue),
        taco_value: Math.round(tacoValue),
        taco_value_delta: deltaPct(tacoValue, priorTacoValue),
        competitor_signal_pct: competitorPct,
        competitor_signal_delta_pp: deltaShare(competitorValue, priorCompetitorValue, priorTotalValue, totalValue),
        unresolved_count: unresolvedCount,
      },
    };
  }

  // ---- share by area (three dimensions) ------------------------------------

  async shareByArea(query: AnalyticsQueryDto) {
    const range = this.resolveRange(query.period);
    const rows = await this.shareRows(range, query.area);

    // Sort by value share descending (per doc: "sort by TACO share descending")
    rows.sort((a, b) => b.taco_share_value_pct - a.taco_share_value_pct);

    return {
      period: range.label,
      range: {
        from: range.from?.toISOString() ?? null,
        to: range.to.toISOString(),
      },
      by_area: rows.map((r) => ({
        area_id: r.area_id,
        area_name: r.area_name,
        taco_share_value_pct: r.taco_share_value_pct,
        taco_share_qty_pct: r.taco_share_qty_pct,
        taco_share_freq_pct: r.taco_share_freq_pct,
        competitor_share_pct: r.competitor_share_pct,
        taco_value: Math.round(r.taco_value),
        total_value: Math.round(r.total_value),
        competitor_value: Math.round(r.competitor_value),
        unresolved_count: r.unresolved_count,
        invoice_count: r.invoice_count,
        taco_sku_count: r.taco_sku_count,
      })),
    };
  }

  // ---- trend (share over time, by created_at, per area) --------------------

  async trend(query: AnalyticsQueryDto) {
    const range = this.resolveRange(query.period);
    const bucketFn =
      range.bucket === 'week'
        ? "to_char(date_trunc('week', inv.created_at), 'YYYY-MM-DD')"
        : "to_char(date_trunc('month', inv.created_at), 'YYYY-MM')";
    const bucketGroup =
      range.bucket === 'week'
        ? "date_trunc('week', inv.created_at)"
        : "date_trunc('month', inv.created_at)";

    const raw = await this.applyScope(
      this.baseQb()
        .select('inv.area_id', 'area_id')
        .addSelect('MAX(area.name)', 'area_name')
        .addSelect(bucketFn, 'bucket')
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.matched_sku_id IS NOT NULL THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
          'taco_value',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.total_price IS NOT NULL AND CAST(li.total_price AS numeric) > 0 THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
          'total_value',
        ),
      range,
      query.area,
    )
      .groupBy('inv.area_id')
      .addGroupBy(bucketGroup)
      .orderBy(bucketGroup, 'ASC')
      .getRawMany<RawTrend>();

    // Group by area, each area has a series of {bucket, share_pct}
    const areaMap = new Map<
      string,
      { area_id: string | null; area_name: string; series: { bucket: string; taco_share_value_pct: number }[] }
    >();

    for (const r of raw) {
      const key = r.area_id ?? '__none__';
      if (!areaMap.has(key)) {
        areaMap.set(key, {
          area_id: r.area_id ?? null,
          area_name: r.area_name ?? 'Tanpa Area',
          series: [],
        });
      }
      const tacoValue = this.num(r.taco_value);
      const totalValue = this.num(r.total_value);
      areaMap.get(key)!.series.push({
        bucket: r.bucket,
        taco_share_value_pct: this.pct(tacoValue, totalValue),
      });
    }

    return {
      period: range.label,
      bucket_type: range.bucket,
      range: {
        from: range.from?.toISOString() ?? null,
        to: range.to.toISOString(),
      },
      per_area: Array.from(areaMap.values()),
    };
  }

  // ---- top TACO SKUs -------------------------------------------------------

  async topSkus(query: AnalyticsQueryDto) {
    const range = this.resolveRange(query.period);
    const limit = Math.min(
      Math.max(parseInt(query.limit ?? '15', 10) || 15, 1),
      30,
    );

    const raw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('li.matched_sku', 'sku')
        .select('li.matched_sku_id', 'sku_id')
        .addSelect('MAX(sku.name)', 'sku_name')
        .addSelect('MAX(sku.catalog_category)', 'catalog_category')
        .addSelect(
          'COALESCE(SUM(CAST(li.total_price AS numeric)), 0)',
          'total_value',
        )
        .addSelect(
          'COALESCE(SUM(CAST(li.quantity AS numeric)), 0)',
          'total_qty',
        )
        .addSelect('COUNT(DISTINCT inv.store_id)', 'store_count')
        .addSelect('COUNT(DISTINCT inv.id)', 'invoice_count')
        .where('li.matched_sku_id IS NOT NULL'),
      range,
      query.area,
    )
      .groupBy('li.matched_sku_id')
      .orderBy('total_value', 'DESC')
      .limit(limit)
      .getRawMany<RawSkuRow>();

    // Total unmatched count (data quality indicator)
    const unmatchedRaw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .select('COUNT(li.id)', 'cnt')
        .where('li.matched_sku_id IS NULL'),
      range,
      query.area,
    ).getRawOne<{ cnt: string }>();

    // Total invoices in scope — denominator for penetration display
    const totalInvRaw = await this.applyScope(
      this.invoices
        .createQueryBuilder('inv')
        .select('COUNT(DISTINCT inv.id)', 'cnt'),
      range,
      query.area,
    ).getRawOne<{ cnt: string }>();
    const totalInvoices = this.num(totalInvRaw?.cnt);

    return {
      period: range.label,
      range: {
        from: range.from?.toISOString() ?? null,
        to: range.to.toISOString(),
      },
      unmatched_count: this.num(unmatchedRaw?.cnt),
      total_invoices: totalInvoices,
      top_skus: raw.map((r) => {
        const invCount = this.num(r.invoice_count);
        const qty = this.num(r.total_qty);
        return {
          sku_id: r.sku_id,
          sku_name: r.sku_name ?? 'SKU Tidak Diketahui',
          catalog_category: r.catalog_category ?? null,
          total_value: Math.round(this.num(r.total_value)),
          total_qty: qty,
          store_count: this.num(r.store_count),
          invoice_count: invCount,
          avg_qty_per_invoice:
            invCount > 0 ? Math.round((qty / invCount) * 10) / 10 : 0,
        };
      }),
    };
  }

  // ---- competitor brands ---------------------------------------------------

  async competitorBrands(query: AnalyticsQueryDto) {
    const range = this.resolveRange(query.period);

    // Per-area, top 5 brands (where brand_name IS NOT NULL) + brand_name=null total
    const raw = await this.applyScope(
      this.baseQb()
        .select('inv.area_id', 'area_id')
        .addSelect('MAX(area.name)', 'area_name')
        .addSelect('li.brand_name', 'brand_name')
        .addSelect(
          'COALESCE(SUM(CAST(li.total_price AS numeric)), 0)',
          'brand_value',
        )
        .addSelect(
          'COALESCE((SELECT SUM(CAST(li2.total_price AS numeric)) FROM taro_v2_invoice_line_items li2 INNER JOIN taro_v2_invoices inv2 ON li2.invoice_id=inv2.id WHERE inv2.area_id=inv.area_id AND li2.total_price IS NOT NULL AND CAST(li2.total_price AS numeric) > 0), 0)',
          'total_value',
        )
        .where('li.is_competitor = true')
        .andWhere('li.brand_name IS NOT NULL'),
      range,
      query.area,
    )
      .groupBy('inv.area_id')
      .addGroupBy('li.brand_name')
      .orderBy('inv.area_id', 'ASC')
      .addOrderBy('brand_value', 'DESC')
      .getRawMany<RawCompetitorBrand>();

    // Group by area — only named brands (brand_name IS NOT NULL enforced by WHERE)
    const areaMap = new Map<
      string,
      {
        area_id: string | null;
        area_name: string;
        total_value: number;
        top_brands: { brand_name: string; value: number }[];
      }
    >();

    for (const r of raw) {
      const key = r.area_id ?? '__none__';
      if (!areaMap.has(key)) {
        areaMap.set(key, {
          area_id: r.area_id ?? null,
          area_name: r.area_name ?? 'Tanpa Area',
          total_value: this.num(r.total_value),
          top_brands: [],
        });
      }
      const bucket = areaMap.get(key)!;
      const val = this.num(r.brand_value);
      if (bucket.top_brands.length < 5) {
        bucket.top_brands.push({ brand_name: r.brand_name!, value: Math.round(val) });
      }
    }

    const areas = Array.from(areaMap.values());
    return {
      period: range.label,
      range: {
        from: range.from?.toISOString() ?? null,
        to: range.to.toISOString(),
      },
      by_area: areas.map((a) => {
        const namedTotal = a.top_brands.reduce((s, b) => s + b.value, 0);
        return {
          area_id: a.area_id,
          area_name: a.area_name,
          competitor_total_value: Math.round(namedTotal),
          total_value: Math.round(a.total_value),
          competitor_pct: this.pct(namedTotal, a.total_value),
          top_brands: a.top_brands,
          unnamed_competitor_value: 0,
        };
      }),
    };
  }

  // ---- area → store drill-down (Level 1) -----------------------------------

  async areaStores(query: AnalyticsDrillQueryDto) {
    const range = this.resolveRange(query.period);

    // Per-store share metrics
    const raw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('regions', 'area', 'area.id = inv.area_id')
        .leftJoin('taro_v2_stores', 'store', 'store.id = inv.store_id')
        // top SKU name per store (subquery as expression)
        .select('inv.store_id', 'store_id')
        .addSelect('MAX(store.name)', 'store_name')
        .addSelect('COUNT(DISTINCT inv.id)', 'invoice_count')
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.matched_sku_id IS NOT NULL THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
          'taco_value',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.total_price IS NOT NULL AND CAST(li.total_price AS numeric) > 0 THEN CAST(li.total_price AS numeric) ELSE 0 END), 0)',
          'total_value',
        )
        .addSelect(
          "(SELECT sku.name FROM taro_v2_invoice_line_items li3 INNER JOIN taro_v2_invoices inv3 ON li3.invoice_id=inv3.id LEFT JOIN taco_skus sku ON li3.matched_sku_id=sku.id WHERE inv3.store_id=inv.store_id AND li3.matched_sku_id IS NOT NULL GROUP BY sku.name ORDER BY SUM(CAST(li3.total_price AS numeric)) DESC LIMIT 1)",
          'top_sku_name',
        )
        .where('inv.area_id = :area_id', { area_id: query.area_id }),
      range,
      undefined,
    )
      .groupBy('inv.store_id')
      .orderBy('taco_value', 'ASC') // ascending = worst performers first (per spec)
      .getRawMany<RawStoreRow>();

    // Area header KPIs
    const areaRows = await this.shareRows(range, query.area_id);
    const areaKpi = areaRows[0];

    return {
      area_id: query.area_id,
      area_kpis: areaKpi
        ? {
            taco_share_value_pct: areaKpi.taco_share_value_pct,
            invoice_count: areaKpi.invoice_count,
            competitor_share_pct: areaKpi.competitor_share_pct,
          }
        : null,
      period: range.label,
      range: {
        from: range.from?.toISOString() ?? null,
        to: range.to.toISOString(),
      },
      stores: raw.map((r) => ({
        store_id: r.store_id,
        store_name: r.store_name ?? 'Toko Tidak Diketahui',
        invoice_count: this.num(r.invoice_count),
        taco_share_value_pct: this.pct(
          this.num(r.taco_value),
          this.num(r.total_value),
        ),
        taco_value: Math.round(this.num(r.taco_value)),
        total_value: Math.round(this.num(r.total_value)),
        top_sku_name: r.top_sku_name ?? null,
      })),
    };
  }
}
