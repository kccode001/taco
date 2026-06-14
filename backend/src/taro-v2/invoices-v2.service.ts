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
import * as crypto from 'crypto';
import { InvoiceV2 } from '../database/entities/v2/invoice-v2.entity';
import { InvoiceImageV2 } from '../database/entities/v2/invoice-image-v2.entity';
import { InvoiceLineItemV2 } from '../database/entities/v2/invoice-line-item-v2.entity';
import { Region, RegionType } from '../database/entities/region.entity';
import { StoreV2 } from '../database/entities/v2/store-v2.entity';
import { CompetitorBrand } from '../database/entities/competitor-brand.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import {
  InvoiceV2Status,
  InvoiceImageV2ValidationStatus,
  isTacoClassification,
  classificationNeedsReview,
} from '../database/entities/v2/invoice-v2.enums';
import {
  ImageValidationService,
  ImageValidationDetectResult,
} from './image-validation.service';
import {
  matchArea,
  matchStore,
  bandForMatch,
  DetectOutcome,
  AreaCandidate,
  StoreCandidate,
} from './store-location-matcher';
import { PatchLineItemV2Dto } from './dto/patch-line-item-v2.dto';
import { CreateInvoiceV2Dto } from './dto/create-invoice-v2.dto';
import {
  QUEUE_TARO_V2_OCR,
  JOB_PROCESS_TARO_V2,
  TARO_V2_UPLOAD_SUBDIR,
  TARO_V2_IMAGE_SCOPE,
} from './taro-v2.constants';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { SkuEmbeddingCache } from '../embeddings/sku-embedding-cache.service';
import { topKPrecomputed } from '../embeddings/similarity';
import { findSuffixSkuCode } from '../taro-invoices/sku-code-matcher';

interface AuthedUser {
  id: string;
  email?: string;
  role: string;
}

/** One master-data match (store or area) the FE can auto-fill / preselect. */
export interface DetectMatch {
  id: string;
  name: string;
  /** Area code / store's area_id — present per match kind. */
  code?: string;
  display_path?: string;
  area_id?: string;
  score: number;
}

/**
 * Result of the photo-first detect step. The FE branches on `outcome`:
 *   - invalid    → show `validation.invalid_reason`, stop (do NOT proceed).
 *   - auto       → store+area matched clearly; auto-fill and continue.
 *   - best_guess → preselect store_match/area_match but keep editable.
 *   - manual     → no confident match (incl. store/location absent); rep inputs.
 * `staged_image_id` references the already-uploaded+validated photo so invoice
 * creation can adopt it without a second upload or a second vision call.
 */
export interface DetectStoreResponse {
  outcome: DetectOutcome;
  staged_image_id: string | null;
  validation: {
    clarity_ok: boolean;
    is_invoice: boolean;
    valid: boolean;
    invalid_reason: string | null;
  };
  detected: {
    store_name_raw: string | null;
    location_raw: string | null;
  };
  store_match: DetectMatch | null;
  area_match: DetectMatch | null;
  match_confidence: number;
}

/** On-disk record pairing a staged photo with its validation/detection result. */
interface StagedSidecar {
  file_name: string | null;
  stored_file: string;
  validation: {
    clarity_ok: boolean;
    is_invoice: boolean;
    valid: boolean;
    invalid_reason: string | null;
  };
  detected: {
    store_name_raw: string | null;
    location_raw: string | null;
  };
}

