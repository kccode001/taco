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
import { Invoice, InvoiceStatus } from '../database/entities/invoice.entity';
import { InvoiceLineItem } from '../database/entities/invoice-line-item.entity';
import { CompetitorBrand } from '../database/entities/competitor-brand.entity';
import { Visit } from '../database/entities/visit.entity';
import { FotoKatalog, FotoKatalogStatus } from './foto-katalog.entity';
import { PatchInvoiceLineItemDto } from './dto/patch-line-item.dto';

export const QUEUE_OCR_INVOICE = 'ocr.invoice';
export const QUEUE_OCR_FOTO_KATALOG = 'ocr.foto-katalog';

// Indonesian labels for the rep-facing invoice status badge.
const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.PROCESSING]: 'Memproses',
  [InvoiceStatus.DONE]: 'Selesai',
  [InvoiceStatus.NEEDS_REVIEW]: 'Perlu Review',
  [InvoiceStatus.FAILED]: 'Gagal',
};

@Injectable()
export class InvoicesService {
  private readonly uploadDir = path.join(
    process.cwd(),
    process.env.UPLOAD_DIR ?? 'uploads',
  );
  private readonly katalogDir = path.join(this.uploadDir, 'foto-katalog');

  constructor(
    @InjectRepository(Invoice)
    private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemsRepo: Repository<InvoiceLineItem>,
    @InjectRepository(CompetitorBrand)
    private readonly brandsRepo: Repository<CompetitorBrand>,
    @InjectRepository(Visit)
    private readonly visitsRepo: Repository<Visit>,
    @InjectRepository(FotoKatalog)
    private readonly katalogRepo: Repository<FotoKatalog>,
    @InjectQueue(QUEUE_OCR_INVOICE) private readonly ocrInvoiceQueue: Queue,
    @InjectQueue(QUEUE_OCR_FOTO_KATALOG)
    private readonly ocrKatalogQueue: Queue,
  ) {
    fs.mkdirSync(this.uploadDir, { recursive: true });
    fs.mkdirSync(this.katalogDir, { recursive: true });
  }

  // ---- Invoice OCR (competitor) ----

  async uploadInvoice(
    visitId: string,
    storeId: string | undefined,
    file: Express.Multer.File,
  ): Promise<{
    invoice_id: string;
    job_id: string | number;
    status: InvoiceStatus;
  }> {
    if (!file) throw new BadRequestException('photo file is required');

    const visit = await this.visitsRepo.findOne({ where: { id: visitId } });
    if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);

    const resolvedStoreId = storeId ?? visit.store_id;

    const filename = `${Date.now()}-${this.safeName(file.originalname)}`;
    const filePath = path.join(this.uploadDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    const invoice = await this.invoicesRepo.save(
      this.invoicesRepo.create({
        visit_id: visitId,
        store_id: resolvedStoreId,
        image_path: filePath,
        status: InvoiceStatus.PROCESSING,
      }),
    );

    const job = await this.ocrInvoiceQueue.add('process-invoice', {
      invoiceId: invoice.id,
      imagePath: filePath,
    });

    return { invoice_id: invoice.id, job_id: job.id, status: invoice.status };
  }

  async listForVisit(visitId: string): Promise<
    Array<{
      id: string;
      status: InvoiceStatus;
      thumbnail_url: string;
      brand_count: number;
      line_count: number;
      created_at: Date;
    }>
  > {
    const invoices = await this.invoicesRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.line_items', 'li')
      .where('invoice.visit_id = :visitId', { visitId })
      .orderBy('invoice.created_at', 'DESC')
      .getMany();

    return invoices.map((inv) => {
      const brands = new Set(
        (inv.line_items ?? [])
          .map((li) => li.brand_id ?? li.brand_name)
          .filter((b): b is string => Boolean(b)),
      );
      return {
        id: inv.id,
        status: inv.status,
        thumbnail_url: `/invoices/${inv.id}/image`,
        brand_count: brands.size,
        line_count: inv.line_items?.length ?? 0,
        created_at: inv.created_at,
      };
    });
  }

  async getStatus(id: string): Promise<{
    id: string;
    status: InvoiceStatus;
    error_message?: string;
    line_count: number;
    unclear_count: number;
    unknown_count: number;
    processed_at?: Date;
  }> {
    const invoice = await this.invoicesRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.line_items', 'li')
      .where('invoice.id = :id', { id })
      .getOne();
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);

