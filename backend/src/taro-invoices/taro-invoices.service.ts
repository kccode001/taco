import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import * as path from 'path';
import * as fs from 'fs';
import { TaroInvoice, TaroInvoiceStatus } from '../database/entities/taro-invoice.entity';
import { TaroInvoiceLineItem } from '../database/entities/taro-invoice-line-item.entity';
import { TaroInvoiceSkuCorrection } from '../database/entities/taro-invoice-sku-correction.entity';
import {
  TaroInvoiceRecommendation,
  TaroRecommendationStatus,
  TaroRecommendationType,
} from '../database/entities/taro-invoice-recommendation.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { TaroMappingRule } from '../database/entities/taro-mapping-rule.entity';
import { QUEUE_TARO_OCR } from './taro-invoices.constants';
import { RegionsService } from '../regions/regions.service';

const CONFIDENCE_THRESHOLD = 0.85;

@Injectable()
export class TaroInvoicesService {
  private readonly uploadDir = path.join(
    process.cwd(),
    process.env.UPLOAD_DIR ?? 'uploads',
    'taro-invoices',
  );

  constructor(
    @InjectRepository(TaroInvoice)
    private readonly invoicesRepo: Repository<TaroInvoice>,
    @InjectRepository(TaroInvoiceLineItem)
    private readonly lineItemsRepo: Repository<TaroInvoiceLineItem>,
    @InjectRepository(TaroInvoiceSkuCorrection)
    private readonly correctionsRepo: Repository<TaroInvoiceSkuCorrection>,
    @InjectRepository(TaroInvoiceRecommendation)
    private readonly recsRepo: Repository<TaroInvoiceRecommendation>,
    @InjectRepository(TacoSku)
    private readonly skusRepo: Repository<TacoSku>,
    @InjectRepository(TaroMappingRule)
    private readonly mappingRulesRepo: Repository<TaroMappingRule>,
    @InjectQueue(QUEUE_TARO_OCR) private readonly ocrQueue: Queue,
    private readonly regions: RegionsService,
  ) {
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  // ---- Upload ----

  async bulkUpload(
    files: Express.Multer.File[],
    uploadedBy: string | null,
    regionId: string | null,
  ): Promise<Array<{ id: string; file_name: string; status: TaroInvoiceStatus; region_id: string | null }>> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required (multipart field "files")');
    }

    if (regionId) {
      await this.regions.assertIsArea(regionId);
    }

