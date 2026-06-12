import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';

import { InvoiceLineItemV2 } from '../../database/entities/v2/invoice-line-item-v2.entity';
import { MarketInsightV2 } from '../../database/entities/v2/market-insight-v2.entity';
import {
  AiInsightQueryDto,
  LatestInsightQueryDto,
  RecapQueryDto,
  TrendingQueryDto,
  V2Period,
} from '../dto/period.dto';

/** Sonnet — the AI-insight card runs the latest Sonnet over pre-aggregated rollups. */
const INSIGHT_MODEL = 'claude-sonnet-4-6';

interface DateRange {
  from: Date | null;
  to: Date;
  label: V2Period;
}

export interface AreaRecapRow {
  area_id: string | null;
  area_name: string;
  invoice_count: number;
  line_item_count: number;
  total_qty: number;
  taco_qty: number;
  competitor_qty: number;
}

export interface TimeBucket {
  date: string; // YYYY-MM-DD
  total_qty: number;
  line_item_count: number;
}

export interface TrendingItem {
  name: string;
  sku_id: string | null;
  is_competitor: boolean;
  total_qty: number;
  line_count: number;
}

// Raw shapes returned by the aggregation query builders (Postgres returns
// COUNT/SUM as strings; bool_or as a JS boolean).
interface RawAreaRecap {
  area_id: string | null;
  area_name: string | null;
  invoice_count: string;
  line_item_count: string;
  total_qty: string;
  taco_qty: string;
  competitor_qty: string;
}
interface RawSeries {
  date: string;
  total_qty: string;
  line_item_count: string;
}
interface RawTrending {
  area_id: string | null;
  area_name: string | null;
  item_name: string;
  sku_id: string | null;
  is_competitor: boolean;
  total_qty: string;
  line_count: string;
}
interface RawPriorArea {
  area_id: string | null;
  total_qty: string;
}
interface RawCompetitorBrandRollup {
  brand_name: string;
  total_qty: string;
  total_value: string;
  area_count: string;
}
interface RawBasketPair {
  a: string;
  b: string;
  co_invoices: string;
}

/**
 * v2 MANAGEMENT — Dashboard aggregation + AI insight (market-demand surface).
 *
 * Reads Grout's canonical InvoiceV2 / InvoiceLineItemV2 (joined to AreaV2 +
 * TacoSku) and rolls them up:
 *   - recap     items logged split by area + quantity sold over the period.
 *   - trending  top items per area for the window.
 *   - aiInsight Sonnet over the PRE-AGGREGATED rollups (never raw rows) →
 *               a Bahasa-Indonesia market-demand brief for TACO management.
 *
 * All aggregations are window-scoped (period) and degrade gracefully to empty
 * structures when no invoices exist yet — the FE always gets a valid shape.
 */
@Injectable()
export class V2DashboardService {
  private readonly logger = new Logger(V2DashboardService.name);
  private readonly anthropic: Anthropic | null;

  constructor(
    @InjectRepository(InvoiceLineItemV2)
    private readonly lineItems: Repository<InvoiceLineItemV2>,
    @InjectRepository(MarketInsightV2)
    private readonly insights: Repository<MarketInsightV2>,
  ) {
    this.anthropic = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
  }

  // ---- period → date range -------------------------------------------------

  private resolveRange(period?: V2Period): DateRange {
    const to = new Date();
    const label: V2Period = period ?? '30d';

    let from: Date | null;
    switch (label) {
      case '7d':
        from = new Date(to.getTime() - 7 * 864e5);
        break;
      case '30d':
        from = new Date(to.getTime() - 30 * 864e5);
        break;
      case '90d':
        from = new Date(to.getTime() - 90 * 864e5);
        break;
      case 'this_month':
        from = new Date(to.getFullYear(), to.getMonth(), 1);
        break;
      case 'last_month':
        return {
          from: new Date(to.getFullYear(), to.getMonth() - 1, 1),
          to: new Date(to.getFullYear(), to.getMonth(), 1),
          label,
        };
      case 'this_quarter':
        from = new Date(to.getFullYear(), Math.floor(to.getMonth() / 3) * 3, 1);
        break;
      case 'ytd':
        from = new Date(to.getFullYear(), 0, 1);
        break;
      case 'all':
        from = null;
        break;
      default:
        from = new Date(to.getTime() - 30 * 864e5);
    }
    return { from, to, label };
  }

