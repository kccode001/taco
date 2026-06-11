import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository, In } from 'typeorm';
import type { Queue } from 'bull';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { InvoiceV2 } from '../database/entities/v2/invoice-v2.entity';
import { InvoiceImageV2 } from '../database/entities/v2/invoice-image-v2.entity';
import { InvoiceLineItemV2 } from '../database/entities/v2/invoice-line-item-v2.entity';
import { Region } from '../database/entities/region.entity';
import { StoreV2 } from '../database/entities/v2/store-v2.entity';
import { CompetitorBrand } from '../database/entities/competitor-brand.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import {
  InvoiceV2Status,
  InvoiceImageV2ValidationStatus,
  isTacoClassification,
} from '../database/entities/v2/invoice-v2.enums';
import { ImageValidationService } from './image-validation.service';
import { PatchLineItemV2Dto } from './dto/patch-line-item-v2.dto';
import { CreateInvoiceV2Dto } from './dto/create-invoice-v2.dto';
import {
  QUEUE_TARO_V2_OCR,
  JOB_PROCESS_TARO_V2,
  TARO_V2_UPLOAD_SUBDIR,
  TARO_V2_IMAGE_SCOPE,
} from './taro-v2.constants';

interface AuthedUser {
  id: string;
  email?: string;
  role: string;
}

/** Indonesian-facing status labels for the FE. */
export const INVOICE_V2_STATUS_LABELS: Record<InvoiceV2Status, string> = {
  [InvoiceV2Status.VALIDATING]: 'Memvalidasi',
  [InvoiceV2Status.OCR_PROCESSING]: 'Memproses',
  [InvoiceV2Status.NEEDS_REVIEW]: 'Perlu Review',
  [InvoiceV2Status.DONE]: 'Selesai',
  [InvoiceV2Status.FAILED]: 'Gagal',
};

@Injectable()
export class InvoicesV2Service {
  private readonly logger = new Logger(InvoicesV2Service.name);
  private readonly uploadDir = path.join(
    process.cwd(),
    process.env.UPLOAD_DIR ?? 'uploads',
    TARO_V2_UPLOAD_SUBDIR,
  );

  constructor(
    @InjectRepository(InvoiceV2)
    private readonly invoicesRepo: Repository<InvoiceV2>,
    @InjectRepository(InvoiceImageV2)
    private readonly imagesRepo: Repository<InvoiceImageV2>,
    @InjectRepository(InvoiceLineItemV2)
    private readonly lineItemsRepo: Repository<InvoiceLineItemV2>,
    @InjectRepository(Region)
    private readonly areasRepo: Repository<Region>,
    @InjectRepository(StoreV2)
    private readonly storesRepo: Repository<StoreV2>,
    @InjectRepository(CompetitorBrand)
    private readonly brandsRepo: Repository<CompetitorBrand>,
    @InjectRepository(TacoSku)
    private readonly skusRepo: Repository<TacoSku>,
    @InjectQueue(QUEUE_TARO_V2_OCR) private readonly ocrQueue: Queue,
    private readonly validation: ImageValidationService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  // ---------------------------------------------------------------- create

  /**
   * Create an invoice at upload step-1. Resolves the store: an existing
   * `store_id`, or a free-typed `store_name` saved under the area for reuse.
   */
  async create(dto: CreateInvoiceV2Dto, user: AuthedUser): Promise<InvoiceV2> {
    const area = await this.areasRepo.findOne({ where: { id: dto.area_id } });
    if (!area) throw new BadRequestException('Unknown area_id');

    let storeId = dto.store_id ?? null;
    if (storeId) {
      const store = await this.storesRepo.findOne({ where: { id: storeId } });
      if (!store) throw new BadRequestException('Unknown store_id');
      if (store.area_id !== area.id) {
        throw new BadRequestException('store_id does not belong to area_id');
      }
    } else {
      const name = (dto.store_name ?? '').trim();
      if (!name)
        throw new BadRequestException('store_id or store_name is required');
      storeId = await this.findOrCreateStore(area.id, name, user.id);
    }

    const invoice = await this.invoicesRepo.save(
      this.invoicesRepo.create({
        area_id: area.id,
        store_id: storeId,
        uploaded_by: user.id ?? null,
        status: InvoiceV2Status.VALIDATING,
        notes: dto.notes?.trim() || null,
        progress_percent: 0,
      }),
    );
    return invoice;
  }

  /** Find a store by case-insensitive name within an area, or create it. */
  private async findOrCreateStore(
    areaId: string,
    name: string,
    userId: string,
  ): Promise<string> {
    const existing = await this.storesRepo
      .createQueryBuilder('s')
      .where('s.area_id = :areaId', { areaId })
      .andWhere('LOWER(s.name) = LOWER(:name)', { name })
      .getOne();
    if (existing) return existing.id;
    const store = await this.storesRepo.save(
      this.storesRepo.create({
        area_id: areaId,
        name,
        created_by: userId ?? null,
      }),
    );
    return store.id;
  }

  // ---------------------------------------------------------------- images

  /** Attach uploaded images (multi-photo / gallery) to an invoice as pending. */
  async addImages(
    invoiceId: string,
    files: Express.Multer.File[],
    user: AuthedUser,
  ): Promise<InvoiceImageV2[]> {
    const invoice = await this.findInvoiceOrThrow(invoiceId, user);
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }
    const saved: InvoiceImageV2[] = [];
    for (const file of files) {
      const row = await this.imagesRepo.save(
        this.imagesRepo.create({
          invoice_id: invoice.id,
          file_path: '',
          file_name: file.originalname ?? null,
          validation_status: InvoiceImageV2ValidationStatus.PENDING,
        }),
      );
      const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
      const filePath = path.join(this.uploadDir, `${row.id}${ext}`);
      fs.writeFileSync(filePath, file.buffer);
      row.file_path = filePath;
      saved.push(await this.imagesRepo.save(row));
    }
    // Re-arming after an add: an invoice that had failed/processed goes back to
    // validating since there are now unvalidated images.
    if (invoice.status !== InvoiceV2Status.VALIDATING) {
      await this.invoicesRepo.update(invoice.id, {
        status: InvoiceV2Status.VALIDATING,
      });
    }
    return saved;
  }

