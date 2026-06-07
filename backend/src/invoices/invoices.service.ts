import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import * as path from 'path';
import * as fs from 'fs';
import { Invoice, InvoiceStatus } from '../database/entities/invoice.entity';
import { InvoiceLineItem } from '../database/entities/invoice-line-item.entity';
import { Visit } from '../database/entities/visit.entity';
import { FotoKatalog, FotoKatalogStatus } from './foto-katalog.entity';

export const QUEUE_OCR_INVOICE = 'ocr.invoice';
export const QUEUE_OCR_FOTO_KATALOG = 'ocr.foto-katalog';

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
    @InjectRepository(Visit)
    private readonly visitsRepo: Repository<Visit>,
    @InjectRepository(FotoKatalog)
    private readonly katalogRepo: Repository<FotoKatalog>,
    @InjectQueue(QUEUE_OCR_INVOICE) private readonly ocrInvoiceQueue: Queue,
    @InjectQueue(QUEUE_OCR_FOTO_KATALOG) private readonly ocrKatalogQueue: Queue,
  ) {
    fs.mkdirSync(this.uploadDir, { recursive: true });
    fs.mkdirSync(this.katalogDir, { recursive: true });
  }

  // ---- Invoice OCR (competitor) ----

  async uploadInvoice(
    visitId: string,
    storeId: string | undefined,
    file: Express.Multer.File,
  ): Promise<{ invoice_id: string; job_id: string | number; status: InvoiceStatus }> {
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
   * Mark an unclear line and attach a note. AC-22: rep keeps moving — never blocked
   * by ambiguous OCR.
   */
  async updateLineItem(
    lineItemId: string,
    patch: { note?: string; is_unclear?: boolean; brand_id?: string | null; brand_name?: string | null },
  ): Promise<InvoiceLineItem> {
    const li = await this.lineItemsRepo.findOne({ where: { id: lineItemId } });
    if (!li) throw new NotFoundException(`InvoiceLineItem ${lineItemId} not found`);
    Object.assign(li, patch);
    return this.lineItemsRepo.save(li);
  }

  // ---- Foto Katalog OCR (TACO pricing input) ----

  async uploadFotoKatalog(
    visitId: string,
    storeId: string | undefined,
    file: Express.Multer.File,
  ): Promise<{ foto_katalog_id: string; job_id: string | number; status: FotoKatalogStatus }> {
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

    return { foto_katalog_id: katalog.id, job_id: job.id, status: katalog.status };
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