  private num(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  /**
   * Format an instant as a naive local-time string ("YYYY-MM-DD HH:mm:ss") for
   * the window-bound parameters.
   *
   * `inv.created_at` is `timestamp without time zone` and the ingest path writes
   * local wall-clock into it. Comparing it against a `toISOString()` (UTC) bound
   * shifts the window by the server's UTC offset, so the `< to` upper bound lands
   * `offset` hours in the past and silently drops every invoice created within
   * that window — which empties the whole dashboard. Formatting the bounds in the
   * same local frame the column is stored in keeps the comparison honest.
   */
  private toLocalNaive(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
      `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
  }

  /** Apply the period window + optional area filter to a line-item query. */
  private applyScope<T extends import('typeorm').ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    range: DateRange,
    area?: string,
  ): SelectQueryBuilder<T> {
    if (range.from) {
      qb.andWhere('inv.created_at >= :from', {
        from: this.toLocalNaive(range.from),
      });
    }
    qb.andWhere('inv.created_at < :to', { to: this.toLocalNaive(range.to) });
    if (area) qb.andWhere('inv.area_id = :area', { area });
    return qb;
  }

  // ---- recap ---------------------------------------------------------------

  /** Items logged split by area + quantity sold over the period. */
  async recap(query: RecapQueryDto) {
    const range = this.resolveRange(query.period);

    const byAreaRaw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        // Area names live in the consolidated `regions` table (the area master),
        // joined raw by area_id so this does not depend on the InvoiceV2.area
        // entity relation — same source decorateListItems() resolves names from.
        .leftJoin('regions', 'area', 'area.id = inv.area_id')
        .select('inv.area_id', 'area_id')
        .addSelect('MAX(area.name)', 'area_name')
        .addSelect('COUNT(DISTINCT inv.id)', 'invoice_count')
        .addSelect('COUNT(li.id)', 'line_item_count')
        .addSelect('COALESCE(SUM(li.quantity), 0)', 'total_qty')
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.is_competitor = false THEN li.quantity ELSE 0 END), 0)',
          'taco_qty',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN li.is_competitor = true THEN li.quantity ELSE 0 END), 0)',
          'competitor_qty',
        ),
      range,
      query.area,
    )
      .groupBy('inv.area_id')
      .orderBy('total_qty', 'DESC')
      .getRawMany<RawAreaRecap>();

    const by_area: AreaRecapRow[] = byAreaRaw.map((r) => ({
      area_id: r.area_id ?? null,
      area_name: r.area_name ?? 'Tanpa Area',
      invoice_count: this.num(r.invoice_count),
      line_item_count: this.num(r.line_item_count),
      total_qty: this.num(r.total_qty),
      taco_qty: this.num(r.taco_qty),
      competitor_qty: this.num(r.competitor_qty),
    }));

    const seriesRaw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .select(
          "to_char(date_trunc('day', inv.created_at), 'YYYY-MM-DD')",
          'date',
        )
        .addSelect('COALESCE(SUM(li.quantity), 0)', 'total_qty')
        .addSelect('COUNT(li.id)', 'line_item_count'),
      range,
      query.area,
    )
      .groupBy("date_trunc('day', inv.created_at)")
      .orderBy("date_trunc('day', inv.created_at)", 'ASC')
      .getRawMany<RawSeries>();

    const qty_over_time: TimeBucket[] = seriesRaw.map((r) => ({
      date: r.date,
      total_qty: this.num(r.total_qty),
      line_item_count: this.num(r.line_item_count),
    }));

    const totals = by_area.reduce(
      (acc, a) => {
        acc.invoice_count += a.invoice_count;
        acc.line_item_count += a.line_item_count;
        acc.total_qty += a.total_qty;
        acc.taco_qty += a.taco_qty;
        acc.competitor_qty += a.competitor_qty;
        return acc;
      },
      {
        area_count: by_area.length,
        invoice_count: 0,
        line_item_count: 0,
        total_qty: 0,
        taco_qty: 0,
        competitor_qty: 0,
      },
    );

    return {
      period: range.label,
      range: {
        from: range.from?.toISOString() ?? null,
        to: range.to.toISOString(),
      },
      filter_area: query.area ?? null,
      totals,
      by_area,
      qty_over_time,
    };
  }

  // ---- trending ------------------------------------------------------------

  /**
   * Top items per area for the window. Item identity = the matched TACO SKU
   * name, else the competitor brand name, else the cleaned raw OCR text.
   */
  async trending(query: TrendingQueryDto) {
    const range = this.resolveRange(query.period);
    const limit = Math.min(
      Math.max(parseInt(query.limit ?? '5', 10) || 5, 1),
      25,
    );

    const rows = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .leftJoin('regions', 'area', 'area.id = inv.area_id')
        .leftJoin('li.matched_sku', 'sku')
        .select('inv.area_id', 'area_id')
        .addSelect('MAX(area.name)', 'area_name')
        .addSelect(
          "COALESCE(sku.name, NULLIF(li.brand_name, ''), NULLIF(btrim(li.raw_text), ''), 'Tidak terbaca')",
          'item_name',
        )
        .addSelect('li.matched_sku_id', 'sku_id')
        .addSelect('bool_or(li.is_competitor)', 'is_competitor')
        .addSelect('COALESCE(SUM(li.quantity), 0)', 'total_qty')
        .addSelect('COUNT(li.id)', 'line_count'),
      range,
      query.area,
    )
      .groupBy('inv.area_id')
      .addGroupBy('item_name')
      .addGroupBy('li.matched_sku_id')
      .orderBy('inv.area_id', 'ASC')
      .addOrderBy('total_qty', 'DESC')
      .getRawMany<RawTrending>();

    const byArea = new Map<
      string,
      { area_id: string | null; area_name: string; items: TrendingItem[] }
    >();
    for (const r of rows) {
      const key = r.area_id ?? '__none__';
      if (!byArea.has(key)) {
        byArea.set(key, {
          area_id: r.area_id ?? null,
          area_name: r.area_name ?? 'Tanpa Area',
          items: [],
        });
      }
      const bucket = byArea.get(key)!;
      if (bucket.items.length < limit) {
        bucket.items.push({
          name: r.item_name,
          sku_id: r.sku_id ?? null,
          is_competitor: r.is_competitor === true,
          total_qty: this.num(r.total_qty),
          line_count: this.num(r.line_count),
        });
      }
    }

    return {
      period: range.label,
      range: {
        from: range.from?.toISOString() ?? null,
        to: range.to.toISOString(),
      },
      limit_per_area: limit,
      per_area: Array.from(byArea.values()),
    };
  }

  // ---- competitor + market-basket rollups (insight inputs) -----------------

  /**
   * Competitor picture for the insight: the named competitor brands admins
   * resolved on invoice lines (`is_competitor=true` with a `brand_name`),
   * aggregated by brand with qty, value and how many areas they show up in.
   * Also returns the count of competitor lines still without a brand tag.
   */
  private async competitorRollup(range: DateRange, area?: string) {
    const branded = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .select('li.brand_name', 'brand_name')
        .addSelect('COALESCE(SUM(li.quantity), 0)', 'total_qty')
        .addSelect(
          'COALESCE(SUM(CAST(li.total_price AS numeric)), 0)',
          'total_value',
        )
        .addSelect('COUNT(DISTINCT inv.area_id)', 'area_count')
        .where('li.is_competitor = true')
        .andWhere("COALESCE(NULLIF(btrim(li.brand_name), ''), NULL) IS NOT NULL"),
      range,
      area,
    )
      .groupBy('li.brand_name')
      .orderBy('total_value', 'DESC')
      .limit(8)
      .getRawMany<RawCompetitorBrandRollup>();

    const untaggedRaw = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .select('COUNT(li.id)', 'cnt')
        .where('li.is_competitor = true')
        .andWhere("COALESCE(NULLIF(btrim(li.brand_name), ''), NULL) IS NULL"),
      range,
      area,
    ).getRawOne<{ cnt: string }>();

    return {
      brands: branded.map((r) => ({
        brand_name: r.brand_name,
        total_qty: this.num(r.total_qty),
        total_value: Math.round(this.num(r.total_value)),
        area_count: this.num(r.area_count),
      })),
      untagged_competitor_lines: this.num(untaggedRaw?.cnt),
    };
  }

  /**
   * Market-basket: pairs of confirmed TACO SKUs that appear together in the
   * same invoice ("ketika orang beli A, banyak juga beli B"). Self-join on
   * invoice_id with an ordered id pair to avoid mirrored duplicates.
   */
  private async marketBasket(range: DateRange, area?: string) {
    const rows = await this.applyScope(
      this.lineItems
        .createQueryBuilder('li')
        .innerJoin('li.invoice', 'inv')
        .innerJoin(
          'taro_v2_invoice_line_items',
          'li2',
          'li2.invoice_id = li.invoice_id AND li.matched_sku_id < li2.matched_sku_id',
        )
        .innerJoin('taco_skus', 's1', 's1.id = li.matched_sku_id')
        .innerJoin('taco_skus', 's2', 's2.id = li2.matched_sku_id')
        .select('s1.name', 'a')
        .addSelect('s2.name', 'b')
        .addSelect('COUNT(DISTINCT li.invoice_id)', 'co_invoices')
        .where('li.matched_sku_id IS NOT NULL')
        .andWhere('li2.matched_sku_id IS NOT NULL'),
      range,
      area,
    )
      .groupBy('s1.name')
      .addGroupBy('s2.name')
      .orderBy('co_invoices', 'DESC')
      .limit(8)
      .getRawMany<RawBasketPair>();

    return rows
      .filter((r) => this.num(r.co_invoices) > 0)
      .map((r) => ({
        sku_a: r.a,
        sku_b: r.b,
        co_invoices: this.num(r.co_invoices),
      }));
  }

  // ---- AI insight ----------------------------------------------------------

  /**
   * LLM (Sonnet) over the pre-aggregated period rollups → market-demand brief.
   * Compares the selected window against the immediately-preceding window of
   * equal length to surface rising / declining areas, and feeds the model the
   * competitor picture + market-basket co-occurrences so it can recommend
   * bundles, price checks vs competitors, and weak-area pushes.
   */
  async aiInsight(query: AiInsightQueryDto) {
    const range = this.resolveRange(query.period);
    const recap = await this.recap({ period: range.label, area: query.area });
    const trending = await this.trending({
      period: range.label,
      area: query.area,
      limit: '5',
    });
    const competitor = await this.competitorRollup(range, query.area);
    const market_basket = await this.marketBasket(range, query.area);

    // Prior window of equal length for trend direction (skip for 'all').
    let priorByArea = new Map<string | null, number>();
    if (range.from) {
      const span = range.to.getTime() - range.from.getTime();
      const priorRange: DateRange = {
        from: new Date(range.from.getTime() - span),
        to: range.from,
        label: range.label,
      };
      const priorRows = await this.applyScope(
        this.lineItems
          .createQueryBuilder('li')
          .innerJoin('li.invoice', 'inv')
          .select('inv.area_id', 'area_id')
          .addSelect('COALESCE(SUM(li.quantity), 0)', 'total_qty'),
        priorRange,
        query.area,
      )
        .groupBy('inv.area_id')
        .getRawMany<RawPriorArea>();
      priorByArea = new Map<string | null, number>(
        priorRows.map((r) => [r.area_id ?? null, this.num(r.total_qty)]),
      );
    }

    const area_trends = recap.by_area.map((a) => {
      const before = priorByArea.get(a.area_id) ?? 0;
      const delta = a.total_qty - before;
      const pct =
        before > 0
          ? Math.round((delta / before) * 100)
          : a.total_qty > 0
            ? 100
            : 0;
      return {
        area_id: a.area_id,
        area_name: a.area_name,
        current_qty: a.total_qty,
        prior_qty: before,
        delta,
        change_pct: pct,
        direction: delta > 0 ? 'naik' : delta < 0 ? 'turun' : 'stabil',
      };
    });

    const rollups = {
      period: range.label,
      range: recap.range,
      totals: recap.totals,
      by_area: recap.by_area,
      qty_over_time: recap.qty_over_time,
      area_trends,
      trending: trending.per_area,
      competitor,
      market_basket,
    };

    if (recap.totals.line_item_count === 0) {
      return {
        period: range.label,
        range: recap.range,
        model: null,
        generated_at: null,
        insight:
          'Belum ada data invoice pada periode ini, sehingga belum ada insight permintaan pasar yang bisa ditampilkan. Pastikan tim Taro sudah mengunggah invoice untuk periode terpilih.',
        rollups,
      };
    }

    if (!this.anthropic) {
      const insightText = this.fallbackInsight(rollups);
      const saved = await this.persistInsight(insightText, null, range.label, query.area ?? null);
      return {
        period: range.label,
        range: recap.range,
        model: null,
        generated_at: saved.generated_at.toISOString(),
        insight: insightText,
        rollups,
      };
    }

    try {
      const response = await this.anthropic.messages.create({
        model: INSIGHT_MODEL,
        max_tokens: 1500,
        system:
          'Anda analis permintaan pasar untuk tim manajemen TACO (produk bahan bangunan/furnitur seperti HPL, laminate, edging). ' +
          'Anda menerima ringkasan data invoice yang SUDAH diagregasi untuk satu periode: total & per-area (qty TACO vs kompetitor), tren naik/turun vs periode sebelumnya, item terlaris per area, ' +
          'rincian merek kompetitor yang ditandai admin (field "competitor"), dan pasangan SKU yang sering dibeli bersamaan dalam satu invoice (field "market_basket"). ' +
          'Tugas: tulis ringkasan manajemen dalam Bahasa Indonesia, format MARKDOWN, dengan struktur section berikut (gunakan heading "##"):\n' +
          '## Permintaan TACO — kondisi umum + area terkuat/terlemah, dan tren naik/turun.\n' +
          '## Gambaran Kompetitor — merek kompetitor mana yang muncul, di area mana, seberapa kuat. Jika tidak ada merek kompetitor yang ditandai, katakan demikian.\n' +
          '## Pola Beli Bersama — dari market_basket, tulis observasi gaya "ketika orang beli A, banyak juga beli B". Jika data co-occurrence kosong, katakan belum cukup data.\n' +
          '## Rekomendasi — 3–5 langkah konkret dan dapat ditindaklanjuti (mis. buat bundle dari pasangan yang sering dibeli bersama, cek ulang harga vs kompetitor di area tertentu, dorong area dengan cakupan/permintaan lemah). Gunakan bullet list.\n' +
          'Aturan: JANGAN mengarang angka di luar data yang diberikan. Jika sebuah bagian datanya tipis/kosong, katakan apa adanya — jangan dipaksakan. Ringkas dan padat.',
        messages: [
          {
            role: 'user',
            content:
              'Ringkasan teragregasi (JSON) untuk periode terpilih:\n\n' +
              JSON.stringify(rollups) +
              '\n\nTulis ringkasan manajemen pasar TACO (markdown) berdasarkan data ini.',
          },
        ],
      });

      const insightText = (
        response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim() || this.fallbackInsight(rollups)
      );

      const saved = await this.persistInsight(insightText, INSIGHT_MODEL, range.label, query.area ?? null);

      return {
        period: range.label,
        range: recap.range,
        model: INSIGHT_MODEL,
        generated_at: saved.generated_at.toISOString(),
        insight: insightText,
        rollups,
      };
    } catch (err) {
      this.logger.error(`AI insight failed: ${String(err)}`);
      const insightText = this.fallbackInsight(rollups);
      const saved = await this.persistInsight(insightText, null, range.label, query.area ?? null);
      return {
        period: range.label,
        range: recap.range,
        model: null,
        generated_at: saved.generated_at.toISOString(),
        insight: insightText,
        rollups,
      };
    }
  }

  /** Returns the most recent saved insight for the given scope without calling the LLM. */
  async latestInsight(query: LatestInsightQueryDto) {
    const period = query.period ?? '30d';
    const areaId = query.area ?? null;

    const row = await this.insights.findOne({
      where: { period, area_id: areaId === null ? IsNull() : areaId },
      order: { generated_at: 'DESC' },
    });

    if (!row) {
      return {
        period,
        area_id: areaId,
        found: false,
        insight: null,
        model: null,
        generated_at: null,
      };
    }

    return {
      period,
      area_id: areaId,
      found: true,
      insight: row.insight_text,
      model: row.model,
      generated_at: row.generated_at.toISOString(),
    };
  }

  private async persistInsight(
    insightText: string,
    model: string | null,
    period: string,
    areaId: string | null,
  ): Promise<MarketInsightV2> {
    const row = this.insights.create({
      insight_text: insightText,
      model,
      period,
      area_id: areaId,
    });
    return this.insights.save(row);
  }

  /** Deterministic brief used when the LLM is unavailable / errors. */
  private fallbackInsight(rollups: {
    totals: { total_qty: number; invoice_count: number; area_count: number };
    by_area: AreaRecapRow[];
    area_trends: { area_name: string; direction: string; change_pct: number }[];
    trending: { area_name: string; items: TrendingItem[] }[];
  }): string {
    const t = rollups.totals;
    const top = [...rollups.by_area].sort(
      (a, b) => b.total_qty - a.total_qty,
    )[0];
    const rising = rollups.area_trends.filter((a) => a.direction === 'naik');
    const falling = rollups.area_trends.filter((a) => a.direction === 'turun');
    const lines = [
      `Total ${t.invoice_count} invoice di ${t.area_count} area, ${t.total_qty} unit tercatat pada periode ini.`,
    ];
    if (top) {
      lines.push(
        `Area dengan permintaan tertinggi: ${top.area_name} (${top.total_qty} unit).`,
      );
    }
    if (rising.length) {
      lines.push(
        `Naik: ${rising.map((a) => `${a.area_name} (+${a.change_pct}%)`).join(', ')}.`,
      );
    }
    if (falling.length) {
      lines.push(
        `Turun: ${falling
          .map((a) => `${a.area_name} (${a.change_pct}%)`)
          .join(', ')} — perlu perhatian.`,
      );
    }
    const topItems = rollups.trending[0]?.items?.slice(0, 3) ?? [];
    if (topItems.length) {
      lines.push(
        `Item terlaris di ${rollups.trending[0].area_name}: ${topItems
          .map((i) => i.name)
          .join(', ')}.`,
      );
    }
    return lines.join(' ');
  }
}