  /**
   * Validate the invoice's PENDING images only (idempotent re-validate — already
   * valid/invalid images are left untouched). Returns the full image set + a
   * summary so the FE knows whether upload can complete.
   */
  async validate(
    invoiceId: string,
    user: AuthedUser,
  ): Promise<{
    images: InvoiceImageV2[];
    all_valid: boolean;
    pending_count: number;
  }> {
    const invoice = await this.findInvoiceOrThrow(invoiceId, user);
    const pending = await this.imagesRepo.find({
      where: {
        invoice_id: invoice.id,
        validation_status: InvoiceImageV2ValidationStatus.PENDING,
      },
    });

    for (const image of pending) {
      try {
        const result = await this.validation.validate(image.file_path);
        image.validation_status = result.valid
          ? InvoiceImageV2ValidationStatus.VALID
          : InvoiceImageV2ValidationStatus.INVALID;
        image.invalid_reason = result.invalid_reason;
        image.clarity_ok = result.clarity_ok;
        image.is_invoice = result.is_invoice;
      } catch (e) {
        // Don't hard-fail the batch on one image; mark invalid w/ Indonesian reason.
        this.logger.warn(
          `Validation error for image ${image.id}: ${(e as Error).message}`,
        );
        image.validation_status = InvoiceImageV2ValidationStatus.INVALID;
        image.invalid_reason =
          'Gagal memvalidasi gambar. Mohon coba unggah ulang.';
        image.clarity_ok = null;
        image.is_invoice = null;
      }
      await this.imagesRepo.save(image);
    }

    return this.imageSummary(invoice.id);
  }

  /** Delete an invoice and all its images (physical files + DB cascade). */
  async deleteInvoice(
    invoiceId: string,
    user: AuthedUser,
  ): Promise<{ deleted: true }> {
    const invoice = await this.findInvoiceOrThrow(invoiceId, user);
    const images = await this.imagesRepo.find({
      where: { invoice_id: invoice.id },
    });
    for (const img of images) {
      if (img.file_path && fs.existsSync(img.file_path)) {
        try {
          fs.unlinkSync(img.file_path);
        } catch (e) {
          this.logger.warn(
            `Failed to unlink ${img.file_path}: ${(e as Error).message}`,
          );
        }
      }
    }
    // Images and line_items cascade via DB onDelete:'CASCADE'; deleting the
    // invoice row is sufficient — but explicitly unlink files first (above).
    await this.invoicesRepo.delete({ id: invoice.id });
    return { deleted: true };
  }