    const results: Array<{ id: string; file_name: string; status: TaroInvoiceStatus; region_id: string | null }> = [];
    for (const file of files) {
      // Insert a row first so we get the UUID, then persist the file under the
      // canonical name `${id}${ext}`. Image streaming resolves by id prefix —
      // no separate disk-path column required.
      const invoice = await this.invoicesRepo.save(
        this.invoicesRepo.create({
          uploaded_by: uploadedBy,
          status: TaroInvoiceStatus.QUEUED,
          progress_percent: 0,
          raw_image_url: '',
          file_name: file.originalname,
          region_id: regionId,
        }),
      );
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      const canonicalPath = path.join(this.uploadDir, `${invoice.id}${ext}`);
      fs.writeFileSync(canonicalPath, file.buffer);

      invoice.raw_image_url = `/api/taro-invoices/${invoice.id}/image`;
      await this.invoicesRepo.save(invoice);

      await this.ocrQueue.add('process-taro-invoice', {
        invoiceId: invoice.id,
        imagePath: canonicalPath,
      });

      results.push({
        id: invoice.id,
        file_name: file.originalname,
        status: invoice.status,
        region_id: regionId,
      });
    }
    return results;
  }

  // ---- Upload progress (refresh-resilient) ----

  async inProgressForUser(userId: string | null): Promise<Array<{
    id: string;
    file_name: string | null;
    status: TaroInvoiceStatus;
    progress_percent: number;
    uploaded_at: Date;
    region: { id: string; code: string; name: string; display_path: string } | null;
  }>> {
    if (!userId) return [];
    const rows = await this.invoicesRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.region', 'region')
      .where('inv.uploaded_by = :uid', { uid: userId })
      .andWhere(`inv.status IN ('processing', 'queued')`)
      .andWhere(`inv.uploaded_at > NOW() - INTERVAL '24 hours'`)
      .orderBy('inv.uploaded_at', 'DESC')
      .getMany();

    return rows.map((r) => ({
      id: r.id,
      file_name: r.file_name,
      status: r.status,
      progress_percent: r.progress_percent ?? 0,
      uploaded_at: r.uploaded_at,
      region: r.region
        ? {
            id: r.region.id,
            code: r.region.code,
            name: r.region.name,
            display_path: r.region.display_path,
          }
        : null,
    }));
  }

  // ---- Recommendation apply/reject ----

  async applyRecommendation(
    id: string,
  ): Promise<{ applied: boolean; recommendation: TaroInvoiceRecommendation; result?: unknown; not_implemented?: string }> {
    const rec = await this.recsRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Recommendation ${id} not found`);
    if (rec.status !== TaroRecommendationStatus.PENDING) {
      throw new BadRequestException(
        `Recommendation already ${rec.status} — only pending can be applied.`,
      );
    }

    let result: unknown = undefined;
    let notImplemented: string | undefined;

    switch (rec.type) {
      case TaroRecommendationType.ADD_SYNONYM: {
        const payload = rec.suggested_payload as { sku_id?: string; synonym?: string };
        if (!payload.sku_id || !payload.synonym) {
          throw new BadRequestException(
            'Recommendation payload is missing required keys sku_id/synonym',
          );
        }
        const sku = await this.skusRepo.findOne({ where: { id: payload.sku_id } });
        if (!sku) throw new NotFoundException(`TacoSku ${payload.sku_id} not found`);
        const synonyms = sku.product_name_aliases ?? [];
        const next = synonyms.includes(payload.synonym)
          ? synonyms
          : [...synonyms, payload.synonym];
        await this.skusRepo.update(sku.id, { product_name_aliases: next });
        result = { sku_id: sku.id, synonyms_count: next.length };
        break;
      }
      case TaroRecommendationType.CREATE_SKU: {
        notImplemented = 'TODO: create SKU';
        // Mark as DISMISSED (stays out of the queue) and 501 the caller.
        await this.recsRepo.update(rec.id, {
          status: TaroRecommendationStatus.DISMISSED,
        });
        return {
          applied: false,
          recommendation: { ...rec, status: TaroRecommendationStatus.DISMISSED },
          not_implemented: notImplemented,
        };
      }
      case TaroRecommendationType.MAPPING_RULE: {
        const payload = rec.suggested_payload as { rule_text?: string };
        const text = (payload.rule_text ?? rec.body ?? '').trim();
        if (!text) {
          throw new BadRequestException(
            'Recommendation payload is missing rule_text and body is empty',
          );
        }
        const saved = await this.mappingRulesRepo.save(
          this.mappingRulesRepo.create({
            rule_text: text,
            source_recommendation_id: rec.id,
          }),
        );
        result = { rule_id: saved.id };
        break;
      }
    }

    rec.status = TaroRecommendationStatus.APPLIED;
    rec.applied_at = new Date();
    const updated = await this.recsRepo.save(rec);
    return { applied: true, recommendation: updated, result };
  }

  async rejectRecommendation(id: string): Promise<TaroInvoiceRecommendation> {
    const rec = await this.recsRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Recommendation ${id} not found`);
    if (rec.status !== TaroRecommendationStatus.PENDING) {
      throw new BadRequestException(
        `Recommendation already ${rec.status} — only pending can be dismissed.`,
      );
    }
    rec.status = TaroRecommendationStatus.DISMISSED;
    return this.recsRepo.save(rec);
  }

  // ---- Listing ----

  async list(params: {
    status?: TaroInvoiceStatus;
    needs_review?: boolean;
    region_id?: string;
    page: number;
    limit: number;
  }): Promise<{
    data: Array<{
      id: string;
      uploaded_at: Date;
      status: TaroInvoiceStatus;
      supplier_name: string | null;
      invoice_date: string | null;
      total_amount: string | null;
      file_name: string | null;
      region_id: string | null;
      line_count: number;
      low_confidence_count: number;
      needs_review_count: number;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const { status, needs_review, region_id, page, limit } = params;
    const offset = (page - 1) * limit;

    const qb = this.invoicesRepo
      .createQueryBuilder('inv')
      .leftJoin('inv.line_items', 'li')
      .select('inv.id', 'id')
      .addSelect('inv.uploaded_at', 'uploaded_at')
      .addSelect('inv.status', 'status')
      .addSelect('inv.supplier_name', 'supplier_name')
      .addSelect('inv.invoice_date', 'invoice_date')
      .addSelect('inv.total_amount', 'total_amount')
      .addSelect('inv.file_name', 'file_name')
      .addSelect('inv.region_id', 'region_id')
      .addSelect('COUNT(li.id)::int', 'line_count')
      .addSelect(
        `COUNT(li.id) FILTER (WHERE li.confidence_score < ${CONFIDENCE_THRESHOLD})::int`,
        'low_confidence_count',
      )
      .addSelect(
        'COUNT(li.id) FILTER (WHERE li.needs_review = true)::int',
        'needs_review_count',
      )
      .groupBy('inv.id')
      .orderBy('inv.uploaded_at', 'DESC');

    if (status) qb.andWhere('inv.status = :status', { status });
    if (region_id) qb.andWhere('inv.region_id = :rid', { rid: region_id });
    if (needs_review === true) {
      qb.andHaving('COUNT(li.id) FILTER (WHERE li.needs_review = true) > 0');
    } else if (needs_review === false) {
      qb.andHaving('COUNT(li.id) FILTER (WHERE li.needs_review = true) = 0');
    }

    // Total — separate count query so the GROUP BY doesn't break pagination math.
    const totalQb = this.invoicesRepo.createQueryBuilder('inv');
    if (status) totalQb.andWhere('inv.status = :status', { status });
    if (region_id) totalQb.andWhere('inv.region_id = :rid', { rid: region_id });
    const total = await totalQb.getCount();

    const raw = await qb.offset(offset).limit(limit).getRawMany();
    return {
      data: raw.map((r) => ({
        id: r.id,
        uploaded_at: r.uploaded_at,
        status: r.status,
        supplier_name: r.supplier_name,
        invoice_date: r.invoice_date,
        total_amount: r.total_amount,
        file_name: r.file_name,
        region_id: r.region_id ?? null,
        line_count: r.line_count ?? 0,
        low_confidence_count: r.low_confidence_count ?? 0,
        needs_review_count: r.needs_review_count ?? 0,
      })),
      total,
      page,
      limit,
    };
  }

  // ---- Detail ----

  async findOne(id: string): Promise<TaroInvoice> {
    const inv = await this.invoicesRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.line_items', 'li')
      .leftJoinAndSelect('li.matched_sku', 'sku')
      .where('inv.id = :id', { id })
      .orderBy('li.line_no', 'ASC')
      .getOne();
    if (!inv) throw new NotFoundException(`TaroInvoice ${id} not found`);
    return inv;
  }

  // ---- Line-item patch ----

  async patchLineItem(
    lineItemId: string,
    correctedBy: string | null,
    body: { matched_sku_id?: string | null; reason?: string },
  ): Promise<TaroInvoiceLineItem> {
    const li = await this.lineItemsRepo.findOne({ where: { id: lineItemId } });
    if (!li) throw new NotFoundException(`TaroInvoiceLineItem ${lineItemId} not found`);

    const skuChanged =
      body.matched_sku_id !== undefined && body.matched_sku_id !== li.matched_sku_id;

    if (skuChanged && (!body.reason || body.reason.trim().length === 0)) {
      throw new BadRequestException('reason is required when changing matched_sku_id');
    }

    const originalSkuId = li.matched_sku_id;

    if (body.matched_sku_id !== undefined) {
      li.matched_sku_id = body.matched_sku_id;
    }
    li.edited = true;
    // Recompute needs_review using current confidence + new mapping.
    const conf = parseFloat(li.confidence_score);
    li.needs_review = (Number.isNaN(conf) ? 0 : conf) < CONFIDENCE_THRESHOLD || !li.matched_sku_id;

    const saved = await this.lineItemsRepo.save(li);

    if (skuChanged && body.matched_sku_id) {
      await this.correctionsRepo.save(
        this.correctionsRepo.create({
          line_item_id: saved.id,
          original_sku_id: originalSkuId,
          corrected_sku_id: body.matched_sku_id,
          reason: (body.reason ?? '').trim(),
          corrected_by: correctedBy,
        }),
      );
    }

    return saved;
  }

  // ---- Recommendations ----

  listPendingRecommendations(
    status: TaroRecommendationStatus = TaroRecommendationStatus.PENDING,
  ): Promise<TaroInvoiceRecommendation[]> {
    return this.recsRepo.find({
      where: { status },
      order: { generated_at: 'DESC' },
    });
  }

  // ---- Analytics ----

  async analytics(regionId?: string): Promise<{
    region_id: string | null;
    total_invoices: number;
    processed_count: number;
    needs_review_count: number;
    avg_confidence: number;
    top_uploaded_skus: Array<{ sku_id: string; sku_code: string; sku_name: string; count: number }>;
    low_confidence_skus: Array<{ sku_id: string; sku_code: string; sku_name: string; avg_confidence: number; line_count: number }>;
    monthly_volume: Array<{ month: string; count: number }>;
    regions_summary: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      invoice_count: number;
      total_line_items: number;
      avg_confidence: number;
      needs_review_rate: number;
    }>;
    region_monthly: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      months: Array<{ month: string; invoices: number }>;
    }>;
    top_skus_by_region: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      top_skus: Array<{ sku: { code: string; name: string; category: string | null }; count: number }>;
    }>;
    region_price_extremes: Array<{
      sku: { code: string; name: string; category: string | null };
      region: { id: string | null; code: string; name: string; display_path: string };
      avg_price: number;
      is_min: boolean;
      is_max: boolean;
    }>;
  }> {
    // Helper to apply region scope on either an invoice-rooted or a line-item-rooted QB.
    const scopeInvoice = <T extends import('typeorm').SelectQueryBuilder<any>>(qb: T): T => {
      if (regionId) qb.andWhere('inv.region_id = :rid', { rid: regionId });
      return qb;
    };

    const totals = await scopeInvoice(
      this.invoicesRepo
        .createQueryBuilder('inv')
        .select('COUNT(*)::int', 'total_invoices')
        .addSelect(
          `COUNT(*) FILTER (WHERE inv.status = 'done')::int`,
          'processed_count',
        ),
    ).getRawOne();

    const reviewQb = this.lineItemsRepo
      .createQueryBuilder('li')
      .select('COUNT(*) FILTER (WHERE li.needs_review = true)::int', 'needs_review_count')
      .addSelect('COALESCE(AVG(li.confidence_score), 0)::float', 'avg_confidence');
    if (regionId) {
      reviewQb.innerJoin('taro_invoices', 'inv', 'inv.id = li.invoice_id')
        .andWhere('inv.region_id = :rid', { rid: regionId });
    }
    const reviewRow = await reviewQb.getRawOne();

    const topSkusQb = this.lineItemsRepo
      .createQueryBuilder('li')
      .innerJoin(TacoSku, 'sku', 'sku.id = li.matched_sku_id')
      .select('sku.id', 'sku_id')
      .addSelect('sku.code', 'sku_code')
      .addSelect('sku.name', 'sku_name')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('sku.id')
      .addGroupBy('sku.code')
      .addGroupBy('sku.name')
      .orderBy('count', 'DESC')
      .limit(10);
    if (regionId) {
      topSkusQb.innerJoin('taro_invoices', 'inv', 'inv.id = li.invoice_id')
        .andWhere('inv.region_id = :rid', { rid: regionId });
    }
    const topSkus = await topSkusQb.getRawMany();

    const lowConfQb = this.lineItemsRepo
      .createQueryBuilder('li')
      .innerJoin(TacoSku, 'sku', 'sku.id = li.matched_sku_id')
      .select('sku.id', 'sku_id')
      .addSelect('sku.code', 'sku_code')
      .addSelect('sku.name', 'sku_name')
      .addSelect('AVG(li.confidence_score)::float', 'avg_confidence')
      .addSelect('COUNT(*)::int', 'line_count')
      .groupBy('sku.id')
      .addGroupBy('sku.code')
      .addGroupBy('sku.name')
      .having('AVG(li.confidence_score) < :t', { t: CONFIDENCE_THRESHOLD })
      .orderBy('avg_confidence', 'ASC')
      .limit(10);
    if (regionId) {
      lowConfQb.innerJoin('taro_invoices', 'inv', 'inv.id = li.invoice_id')
        .andWhere('inv.region_id = :rid', { rid: regionId });
    }
    const lowConfSkus = await lowConfQb.getRawMany();

    const monthly = await scopeInvoice(
      this.invoicesRepo
        .createQueryBuilder('inv')
        .select(`to_char(date_trunc('month', inv.uploaded_at), 'YYYY-MM')`, 'month')
        .addSelect('COUNT(*)::int', 'count'),
    )
      .groupBy(`date_trunc('month', inv.uploaded_at)`)
      .orderBy(`date_trunc('month', inv.uploaded_at)`, 'ASC')
      .getRawMany();

    const regional = await this.computeRegionalAggregates(regionId);

    return {
      region_id: regionId ?? null,
      total_invoices: totals?.total_invoices ?? 0,
      processed_count: totals?.processed_count ?? 0,
      needs_review_count: reviewRow?.needs_review_count ?? 0,
      avg_confidence: Number(reviewRow?.avg_confidence ?? 0),
      top_uploaded_skus: topSkus,
      low_confidence_skus: lowConfSkus,
      monthly_volume: monthly,
      regions_summary: regional.regions_summary,
      region_monthly: regional.region_monthly,
      top_skus_by_region: regional.top_skus_by_region,
      region_price_extremes: regional.region_price_extremes,
    };
  }

  /**
   * Build the four region-flavoured arrays. Split out so `analytics()` stays
   * readable.
   *
   *   regions_summary       — every ASM area + "Tanpa Region" bucket
   *                           (sorted by invoice_count desc)
   *   region_monthly        — last 6 months of invoice counts per region with
   *                           >0 invoices
   *   top_skus_by_region    — top 5 line-item SKUs per region with >0 invoices
   *   region_price_extremes — 10 SKUs that show the widest avg-price spread
   *                           across regions (returns the min + max row pair)
   *
   * When `regionId` is set, all four collapse to that region's slice and
   * `region_price_extremes` is empty (cross-region context is N/A).
   */
  private async computeRegionalAggregates(regionId?: string): Promise<{
    regions_summary: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      invoice_count: number;
      total_line_items: number;
      avg_confidence: number;
      needs_review_rate: number;
    }>;
    region_monthly: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      months: Array<{ month: string; invoices: number }>;
    }>;
    top_skus_by_region: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      top_skus: Array<{ sku: { code: string; name: string; category: string | null }; count: number }>;
    }>;
    region_price_extremes: Array<{
      sku: { code: string; name: string; category: string | null };
      region: { id: string | null; code: string; name: string; display_path: string };
      avg_price: number;
      is_min: boolean;
      is_max: boolean;
    }>;
  }> {
    // --- All areas + "Tanpa Region" pseudo-bucket ---
    // When scoped, we only need that one area row (no Tanpa Region) so the
    // dashboard keeps showing "your" KPIs without a noisy null bucket.
    let areaRows: Array<{ id: string; code: string; name: string; display_path: string }>;
    if (regionId) {
      const r = await this.regions.findOne(regionId);
      areaRows = [{ id: r.id, code: r.code, name: r.name, display_path: r.display_path }];
    } else {
      const all = await this.regions.areas();
      areaRows = all.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        display_path: r.display_path,
      }));
    }

    const TANPA_REGION = {
      id: null as string | null,
      code: 'TANPA-REGION',
      name: 'Tanpa Region',
      display_path: 'Tanpa Region',
    };

    // --- regions_summary ---
    // Group by region_id once and fan back out across `areaRows` so areas with
    // zero invoices still render — `regionsRowsRaw` only includes regions that
    // have at least one invoice.
    const summaryRowsRaw = await this.invoicesRepo.query(
      `
      SELECT
        inv.region_id AS region_id,
        COUNT(DISTINCT inv.id)::int AS invoice_count,
        COUNT(li.id)::int AS total_line_items,
        COALESCE(AVG(li.confidence_score), 0)::float AS avg_confidence,
        CASE WHEN COUNT(li.id) = 0 THEN 0
             ELSE (COUNT(li.id) FILTER (WHERE li.needs_review = true))::float
                  / COUNT(li.id)::float
        END AS needs_review_rate
      FROM taro_invoices inv
      LEFT JOIN taro_invoice_line_items li ON li.invoice_id = inv.id
      ${regionId ? 'WHERE inv.region_id = $1' : ''}
      GROUP BY inv.region_id
      `,
      regionId ? [regionId] : [],
    );
    const summaryByRegion = new Map<string | null, {
      invoice_count: number;
      total_line_items: number;
      avg_confidence: number;
      needs_review_rate: number;
    }>();
    for (const r of summaryRowsRaw as Array<{
      region_id: string | null;
      invoice_count: number;
      total_line_items: number;
      avg_confidence: number;
      needs_review_rate: number;
    }>) {
      summaryByRegion.set(r.region_id, {
        invoice_count: Number(r.invoice_count ?? 0),
        total_line_items: Number(r.total_line_items ?? 0),
        avg_confidence: Number(r.avg_confidence ?? 0),
        needs_review_rate: Number(r.needs_review_rate ?? 0),
      });
    }

    type RegionSummaryRow = {
      region: { id: string | null; code: string; name: string; display_path: string };
      invoice_count: number;
      total_line_items: number;
      avg_confidence: number;
      needs_review_rate: number;
    };
    const regionsSummary: RegionSummaryRow[] = areaRows.map((r) => {
      const agg = summaryByRegion.get(r.id) ?? {
        invoice_count: 0,
        total_line_items: 0,
        avg_confidence: 0,
        needs_review_rate: 0,
      };
      return {
        region: { id: r.id, code: r.code, name: r.name, display_path: r.display_path },
        invoice_count: agg.invoice_count,
        total_line_items: agg.total_line_items,
        avg_confidence: agg.avg_confidence,
        needs_review_rate: agg.needs_review_rate,
      };
    });
    // Append "Tanpa Region" bucket only in global scope.
    if (!regionId) {
      const tanpa = summaryByRegion.get(null);
      regionsSummary.push({
        region: TANPA_REGION,
        invoice_count: tanpa?.invoice_count ?? 0,
        total_line_items: tanpa?.total_line_items ?? 0,
        avg_confidence: tanpa?.avg_confidence ?? 0,
        needs_review_rate: tanpa?.needs_review_rate ?? 0,
      });
    }
    regionsSummary.sort((a, b) => b.invoice_count - a.invoice_count);

    // --- region_monthly: last 6 months, one row per region with >0 invoices ---
    const monthlyRows = await this.invoicesRepo.query(
      `
      SELECT
        inv.region_id AS region_id,
        to_char(date_trunc('month', inv.uploaded_at), 'YYYY-MM') AS month,
        COUNT(*)::int AS invoices
      FROM taro_invoices inv
      WHERE inv.uploaded_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        ${regionId ? 'AND inv.region_id = $1' : ''}
      GROUP BY inv.region_id, date_trunc('month', inv.uploaded_at)
      ORDER BY inv.region_id NULLS LAST, date_trunc('month', inv.uploaded_at) ASC
      `,
      regionId ? [regionId] : [],
    );

    // Build last-6-months window labels (oldest first) so frontend gets a
    // contiguous series even where some months are empty.
    const monthLabels: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      monthLabels.push(`${yyyy}-${mm}`);
    }

    const monthlyByRegion = new Map<string | null, Map<string, number>>();
    for (const r of monthlyRows as Array<{
      region_id: string | null;
      month: string;
      invoices: number;
    }>) {
      const key = r.region_id;
      const inner = monthlyByRegion.get(key) ?? new Map<string, number>();
      inner.set(r.month, Number(r.invoices));
      monthlyByRegion.set(key, inner);
    }

    const regionByIdLookup = new Map<string, typeof areaRows[number]>();
    for (const a of areaRows) regionByIdLookup.set(a.id, a);

    const regionMonthly: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      months: Array<{ month: string; invoices: number }>;
    }> = [];

    // Iterate using summary order (already sorted by invoice_count desc) so the
    // heaviest region surfaces first.
    for (const s of regionsSummary) {
      if (s.invoice_count === 0) continue;
      const key = s.region.id;
      const inner = monthlyByRegion.get(key) ?? new Map<string, number>();
      regionMonthly.push({
        region: s.region,
        months: monthLabels.map((m) => ({ month: m, invoices: inner.get(m) ?? 0 })),
      });
    }

    // --- top_skus_by_region: top 5 SKUs per region (regions with >0 invoices) ---
    const topByRegionRows = await this.invoicesRepo.query(
      `
      SELECT region_id, sku_code, sku_name, sku_category, line_count
      FROM (
        SELECT
          inv.region_id AS region_id,
          sku.code AS sku_code,
          sku.name AS sku_name,
          sku.catalog_category AS sku_category,
          COUNT(*)::int AS line_count,
          ROW_NUMBER() OVER (
            PARTITION BY inv.region_id
            ORDER BY COUNT(*) DESC, sku.code ASC
          ) AS rn
        FROM taro_invoice_line_items li
        INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
        INNER JOIN taco_skus sku ON sku.id = li.matched_sku_id
        ${regionId ? 'WHERE inv.region_id = $1' : ''}
        GROUP BY inv.region_id, sku.code, sku.name, sku.catalog_category
      ) ranked
      WHERE rn <= 5
      ORDER BY region_id NULLS LAST, line_count DESC
      `,
      regionId ? [regionId] : [],
    );
    const topByRegionMap = new Map<string | null, Array<{
      sku: { code: string; name: string; category: string | null };
      count: number;
    }>>();
    for (const r of topByRegionRows as Array<{
      region_id: string | null;
      sku_code: string;
      sku_name: string;
      sku_category: string | null;
      line_count: number;
    }>) {
      const list = topByRegionMap.get(r.region_id) ?? [];
      list.push({
        sku: { code: r.sku_code, name: r.sku_name, category: r.sku_category },
        count: Number(r.line_count),
      });
      topByRegionMap.set(r.region_id, list);
    }
    const topSkusByRegion: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      top_skus: Array<{ sku: { code: string; name: string; category: string | null }; count: number }>;
    }> = [];
    for (const s of regionsSummary) {
      if (s.invoice_count === 0) continue;
      const skus = topByRegionMap.get(s.region.id) ?? [];
      if (skus.length === 0) continue;
      topSkusByRegion.push({ region: s.region, top_skus: skus });
    }

    // --- region_price_extremes ---
    // When scoped to a single region, cross-region price comparison is by
    // definition empty.
    let regionPriceExtremes: Array<{
      sku: { code: string; name: string; category: string | null };
      region: { id: string | null; code: string; name: string; display_path: string };
      avg_price: number;
      is_min: boolean;
      is_max: boolean;
    }> = [];

    if (!regionId) {
      const priceRows = await this.invoicesRepo.query(
        `
        WITH per_sku_region AS (
          SELECT
            sku.id AS sku_id,
            sku.code AS sku_code,
            sku.name AS sku_name,
            sku.catalog_category AS sku_category,
            inv.region_id AS region_id,
            AVG(li.unit_price)::float AS avg_price
          FROM taro_invoice_line_items li
          INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
          INNER JOIN taco_skus sku ON sku.id = li.matched_sku_id
          WHERE inv.region_id IS NOT NULL
            AND li.unit_price IS NOT NULL
            AND li.unit_price > 0
          GROUP BY sku.id, sku.code, sku.name, sku.catalog_category, inv.region_id
        ),
        spreads AS (
          SELECT
            sku_id,
            COUNT(DISTINCT region_id) AS region_count,
            MAX(avg_price) - MIN(avg_price) AS spread
          FROM per_sku_region
          GROUP BY sku_id
          HAVING COUNT(DISTINCT region_id) >= 2
        ),
        top_spreads AS (
          SELECT sku_id, spread
          FROM spreads
          ORDER BY spread DESC
          LIMIT 10
        )
        SELECT psr.sku_id, psr.sku_code, psr.sku_name, psr.sku_category,
               psr.region_id, psr.avg_price, ts.spread
        FROM per_sku_region psr
        INNER JOIN top_spreads ts ON ts.sku_id = psr.sku_id
        ORDER BY ts.spread DESC, psr.sku_code, psr.avg_price ASC
        `,
        [],
      );

      // Group by sku_id, pick min + max region for each, emit two rows per SKU.
      const bySku = new Map<string, Array<{
        sku_code: string;
        sku_name: string;
        sku_category: string | null;
        region_id: string | null;
        avg_price: number;
      }>>();
      for (const r of priceRows as Array<{
        sku_id: string;
        sku_code: string;
        sku_name: string;
        sku_category: string | null;
        region_id: string | null;
        avg_price: number;
        spread: number;
      }>) {
        const list = bySku.get(r.sku_id) ?? [];
        list.push({
          sku_code: r.sku_code,
          sku_name: r.sku_name,
          sku_category: r.sku_category,
          region_id: r.region_id,
          avg_price: Number(r.avg_price),
        });
        bySku.set(r.sku_id, list);
      }

      // Preserve spread ordering by tracking SKU appearance order.
      const seenOrder: string[] = [];
      for (const r of priceRows as Array<{ sku_id: string }>) {
        if (!seenOrder.includes(r.sku_id)) seenOrder.push(r.sku_id);
      }

      for (const skuId of seenOrder) {
        const rows = bySku.get(skuId) ?? [];
        if (rows.length < 2) continue;
        let minRow = rows[0];
        let maxRow = rows[0];
        for (const row of rows) {
          if (row.avg_price < minRow.avg_price) minRow = row;
          if (row.avg_price > maxRow.avg_price) maxRow = row;
        }
        const minRegion = minRow.region_id
          ? regionByIdLookup.get(minRow.region_id) ?? TANPA_REGION
          : TANPA_REGION;
        const maxRegion = maxRow.region_id
          ? regionByIdLookup.get(maxRow.region_id) ?? TANPA_REGION
          : TANPA_REGION;
        regionPriceExtremes.push({
          sku: { code: minRow.sku_code, name: minRow.sku_name, category: minRow.sku_category },
          region: {
            id: minRegion.id,
            code: minRegion.code,
            name: minRegion.name,
            display_path: minRegion.display_path,
          },
          avg_price: minRow.avg_price,
          is_min: true,
          is_max: false,
        });
        regionPriceExtremes.push({
          sku: { code: maxRow.sku_code, name: maxRow.sku_name, category: maxRow.sku_category },
          region: {
            id: maxRegion.id,
            code: maxRegion.code,
            name: maxRegion.name,
            display_path: maxRegion.display_path,
          },
          avg_price: maxRow.avg_price,
          is_min: false,
          is_max: true,
        });
      }
    }

    return {
      regions_summary: regionsSummary,
      region_monthly: regionMonthly,
      top_skus_by_region: topSkusByRegion,
      region_price_extremes: regionPriceExtremes,
    };
  }

  // ---- Image streaming ----

  imagePath(id: string): string {
    // Files are stored as `${id}${ext}` for some extension; resolve by listing.
    const matches = fs
      .readdirSync(this.uploadDir)
      .filter((f) => f.startsWith(id));
    if (matches.length === 0) {
      throw new NotFoundException(`Image for TaroInvoice ${id} not found`);
    }
    return path.join(this.uploadDir, matches[0]);
  }
}
