import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import * as path from 'path';
import * as fs from 'fs';
import { Invoice, InvoiceStatus } from '../database/entities/invoice.entity';
import { InvoiceLineItem } from '../database/entities/invoice-line-item.entity';

@Injectable()
export class InvoicesService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(Invoice)
    private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemsRepo: Repository<InvoiceLineItem>,
    @InjectQueue('ocr')
    private readonly ocrQueue: Queue,
  ) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadInvoice(
    visitId: string,
    storeId: string,
    file: Express.Multer.File,
  ): Promise<Invoice> {
    const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    const filePath = path.join(this.uploadDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    const invoice = this.invoicesRepo.create({
      visit_id: visitId,
      store_id: storeId,
      image_path: filePath,
      status: InvoiceStatus.PROCESSING,
    });

    const savedInvoice = await this.invoicesRepo.save(invoice);

    await this.ocrQueue.add('process-ocr', {
      invoiceId: savedInvoice.id,
      imagePath: filePath,
    });

    return savedInvoice;
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoicesRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.line_items', 'line_items')
      .leftJoinAndSelect('line_items.taco_sku', 'taco_sku')
      .leftJoinAndSelect('line_items.competitor_sku', 'competitor_sku')
      .leftJoinAndSelect('invoice.store', 'store')
      .where('invoice.id = :id', { id })
      .getOne();

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    return invoice;
  }

  async getImage(id: string): Promise<string> {
    const invoice = await this.invoicesRepo.findOne({ where: { id } });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    if (!fs.existsSync(invoice.image_path)) {
      throw new NotFoundException(`Image file not found for invoice ${id}`);
    }

    return invoice.image_path;
  }
}