  /** Delete an invalid/wrong image (allowed during the upload step). */
  async deleteImage(
    imageId: string,
    user: AuthedUser,
  ): Promise<{ deleted: true }> {
    const image = await this.imagesRepo.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('Image not found');
    await this.findInvoiceOrThrow(image.invoice_id, user);
    if (image.file_path && fs.existsSync(image.file_path)) {
      try {
        fs.unlinkSync(image.file_path);
      } catch (e) {
        this.logger.warn(
          `Failed to unlink ${image.file_path}: ${(e as Error).message}`,
        );
      }
    }
    await this.imagesRepo.delete({ id: image.id });
    return { deleted: true };
  }

  private async imageSummary(invoiceId: string): Promise<{
    images: InvoiceImageV2[];
    all_valid: boolean;
    pending_count: number;
  }> {
    const images = await this.imagesRepo.find({
      where: { invoice_id: invoiceId },
      order: { created_at: 'ASC' },
    });
    const pending_count = images.filter(
      (i) => i.validation_status === InvoiceImageV2ValidationStatus.PENDING,
    ).length;
    const all_valid =
      images.length > 0 &&
      images.every(
        (i) => i.validation_status === InvoiceImageV2ValidationStatus.VALID,
      );
    return { images, all_valid, pending_count };
  }

  // --------------------------------------------------------------- process

  /** Kick OCR + classification. Requires ≥1 image and ALL images valid. */
  async process(
    invoiceId: string,
    user: AuthedUser,
  ): Promise<{ status: InvoiceV2Status }> {
    const invoice = await this.findInvoiceOrThrow(invoiceId, user);
    const { images, all_valid } = await this.imageSummary(invoice.id);
    if (images.length === 0) {
      throw new BadRequestException('Tidak ada gambar untuk diproses');
    }
    if (!all_valid) {
      throw new BadRequestException(
        'Semua gambar harus valid sebelum diproses',
      );
    }
    await this.invoicesRepo.update(invoice.id, {
      status: InvoiceV2Status.OCR_PROCESSING,
      progress_percent: 10,
      error_message: null,
    });
    await this.ocrQueue.add(JOB_PROCESS_TARO_V2, { invoiceId: invoice.id });
    return { status: InvoiceV2Status.OCR_PROCESSING };
  }

  // ------------------------------------------------------------ read paths

  async findOne(invoiceId: string, user: AuthedUser): Promise<InvoiceV2> {
    const invoice = await this.findInvoiceOrThrow(invoiceId, user);
    const [images, lineItems, area, store] = await Promise.all([
      this.imagesRepo.find({
        where: { invoice_id: invoice.id },
        order: { created_at: 'ASC' },
      }),
      this.lineItemsRepo.find({
        where: { invoice_id: invoice.id },
        order: { line_no: 'ASC' },
      }),
      this.areasRepo.findOne({ where: { id: invoice.area_id } }),
      this.storesRepo.findOne({ where: { id: invoice.store_id } }),
    ]);
    invoice.images = images;
    invoice.line_items = lineItems;
    // Header needs Area/Store names — relations exist on the entity but aren't
    // eager-loaded; populate them here so admin detail renders "Toko/Area".
    invoice.area = area ?? undefined;
    invoice.store = store ?? undefined;
    // Authoritative "Status Baris" count — rows still flagged needs_review. The
    // FE must drive its perlu-review badge off this (hide when 0), NOT re-derive
    // from matched_sku_id (which disagrees on auto-matched low-confidence lines).
    (invoice as InvoiceV2 & { needs_review_count: number }).needs_review_count =
      lineItems.filter((l) => l.needs_review === true).length;
    return invoice;
  }