    const items = invoice.line_items ?? [];
    return {
      id: invoice.id,
      status: invoice.status,
      error_message: invoice.error_message ?? undefined,
      line_count: items.length,
      unclear_count: items.filter((li) => li.is_unclear).length,
      unknown_count: items.filter((li) => li.is_unknown).length,
      processed_at: invoice.processed_at ?? undefined,
    };
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoicesRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.line_items', 'line_items')
      .leftJoinAndSelect('line_items.taco_sku', 'taco_sku')
      .leftJoinAndSelect('line_items.competitor_sku', 'competitor_sku')
      .leftJoinAndSelect('line_items.brand', 'brand')
      .leftJoinAndSelect('invoice.store', 'store')
      .where('invoice.id = :id', { id })
      .getOne();
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    return invoice;
  }

  async getImage(id: string): Promise<string> {
    const invoice = await this.invoicesRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    if (!fs.existsSync(invoice.image_path)) {
      throw new NotFoundException(`Image file not found for invoice ${id}`);
    }
    return invoice.image_path;
  }

  /**
   * Resolve a line item one of four ways, then recompute + return the invoice
   * status so the PWA reflects the badge without a second call. The rep can fully
   * clear an invoice to "Selesai" from the review screen.
   *
   * Actions (mutually exclusive — FE sends one per call; precedence applied when
   * several are present):
   *   - confirm_as_is → "Sudah benar": clear is_unclear, lock confidence, keep match.
   *   - taco_sku_id   → confirmed TACO match (clears competitor/unknown + perlu dicek).
   *   - is_unknown    → competitor-but-unknown (clears brand + TACO match).
   *   - brand_id      → competitor brand match (clears TACO match + unknown).
   * `note` is applied independently of the action.
   */
  async updateLineItem(
    lineItemId: string,
    patch: PatchInvoiceLineItemDto,
  ): Promise<{
    line_item: InvoiceLineItem;
    invoice_status: InvoiceStatus;
    invoice_status_label: string;
  }> {
    const li = await this.lineItemsRepo.findOne({ where: { id: lineItemId } });
    if (!li)
      throw new NotFoundException(`InvoiceLineItem ${lineItemId} not found`);

    // Build the mutation as one object (matches the repo's existing
    // Object.assign idiom and lets us clear nullable FK columns to null).
    const changes: Record<string, unknown> = {};
    if (patch.confirm_as_is) {
      changes.is_unclear = false;
      changes.confidence = 1;
    } else if (patch.taco_sku_id !== undefined) {
      changes.taco_sku_id = patch.taco_sku_id;
      changes.brand_id = null;
      changes.brand_name = null;
      changes.competitor_sku_id = null;
      changes.is_unknown = false;
      changes.is_unclear = false;
    } else if (patch.is_unknown) {
      changes.is_unknown = true;
      changes.brand_id = null;
      changes.brand_name = null;
      changes.taco_sku_id = null;
      changes.is_unclear = false;
    } else if (patch.brand_id !== undefined) {
      const brand = await this.brandsRepo.findOne({
        where: { id: patch.brand_id },
      });
      if (!brand) {
        throw new NotFoundException(
          `CompetitorBrand ${patch.brand_id} not found`,
        );
      }
      changes.brand_id = brand.id;
      changes.brand_name = brand.name;
      changes.taco_sku_id = null;
      changes.is_unknown = false;
      changes.is_unclear = false;
    }

    if (patch.note !== undefined) changes.note = patch.note;

    Object.assign(li, changes);
    const saved = await this.lineItemsRepo.save(li);

    const invoice_status = await this.recomputeInvoiceStatus(saved.invoice_id);
    return {
      line_item: saved,
      invoice_status,
      invoice_status_label: INVOICE_STATUS_LABELS[invoice_status],
    };
  }

  /**
   * Re-evaluate an invoice's status from its line items.
   *   - all lines resolved → DONE ("Selesai")
   *   - any line still belum cocok / perlu dicek → NEEDS_REVIEW ("Perlu Review")
   * Invoices that haven't finished OCR (processing/failed) are left untouched.
   * Returns the resolved status (persisted when changed).
   */
  private async recomputeInvoiceStatus(
    invoiceId: string,
  ): Promise<InvoiceStatus> {
    const invoice = await this.invoicesRepo.findOne({
      where: { id: invoiceId },
      relations: { line_items: true },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

    if (
      invoice.status !== InvoiceStatus.DONE &&
      invoice.status !== InvoiceStatus.NEEDS_REVIEW
    ) {
      return invoice.status;
    }

    const allResolved = (invoice.line_items ?? []).every((li) =>
      this.isLineResolved(li),
    );
    const next = allResolved ? InvoiceStatus.DONE : InvoiceStatus.NEEDS_REVIEW;
    if (next !== invoice.status) {
      await this.invoicesRepo.update(invoiceId, { status: next });
    }
    return next;
  }

  /**
   * A line is resolved once it is no longer flagged perlu dicek (is_unclear) AND
   * it carries a decision: a TACO match, a competitor brand/SKU, or an explicit
   * "unknown". Anything else is still "belum cocok".
   */
  private isLineResolved(li: InvoiceLineItem): boolean {
    if (li.is_unclear) return false;
    return Boolean(
      li.taco_sku_id || li.brand_id || li.competitor_sku_id || li.is_unknown,
    );
  }

  // ---- Foto Katalog OCR (TACO pricing input) ----

  async uploadFotoKatalog(
    visitId: string,
    storeId: string | undefined,
    file: Express.Multer.File,
  ): Promise<{
    foto_katalog_id: string;
    job_id: string | number;
    status: FotoKatalogStatus;
  }> {
    if (!file) throw new BadRequestException('photo file is required');

    const visit = await this.visitsRepo.findOne({ where: { id: visitId } });
    if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);

    const resolvedStoreId = storeId ?? visit.store_id;

    const filename = `${Date.now()}-${this.safeName(file.originalname)}`;
    const filePath = path.join(this.katalogDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    const katalog = await this.katalogRepo.save(
      this.katalogRepo.create({
        visit_id: visitId,
        store_id: resolvedStoreId,
        image_path: filePath,
        status: FotoKatalogStatus.PROCESSING,
      }),
    );

    const job = await this.ocrKatalogQueue.add('process-foto-katalog', {
      fotoKatalogId: katalog.id,
      imagePath: filePath,
    });

    return {
      foto_katalog_id: katalog.id,
      job_id: job.id,
      status: katalog.status,
    };
  }

  async getFotoKatalogResult(id: string): Promise<FotoKatalog> {
    const k = await this.katalogRepo.findOne({ where: { id } });
    if (!k) throw new NotFoundException(`FotoKatalog ${id} not found`);
    return k;
  }

  private safeName(name: string): string {
    return name.replace(/[^\w.\-]+/g, '_');
  }
}