/** Round a 0..1 score to 3dp for a stable, FE-friendly payload. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
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
  /** Photo-first staging: a validated photo lives here until an invoice adopts it. */
  private readonly stagingDir = path.join(this.uploadDir, 'staged');

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
    private readonly embeddings: EmbeddingsService,
    private readonly skuCache: SkuEmbeddingCache,
  ) {
    fs.mkdirSync(this.uploadDir, { recursive: true });
    fs.mkdirSync(this.stagingDir, { recursive: true });
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
    // Photo-first flow: adopt the already-uploaded+validated photo(s) so the rep
    // doesn't re-upload and we don't re-run image validation.
    if (dto.staged_image_ids && dto.staged_image_ids.length > 0) {
      await this.adoptStagedImages(invoice.id, dto.staged_image_ids);
    }
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

  // ---------------------------------------------------------- detect (photo-first)

  /**
   * Photo-first upload step. The rep uploads ONE invoice photo before picking a
   * store/area. We:
   *   1. stage the file (kept until an invoice adopts it — no re-upload later),
   *   2. run the combined validate + store/location read (one vision call),
   *   3. on a bad image → outcome `invalid` with the specific Indonesian reason,
   *   4. else fuzzy-match the read store/location against StoreV2 / Region(area)
   *      master data and band the result into auto / best_guess / manual.
   * Store/location genuinely absent (valid image, nothing printed) → `manual`,
   * never `invalid`.
   */
  async detectStoreLocation(
    file: Express.Multer.File | undefined,
  ): Promise<DetectStoreResponse> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded');
    }

    // 1. Stage the photo so the eventual invoice can adopt it as-is.
    const stagedId = crypto.randomUUID();
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const storedFile = `${stagedId}${ext}`;
    const stagedPath = path.join(this.stagingDir, storedFile);
    fs.writeFileSync(stagedPath, file.buffer);

    // 2. One vision call: validation + store/location extraction.
    let detection: ImageValidationDetectResult;
    try {
      detection = await this.validation.validateAndDetect(stagedPath);
    } catch (e) {
      this.logger.warn(
        `detectStoreLocation vision failed for ${stagedId}: ${(e as Error).message}`,
      );
      // Fail-closed on the gate; keep the staged file so the rep can still proceed
      // manually if they choose, but report it as not-yet-valid.
      detection = {
        clarity_ok: false,
        is_invoice: false,
        valid: false,
        invalid_reason: 'Gagal memvalidasi gambar. Mohon coba unggah ulang.',
        store_name_raw: null,
        location_raw: null,
      };
    }

    // Persist a sidecar so invoice creation can adopt the photo WITHOUT a second
    // upload or a second (expensive) vision call.
    this.writeStagedSidecar(stagedId, {
      file_name: file.originalname ?? null,
      stored_file: storedFile,
      validation: {
        clarity_ok: detection.clarity_ok,
        is_invoice: detection.is_invoice,
        valid: detection.valid,
        invalid_reason: detection.invalid_reason,
      },
      detected: {
        store_name_raw: detection.store_name_raw,
        location_raw: detection.location_raw,
      },
    });

    const base: DetectStoreResponse = {
      outcome: 'manual',
      staged_image_id: stagedId,
      validation: {
        clarity_ok: detection.clarity_ok,
        is_invoice: detection.is_invoice,
        valid: detection.valid,
        invalid_reason: detection.invalid_reason,
      },
      detected: {
        store_name_raw: detection.store_name_raw,
        location_raw: detection.location_raw,
      },
      store_match: null,
      area_match: null,
      match_confidence: 0,
    };

    // 3. Bad image → invalidate (distinct from "store/location absent").
    if (!detection.valid) {
      return { ...base, outcome: 'invalid' };
    }

    // 4. Match the read store/location against master data (no API cost).
    const [areaRows, storeRows] = await Promise.all([
      this.areasRepo.find({
        where: { type: RegionType.AREA, active: true },
      }),
      this.storesRepo.find(),
    ]);
    const areaCandidates: AreaCandidate[] = areaRows.map((a) => ({
      id: a.id,
      name: a.name,
      code: a.code,
      display_path: a.display_path,
    }));
    const storeCandidates: StoreCandidate[] = storeRows.map((s) => ({
      id: s.id,
      name: s.name,
      area_id: s.area_id,
    }));
    const areaById = new Map(areaRows.map((a) => [a.id, a]));

    const areaHit = matchArea(detection.location_raw, areaCandidates);
    const storeHit = matchStore(
      detection.store_name_raw,
      storeCandidates,
      areaHit?.item.id ?? null,
    );

    const storeScore = storeHit?.score ?? 0;
    const areaScore = areaHit?.score ?? 0;

    const store_match: DetectMatch | null = storeHit
      ? {
          id: storeHit.item.id,
          name: storeHit.item.name,
          area_id: storeHit.item.area_id,
          score: round3(storeScore),
        }
      : null;

    // The matched store's own area is authoritative — when a store matches, fill
    // the area from it (overrides a weaker free-text location match).
    let area_match: DetectMatch | null = areaHit
      ? {
          id: areaHit.item.id,
          name: areaHit.item.name,
          code: areaHit.item.code,
          display_path: areaHit.item.display_path,
          score: round3(areaScore),
        }
      : null;
    if (storeHit) {
      const storeArea = areaById.get(storeHit.item.area_id);
      if (storeArea) {
        const sameAsFreeText = areaHit?.item.id === storeArea.id;
        area_match = {
          id: storeArea.id,
          name: storeArea.name,
          code: storeArea.code,
          display_path: storeArea.display_path,
          score: round3(
            sameAsFreeText ? Math.max(areaScore, storeScore) : storeScore,
          ),
        };
      }
    }

    const outcome = bandForMatch(storeScore, areaScore);
    const match_confidence = round3(storeHit ? storeScore : areaScore);

    return { ...base, outcome, store_match, area_match, match_confidence };
  }

  // ---------- staging sidecar helpers ----------

  private stagedSidecarPath(stagedId: string): string {
    return path.join(this.stagingDir, `${stagedId}.json`);
  }

  private writeStagedSidecar(stagedId: string, payload: StagedSidecar): void {
    fs.writeFileSync(
      this.stagedSidecarPath(stagedId),
      JSON.stringify(payload),
      'utf8',
    );
  }

  /**
   * Adopt one or more staged (already validated) photos onto a freshly created
   * invoice, carrying their validation result over so the OCR `process` step can
   * run WITHOUT re-validating (no second vision call). Unknown / already-consumed
   * staged ids are skipped (logged), not fatal.
   */
  private async adoptStagedImages(
    invoiceId: string,
    stagedIds: string[],
  ): Promise<void> {
    for (const stagedId of stagedIds) {
      const sidecarPath = this.stagedSidecarPath(stagedId);
      if (!fs.existsSync(sidecarPath)) {
        this.logger.warn(
          `adoptStagedImages: staged id ${stagedId} not found — skipping`,
        );
        continue;
      }
      let sidecar: StagedSidecar;
      try {
        sidecar = JSON.parse(
          fs.readFileSync(sidecarPath, 'utf8'),
        ) as StagedSidecar;
      } catch (e) {
        this.logger.warn(
          `adoptStagedImages: bad sidecar ${stagedId}: ${(e as Error).message}`,
        );
        continue;
      }
      const srcPath = path.join(this.stagingDir, sidecar.stored_file);
      if (!fs.existsSync(srcPath)) {
        this.logger.warn(
          `adoptStagedImages: staged file gone for ${stagedId} — skipping`,
        );
        continue;
      }

      const row = await this.imagesRepo.save(
        this.imagesRepo.create({
          invoice_id: invoiceId,
          file_path: '',
          file_name: sidecar.file_name,
          validation_status: sidecar.validation.valid
            ? InvoiceImageV2ValidationStatus.VALID
            : InvoiceImageV2ValidationStatus.INVALID,
          invalid_reason: sidecar.validation.invalid_reason,
          clarity_ok: sidecar.validation.clarity_ok,
          is_invoice: sidecar.validation.is_invoice,
        }),
      );
      const ext = path.extname(sidecar.stored_file) || '.bin';
      const dest = path.join(this.uploadDir, `${row.id}${ext}`);
      fs.renameSync(srcPath, dest);
      row.file_path = dest;
      await this.imagesRepo.save(row);

      // Staged file consumed — drop the sidecar.
      try {
        fs.unlinkSync(sidecarPath);
      } catch {
        /* best-effort cleanup */
      }
    }
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
    const isBukanKompetitor = dto.bukan_kompetitor === true;

    if (!hasConfirm && !hasSku && !hasBrand && !hasCompetitor && !isBukanKompetitor) {
      throw new BadRequestException(
        'One of confirm_as_is, matched_sku_id, brand_id, is_competitor, bukan_kompetitor is required',
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
    } else if (isBukanKompetitor) {
      // Not TACO and not a competitor brand (generic/other product).
      line.is_competitor = false;
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

  /**
   * Backfill pre-select hints for existing TACO review lines that have
   * needs_review=true and matched_sku_id=null.
   *
   * Uses the same RAG pipeline as the OCR processor but with a lower similarity
   * threshold (≥0.10) since these lines are already in the review queue — the
   * hint is a starting point for the human resolver, not a confirmed match.
   * needs_review stays true after the update.
   */
  async backfillPreSelectHints(): Promise<{
    scanned: number;
    updated: number;
    skipped: number;
    results: { line_id: string; raw_text: string; sku_code: string; score: number }[];
  }> {
    const skuMaster = await this.skuCache.getAll();
    const usable = skuMaster.filter((s) => s.vec !== null);
    if (usable.length === 0) {
      this.logger.warn('backfillPreSelectHints: no SKU embeddings available');
      return { scanned: 0, updated: 0, skipped: 0, results: [] };
    }

    const lines = await this.lineItemsRepo
      .createQueryBuilder('li')
      .where('li.needs_review = true')
      .andWhere('li.matched_sku_id IS NULL')
      .getMany();

    const tacoReviewLines = lines.filter(
      (li) =>
        isTacoClassification(li.classification) &&
        classificationNeedsReview(li.classification),
    );

    this.logger.log(
      `backfillPreSelectHints: found ${tacoReviewLines.length} TACO review lines with null matched_sku_id`,
    );

    let updated = 0;
    let skipped = 0;
    const results: { line_id: string; raw_text: string; sku_code: string; score: number }[] = [];

    const skuRows = skuMaster.map((s) => ({
      id: s.id,
      code: s.code,
      product_name_aliases: s.product_name_aliases,
    }));

    for (const li of tacoReviewLines) {
      const text = (li.raw_text ?? '').trim();
      if (!text) {
        skipped++;
        continue;
      }

      let candidateId: string | null = null;
      let candidateCode = '';
      let candidateScore = 0;

      // Strategy 1: suffix/partial code matching (deterministic, no API needed).
      // Handles OCR fragments like "056 AA" → TH 056 AA.
      const suffixHit = findSuffixSkuCode(text, skuRows);
      if (suffixHit) {
        candidateId = suffixHit.sku_id;
        candidateCode = suffixHit.matched_code;
        candidateScore = suffixHit.confidence;
        this.logger.log(
          `backfill suffix match: line ${li.id} (${text.slice(0, 40)}) → ${suffixHit.matched_code} (conf=${suffixHit.confidence.toFixed(2)})`,
        );
      }

      // Strategy 2: RAG embedding (when OpenAI key is available).
      if (!candidateId && usable.length > 0) {
        try {
          const vec = await this.embeddings.embed(text);
          if (vec) {
            let qn = 0;
            for (let i = 0; i < vec.length; i++) qn += vec[i] * vec[i];
            qn = Math.sqrt(qn);
            const hits = topKPrecomputed(vec, qn, usable, 1);
            const top = hits[0] ?? null;
            if (top && top.score >= 0.10) {
              candidateId = top.item.id;
              candidateCode = top.item.code;
              candidateScore = top.score;
              this.logger.log(
                `backfill RAG match: line ${li.id} (${text.slice(0, 40)}) → ${top.item.code} (score=${top.score.toFixed(3)})`,
              );
            }
          }
        } catch (e) {
          this.logger.warn(
            `backfill embed failed for line ${li.id}: ${(e as Error).message}`,
          );
        }
      }

      if (!candidateId) {
        this.logger.log(
          `backfill skip line ${li.id} (${text.slice(0, 40)}): no candidate found`,
        );
        skipped++;
        continue;
      }

      await this.lineItemsRepo.update(li.id, { matched_sku_id: candidateId });
      results.push({ line_id: li.id, raw_text: text, sku_code: candidateCode, score: candidateScore });
      updated++;
    }

    return { scanned: tacoReviewLines.length, updated, skipped, results };
  }
}
