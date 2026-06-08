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
} from '../database/entities/taro-invoice-recommendation.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { QUEUE_TARO_OCR } from './taro-invoices.constants';

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
    @InjectQueue(QUEUE_TARO_OCR) private readonly ocrQueue: Queue,
  ) {
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  // ---- Upload ----

  async bulkUpload(
    files: Express.Multer.File[],
    uploadedBy: string | null,
  ): Promise<Array<{ id: string; file_name: string; status: TaroInvoiceStatus }>> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required (multipart field "files")');
    }

    const results: Array<{ id: string; file_name: string; status: TaroInvoiceStatus }> = [];
    for (const file of files) {
      // Insert a row first so we get the UUID, then persist the file under the
      // canonical name `${id}${ext}`. Image streaming resolves by id prefix —
      // no separate disk-path column required.
      const invoice = await this.invoicesRepo.save(
        this.invoicesRepo.create({
          uploaded_by: uploadedBy,
          status: TaroInvoiceStatus.PROCESSING,
          raw_image_url: '',
          file_name: file.originalname,
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

      results.push({ id: invoice.id, file_name: file.originalname, status: invoice.status });
    }
    return results;
  }

  // ---- Listing ----

  async list(params: {
    status?: TaroInvoiceStatus;
    needs_review?: boolean;
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
      line_count: number;
      low_confidence_count: number;
      needs_review_count: number;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const { status, needs_review, page, limit } = params;
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
    if (needs_review === true) {
      qb.andHaving('COUNT(li.id) FILTER (WHERE li.needs_review = true) > 0');
    } else if (needs_review === false) {
      qb.andHaving('COUNT(li.id) FILTER (WHERE li.needs_review = true) = 0');
    }

    // Total — separate count query so the GROUP BY doesn't break pagination math.
    const totalQb = this.invoicesRepo.createQueryBuilder('inv');
    if (status) totalQb.where('inv.status = :status', { status });
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

  async analytics(): Promise<{
    total_invoices: number;
    processed_count: number;
    needs_review_count: number;
    avg_confidence: number;
    top_uploaded_skus: Array<{ sku_id: string; sku_code: string; sku_name: string; count: number }>;
    low_confidence_skus: Array<{ sku_id: string; sku_code: string; sku_name: string; avg_confidence: number; line_count: number }>;
    monthly_volume: Array<{ month: string; count: number }>;
  }> {
    const totals = await this.invoicesRepo
      .createQueryBuilder('inv')
      .select('COUNT(*)::int', 'total_invoices')
      .addSelect(
        `COUNT(*) FILTER (WHERE inv.status = 'done')::int`,
        'processed_count',
      )
      .getRawOne();

    const reviewRow = await this.lineItemsRepo
      .createQueryBuilder('li')
      .select('COUNT(*) FILTER (WHERE li.needs_review = true)::int', 'needs_review_count')
      .addSelect('COALESCE(AVG(li.confidence_score), 0)::float', 'avg_confidence')
      .getRawOne();

    const topSkus = await this.lineItemsRepo
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
      .limit(10)
      .getRawMany();

    const lowConfSkus = await this.lineItemsRepo
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
      .limit(10)
      .getRawMany();

    const monthly = await this.invoicesRepo
      .createQueryBuilder('inv')
      .select(`to_char(date_trunc('month', inv.uploaded_at), 'YYYY-MM')`, 'month')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy(`date_trunc('month', inv.uploaded_at)`)
      .orderBy(`date_trunc('month', inv.uploaded_at)`, 'ASC')
      .getRawMany();

    return {
      total_invoices: totals?.total_invoices ?? 0,
      processed_count: totals?.processed_count ?? 0,
      needs_review_count: reviewRow?.needs_review_count ?? 0,
      avg_confidence: Number(reviewRow?.avg_confidence ?? 0),
      top_uploaded_skus: topSkus,
      low_confidence_skus: lowConfSkus,
      monthly_volume: monthly,
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
