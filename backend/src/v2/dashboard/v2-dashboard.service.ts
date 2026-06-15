import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';

import { InvoiceLineItemV2 } from '../../database/entities/v2/invoice-line-item-v2.entity';
import { MarketInsightV2 } from '../../database/entities/v2/market-insight-v2.entity';
import { MarketIntelService } from '../market-intel/market-intel.service';
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
    private readonly marketIntel: MarketIntelService,
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

  // ---- AI insight ----------------------------------------------------------

  /**
   * Build the honest market-intel signal pack the brief is written from. These
   * are the SAME `/api/v2/market-intel/*` endpoints the revamped analytics page
   * renders — real transacted price bands, per-SKU invoice price history (each
   * carrying its invoice id), per-area top SKUs by occurrence frequency, and
   * same-receipt TACO-vs-competitor price gaps — NOT the legacy share/qty
   * rollups (those reintroduce the market-share/volume framing the revamp kills).
   *
   * Crucially it surfaces the real contributing invoice IDs (short 8-char form)
   * so the brief can cite concrete evidence per bullet (AC-13).
   */
  private async buildMarketIntelSignals(query: AiInsightQueryDto) {
    const scope = { period: query.period, area: query.area };
    const cite = (id: string) => id.slice(0, 8);

    const coverage = await this.marketIntel.coverage(scope);
    const [priceBands, topSkus, priceGaps] = await Promise.all([
      this.marketIntel.priceBands({ ...scope, page_size: '6' }),
      this.marketIntel.topSkusPerArea({ ...scope, top_n: '5' }),
      this.marketIntel.priceGapPairs({ ...scope, page_size: '8' }),
    ]);

    // Per-SKU invoice evidence for the top bands — the citable invoice IDs.
    const price_evidence: Array<{
      sku_name: string;
      n_invoices: number;
      p_min: number;
      p_median: number;
      p_max: number;
      spread_pct: number;
      outliers: Array<{
        cite: string;
        supplier_name: string | null;
        region_name: string | null;
        unit_price: number;
        direction: string;
      }>;
      invoices: Array<{
        cite: string;
        store_name: string | null;
        region_name: string | null;
        supplier_name: string | null;
        invoice_date: string | null;
        unit_price: number;
      }>;
    }> = [];
    for (const band of priceBands.price_bands.slice(0, 5)) {
      const ev = await this.marketIntel.skuPriceHistory({
        ...scope,
        sku_id: band.sku_id,
      });
      price_evidence.push({
        sku_name: band.sku_name,
        n_invoices: band.n_invoices,
        p_min: band.p_min,
        p_median: band.p_median,
        p_max: band.p_max,
        spread_pct: band.spread_pct,
        outliers: band.outliers.map((o) => ({
          cite: cite(o.invoice_id),
          supplier_name: o.supplier_name,
          region_name: o.region_name,
          unit_price: o.unit_price,
          direction: o.direction,
        })),
        invoices: ev.invoices.slice(0, 6).map((e) => ({
          cite: cite(e.invoice_id),
          store_name: e.store_name,
          region_name: e.region_name,
          supplier_name: e.supplier_name,
          invoice_date: e.invoice_date,
          unit_price: e.unit_price,
        })),
      });
    }

    // R3 head-to-head price gaps (same-receipt TACO vs resolved competitor) —
    // the honest competitor signal that replaces the cut co-occurrence basket.
    const price_gaps = priceGaps.rows.map((r) => ({
      cite: cite(r.invoice_id),
      store_name: r.store_name,
      region_name: r.region_name,
      taco_sku_name: r.taco_sku_name,
      taco_unit_price: r.taco_unit_price,
      competitor_brand_name: r.competitor_brand_name,
      competitor_unit_price: r.competitor_unit_price,
      gap_rp: r.gap_rp,
      gap_pct: r.gap_pct,
    }));

    // The pool of invoice IDs the brief is permitted to cite.
    const citable_invoice_ids = Array.from(
      new Set([
        ...price_evidence.flatMap((s) => [
          ...s.invoices.map((i) => i.cite),
          ...s.outliers.map((o) => o.cite),
        ]),
        ...price_gaps.map((p) => p.cite),
      ]),
    );

    return {
      period: query.period ?? '30d',
      scope_area: query.area ?? null,
      coverage,
      price_evidence,
      top_skus_per_area: topSkus.regions,
      price_gaps: {
        pairs: price_gaps,
        unknown_competitor_count: priceGaps.unknown_competitor_count,
        total_same_receipt_pairs: priceGaps.total_same_receipt_pairs,
      },
      citable_invoice_ids,
    };
  }

  /**
   * LLM (Sonnet) over the honest market-intel signal pack → a 3-point weekly
   * management brief that cites the real invoice IDs behind each point (AC-13)
   * and never uses market-share / total-volume / best-worst-area framing
   * (AC-6 / AC-15 / PRD §12). The model name is always Sonnet (AC-14).
   */
  async aiInsight(query: AiInsightQueryDto) {
    const range = this.resolveRange(query.period);
    const rangeOut = {
      from: range.from?.toISOString() ?? null,
      to: range.to.toISOString(),
    };

    const signals = await this.buildMarketIntelSignals(query);

    if (signals.coverage.n_invoices === 0) {
      return {
        period: range.label,
        range: rangeOut,
        model: null,
        generated_at: null,
        insight:
          'Belum ada invoice yang tersampel pada periode ini, sehingga belum ada sinyal pasar yang bisa diringkas. Pastikan tim Taro sudah mengunggah invoice untuk periode terpilih.',
        signals,
      };
    }

    const systemPrompt =
      'Anda analis intelijen pasar untuk manajemen TACO (HPL/laminate/edging). ' +
      'PENTING: data Anda BUKAN keseluruhan penjualan TACO — ini SAMPEL invoice distributor nyata yang kami kumpulkan. ' +
      'Jangan pernah menyiratkan pangsa pasar, market share, persen pasar, total/volume penjualan, atau peringkat "area terkuat/terlemah". ' +
      'Anda menerima sinyal jujur dari invoice tersampel:\n' +
      '- price_evidence: band harga nyata per SKU (min/median/max + spread% + outlier) dengan bukti invoice (tiap baris punya kode invoice `cite`).\n' +
      '- top_skus_per_area: seberapa SERING SKU muncul di invoice per wilayah (occurrence, BUKAN volume terjual).\n' +
      '- price_gaps: adu harga di NOTA YANG SAMA — baris TACO vs kompetitor yang dikenali pada satu invoice, dengan selisih Rupiah & % (gap_pct); plus unknown_competitor_count (observasi kompetitor tak dikenali).\n' +
      '- citable_invoice_ids: daftar kode invoice yang BOLEH Anda kutip.\n' +
      'Tugas: tulis ringkasan manajemen Bahasa Indonesia, format MARKDOWN, berupa TEPAT 3 poin bullet — masing-masing satu sinyal paling penting (mis. anomali/sebaran harga nyata, tekanan kompetitor di satu wilayah lewat adu harga nota-sama, atau SKU yang paling sering muncul).\n' +
      'ATURAN WAJIB:\n' +
      '1. SETIAP poin HARUS mengutip minimal satu kode invoice dari citable_invoice_ids, ditulis inline sebagai #kode (contoh: #1a2b3c4d). Jangan mengarang kode di luar daftar.\n' +
      '2. DILARANG memakai kata/konsep: "pangsa", "market share", "share", "% pasar", "total penjualan", "total volume", "volume terjual", "total qty", "unit terjual", "area terkuat", "area terlemah", "area tertinggi", "area terendah".\n' +
      '3. Bicara HANYA soal harga nyata, presensi/kemunculan, dan frekuensi sampel. Selalu bingkai sebagai "dari invoice yang kami sampel".\n' +
      '4. Jangan mengarang angka di luar data. Jika sebuah sinyal tipis/kosong, katakan apa adanya.\n' +
      'Mulai dengan satu kalimat pembuka memakai angka coverage (N invoice, M toko, K wilayah), lalu tepat 3 bullet.';

    if (!this.anthropic) {
      const insightText = this.fallbackInsight(signals);
      const saved = await this.persistInsight(
        insightText,
        null,
        range.label,
        query.area ?? null,
      );
      return {
        period: range.label,
        range: rangeOut,
        model: null,
        generated_at: saved.generated_at.toISOString(),
        insight: insightText,
        signals,
      };
    }

    try {
      const response = await this.anthropic.messages.create({
        model: INSIGHT_MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content:
              'Sinyal intelijen pasar (JSON) dari invoice tersampel untuk periode terpilih:\n\n' +
              JSON.stringify(signals) +
              '\n\nTulis ringkasan 3 poin (markdown), tiap poin mengutip minimal satu #kode invoice dari citable_invoice_ids.',
          },
        ],
      });

      const insightText =
        response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim() || this.fallbackInsight(signals);

      const saved = await this.persistInsight(
        insightText,
        INSIGHT_MODEL,
        range.label,
        query.area ?? null,
      );

      return {
        period: range.label,
        range: rangeOut,
        model: INSIGHT_MODEL,
        generated_at: saved.generated_at.toISOString(),
        insight: insightText,
        signals,
      };
    } catch (err) {
      this.logger.error(`AI insight failed: ${String(err)}`);
      const insightText = this.fallbackInsight(signals);
      const saved = await this.persistInsight(
        insightText,
        null,
        range.label,
        query.area ?? null,
      );
      return {
        period: range.label,
        range: rangeOut,
        model: null,
        generated_at: saved.generated_at.toISOString(),
        insight: insightText,
        signals,
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

  /**
   * Deterministic honest brief used when the LLM is unavailable / errors.
   * Mirrors the AI template: an opening coverage line + up to 3 bullets, each
   * citing a real invoice ID (#cite) and framed in price / presence / sampling
   * terms only — no market-share, volume, or best/worst-area language (so the
   * persisted fallback row never reintroduces the framing AC-6/AC-15 outlaw).
   */
  private fallbackInsight(signals: {
    coverage: {
      n_invoices: number;
      m_stores: number;
      k_areas: number;
      last_invoice_date: string | null;
    };
    price_evidence: Array<{
      sku_name: string;
      n_invoices: number;
      p_min: number;
      p_median: number;
      p_max: number;
      spread_pct: number;
      outliers: Array<{
        cite: string;
        supplier_name: string | null;
        region_name: string | null;
        direction: string;
      }>;
      invoices: Array<{ cite: string }>;
    }>;
    top_skus_per_area: Array<{
      region_name: string;
      skus: Array<{
        sku_name: string;
        occurrence_count: number;
        occurrence_pct: number;
      }>;
    }>;
    price_gaps: {
      pairs: Array<{
        cite: string;
        region_name: string | null;
        taco_sku_name: string;
        taco_unit_price: number;
        competitor_brand_name: string;
        competitor_unit_price: number;
        gap_rp: number;
        gap_pct: number;
      }>;
      unknown_competitor_count: number;
      total_same_receipt_pairs: number;
    };
    citable_invoice_ids: string[];
  }): string {
    const cov = signals.coverage;
    const anyCite = signals.citable_invoice_ids[0] ?? null;
    const lines: string[] = [
      `Sinyal dari ${cov.n_invoices} invoice tersampel di ${cov.m_stores} toko, ${cov.k_areas} wilayah` +
        (cov.last_invoice_date ? ` (terakhir ${cov.last_invoice_date})` : '') +
        ` — bukan keseluruhan penjualan TACO.`,
    ];

    // Point 1 — real-price signal (prefer a flagged outlier, else widest band).
    const banded = signals.price_evidence.filter((b) => b.invoices.length > 0);
    const withOutlier = banded.find((b) => b.outliers.length > 0);
    if (withOutlier) {
      const o = withOutlier.outliers[0];
      const arah = o.direction === 'above' ? 'di atas' : 'di bawah';
      lines.push(
        `- Harga ${withOutlier.sku_name}: rentang Rp${withOutlier.p_min}–Rp${withOutlier.p_max} (median Rp${withOutlier.p_median}) dari ${withOutlier.n_invoices} invoice; ada harga ${arah} kewajaran dari ${o.supplier_name ?? 'distributor'} di ${o.region_name ?? 'wilayah tsb'} — cek invoice #${o.cite}.`,
      );
    } else if (banded[0]) {
      const b = banded[0];
      lines.push(
        `- Harga ${b.sku_name}: rentang Rp${b.p_min}–Rp${b.p_max} (median Rp${b.p_median}, spread ${b.spread_pct}%) dari ${b.n_invoices} invoice tersampel — contoh invoice #${b.invoices[0].cite}.`,
      );
    }

    // Point 2 — head-to-head price gap (same-receipt TACO vs competitor, R3).
    const topGap = signals.price_gaps.pairs[0];
    if (topGap) {
      const arah = topGap.gap_rp >= 0 ? 'di atas' : 'di bawah';
      lines.push(
        `- Adu harga nota-sama: ${topGap.taco_sku_name} (Rp${topGap.taco_unit_price}) ${arah} ${topGap.competitor_brand_name} (Rp${topGap.competitor_unit_price}) — selisih ${Math.abs(topGap.gap_pct)}%${topGap.region_name ? ` di ${topGap.region_name}` : ''}, lihat invoice #${topGap.cite}.`,
      );
    } else if (signals.price_gaps.unknown_competitor_count > 0 && anyCite) {
      lines.push(
        `- Ada ${signals.price_gaps.unknown_competitor_count} observasi kompetitor pada nota yang memuat TACO, namun mereknya belum dikenali sehingga belum bisa diadu harga — lihat invoice #${anyCite}.`,
      );
    }

    // Point 3 — most-frequently-seen SKU in a sampled area (R1, occurrence).
    const areaWithSku = signals.top_skus_per_area.find(
      (r) => r.skus.length > 0,
    );
    if (areaWithSku && anyCite) {
      const top = areaWithSku.skus[0];
      lines.push(
        `- Di ${areaWithSku.region_name}, ${top.sku_name} paling sering muncul (di ${top.occurrence_pct}% invoice tersampel wilayah itu) — mis. invoice #${anyCite}.`,
      );
    }

    return lines.join('\n');
  }
}