  async list(params: {
    status?: InvoiceV2Status;
    statusIn?: InvoiceV2Status[];
    area_id?: string;
    page: number;
    limit: number;
    user: AuthedUser;
  }): Promise<{
    items: InvoiceV2[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qb = this.invoicesRepo
      .createQueryBuilder('inv')
      .orderBy('inv.created_at', 'DESC')
      .skip((params.page - 1) * params.limit)
      .take(params.limit);
    // A status SET (Pending = every non-done state) takes precedence over an
    // exact single status, so the Antrian Pending/Selesai/Semua filter works.
    if (params.statusIn && params.statusIn.length > 0) {
      qb.andWhere('inv.status IN (:...statuses)', {
        statuses: params.statusIn,
      });
    } else if (params.status) {
      qb.andWhere('inv.status = :status', { status: params.status });
    }
    if (params.area_id)
      qb.andWhere('inv.area_id = :areaId', { areaId: params.area_id });
    // taro_agent → scope to own uploads.
    if (params.user.role === 'taro_agent') {
      qb.andWhere('inv.uploaded_by = :uid', { uid: params.user.id });
    }
    const [items, total] = await qb.getManyAndCount();
    await this.decorateListItems(items);
    return { items, total, page: params.page, limit: params.limit };
  }

  /**
   * Attach the display fields the PWA list needs (Area/Store names, the OCR line
   * count, and a thumbnail image id) onto the bare invoice rows. Batched (one
   * query per relation, keyed by the page's ids) so the list stays O(1) queries
   * regardless of page size — no N+1. Additive: existing fields are untouched, so
   * the admin resolve queue keeps reading the same shape.
   */
  private async decorateListItems(items: InvoiceV2[]): Promise<void> {
    if (items.length === 0) return;
    const areaIds = [...new Set(items.map((i) => i.area_id))];
    const storeIds = [...new Set(items.map((i) => i.store_id))];
    const invoiceIds = items.map((i) => i.id);

    const [areas, stores, lineCounts, reviewCounts, firstImages] =
      await Promise.all([
        this.areasRepo.findBy({ id: In(areaIds) }),
        this.storesRepo.findBy({ id: In(storeIds) }),
        this.lineItemsRepo
          .createQueryBuilder('li')
          .select('li.invoice_id', 'invoice_id')
          .addSelect('COUNT(*)', 'count')
          .where('li.invoice_id IN (:...ids)', { ids: invoiceIds })
          .groupBy('li.invoice_id')
          .getRawMany<{ invoice_id: string; count: string }>(),
        // Authoritative per-invoice count of rows still needing review — same
        // source of truth as the invoice status (NEEDS_REVIEW ⟺ count > 0). Lets
        // the FE drive the "Perlu Review" badge off a number, not re-derivation.
        this.lineItemsRepo
          .createQueryBuilder('li')
          .select('li.invoice_id', 'invoice_id')
          .addSelect('COUNT(*)', 'count')
          .where('li.invoice_id IN (:...ids)', { ids: invoiceIds })
          .andWhere('li.needs_review = true')
          .groupBy('li.invoice_id')
          .getRawMany<{ invoice_id: string; count: string }>(),
        this.imagesRepo.find({
          where: { invoice_id: In(invoiceIds) },
          order: { created_at: 'ASC' },
        }),
      ]);

    const areaById = new Map<string, Region>(areas.map((a) => [a.id, a]));
    const storeById = new Map<string, StoreV2>(stores.map((s) => [s.id, s]));
    const countByInvoice = new Map(
      lineCounts.map((r) => [r.invoice_id, parseInt(r.count, 10) || 0]),
    );
    const reviewByInvoice = new Map(
      reviewCounts.map((r) => [r.invoice_id, parseInt(r.count, 10) || 0]),
    );
    const thumbByInvoice = new Map<string, string>();
    for (const img of firstImages) {
      if (!thumbByInvoice.has(img.invoice_id)) {
        thumbByInvoice.set(img.invoice_id, img.id);
      }
    }

    for (const inv of items) {
      inv.area = areaById.get(inv.area_id) ?? undefined;
      inv.store = storeById.get(inv.store_id) ?? undefined;
      // Non-column display fields — serialized on the JSON response, ignored by
      // the entity persistence layer.
      (inv as InvoiceV2 & { line_count: number }).line_count =
        countByInvoice.get(inv.id) ?? 0;
      (inv as InvoiceV2 & { needs_review_count: number }).needs_review_count =
        reviewByInvoice.get(inv.id) ?? 0;
      (inv as InvoiceV2 & { thumb_image_id: string | null }).thumb_image_id =
        thumbByInvoice.get(inv.id) ?? null;
    }
  }

  // ------------------------------------------------------------- resolve

  /**
   * Admin resolve a v2 line item. Precedence: confirm_as_is → matched_sku_id →
   * brand_id → is_competitor. Each path clears the others. Captures
   * `mismatch_reason` when supplied. Recomputes + returns invoice status.
   */
  async patchLineItem(
    lineItemId: string,
    dto: PatchLineItemV2Dto,
    user: AuthedUser,
  ): Promise<{
    line_item: InvoiceLineItemV2;
    invoice_status: InvoiceV2Status;
    invoice_status_label: string;
  }> {
    const line = await this.lineItemsRepo.findOne({
      where: { id: lineItemId },
    });
    if (!line) throw new NotFoundException('Line item not found');
    const invoice = await this.findInvoiceOrThrow(line.invoice_id, user);

    const hasConfirm = dto.confirm_as_is === true;
    const hasSku = dto.matched_sku_id !== undefined;
    const hasBrand = dto.brand_id !== undefined && dto.brand_id !== null;
    const hasCompetitor = dto.is_competitor === true;

    if (!hasConfirm && !hasSku && !hasBrand && !hasCompetitor) {
      throw new BadRequestException(
        'One of confirm_as_is, matched_sku_id, brand_id, is_competitor is required',
      );
    }

    if (dto.mismatch_reason !== undefined) {
      line.mismatch_reason = dto.mismatch_reason?.trim() || null;
    }

    if (hasConfirm) {
      // "Sudah benar" — keep the current match, just clear the review flag.
      line.needs_review = false;
    } else if (hasSku) {
      const skuId = dto.matched_sku_id;
      if (skuId) {
        const sku = await this.skusRepo.findOne({ where: { id: skuId } });
        if (!sku) throw new BadRequestException('Unknown matched_sku_id');
        line.matched_sku_id = sku.id;
      } else {
        line.matched_sku_id = null;
      }
      // TACO match clears the competitor path.
      line.brand_id = null;
      line.brand_name = null;
      line.is_competitor = false;
      line.needs_review = skuId ? false : true;
    } else if (hasBrand) {
      const brand = await this.brandsRepo.findOne({
        where: { id: dto.brand_id! },
      });
      if (!brand) throw new BadRequestException('Unknown brand_id');
      line.brand_id = brand.id;
      line.brand_name = brand.name;
      line.is_competitor = true;
      line.matched_sku_id = null;
      line.needs_review = false;
    } else if (hasCompetitor) {
      // Competitor but unknown brand.
      line.is_competitor = true;
      line.brand_id = null;
      line.brand_name = null;
      line.matched_sku_id = null;
      line.needs_review = false;
    }

    line.edited = true;
    const savedLine = await this.lineItemsRepo.save(line);

    const status = await this.recomputeInvoiceStatus(invoice.id);
    return {
      line_item: savedLine,
      invoice_status: status,
      invoice_status_label: INVOICE_V2_STATUS_LABELS[status],
    };
  }

  /**
   * Recompute + persist an invoice's status from its line items. Only acts on
   * post-OCR invoices (NEEDS_REVIEW/DONE) so it never clobbers validating/
   * processing/failed states. DONE when no line needs review, else NEEDS_REVIEW.
   */
  async recomputeInvoiceStatus(invoiceId: string): Promise<InvoiceV2Status> {
    const invoice = await this.invoicesRepo.findOne({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (
      invoice.status !== InvoiceV2Status.NEEDS_REVIEW &&
      invoice.status !== InvoiceV2Status.DONE
    ) {
      return invoice.status;
    }
    const lines = await this.lineItemsRepo.find({
      where: { invoice_id: invoiceId },
    });
    const anyNeedsReview = lines.some((l) => l.needs_review === true);
    const next =
      lines.length > 0 && anyNeedsReview
        ? InvoiceV2Status.NEEDS_REVIEW
        : InvoiceV2Status.DONE;
    if (next !== invoice.status) {
      await this.invoicesRepo.update(invoiceId, { status: next });
    }
    return next;
  }

  // ----------------------------------------------------------- image serve

  async signImageUrl(imageId: string, user: AuthedUser): Promise<string> {
    const image = await this.imagesRepo.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('Image not found');
    await this.findInvoiceOrThrow(image.invoice_id, user);
    const token = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        scope: TARO_V2_IMAGE_SCOPE,
        image_id: imageId,
      },
      { secret: this.config.get<string>('JWT_SECRET'), expiresIn: '15m' },
    );
    return `/api/v2/invoice-images/${imageId}/image?token=${encodeURIComponent(token)}`;
  }

  async imagePath(imageId: string): Promise<string> {
    const image = await this.imagesRepo.findOne({ where: { id: imageId } });
    if (!image || !image.file_path || !fs.existsSync(image.file_path)) {
      throw new NotFoundException('Image file not found');
    }
    return image.file_path;
  }

  // ------------------------------------------------------------- internals

  private async findInvoiceOrThrow(
    invoiceId: string,
    user: AuthedUser,
  ): Promise<InvoiceV2> {
    const invoice = await this.invoicesRepo.findOne({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    // taro_agent → can only touch their own uploads (probing-resistant 404).
    if (user.role === 'taro_agent' && invoice.uploaded_by !== user.id) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  /** Exposed for tests / debugging: whether a line counts as resolved. */
  isLineResolved(line: InvoiceLineItemV2): boolean {
    return line.needs_review === false;
  }

  /** Helper kept for symmetry with the classifier (TACO vs competitor view). */
  lineIsTaco(line: InvoiceLineItemV2): boolean {
    return isTacoClassification(line.classification);
  }
}
