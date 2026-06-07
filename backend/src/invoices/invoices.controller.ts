import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import * as path from 'path';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { UploadInvoiceDto } from './dto/upload-invoice.dto';
import { UploadFotoKatalogDto } from './dto/upload-foto-katalog.dto';

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  return map[ext] || 'application/octet-stream';
}

@Controller()
@UseGuards(AuthGuard('jwt'))
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  // ---- Per-visit endpoints (preferred for v9 flow) ----

  @Post('visits/:visitId/invoices')
  @UseInterceptors(FileInterceptor('photo'))
  uploadInvoiceForVisit(
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: UploadInvoiceDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.invoicesService.uploadInvoice(visitId, dto.store_id, file);
  }

  @Get('visits/:visitId/invoices')
  listInvoicesForVisit(@Param('visitId', ParseUUIDPipe) visitId: string) {
    return this.invoicesService.listForVisit(visitId);
  }

  @Post('visits/:visitId/foto-katalog')
  @UseInterceptors(FileInterceptor('photo'))
  uploadFotoKatalog(
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: UploadFotoKatalogDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.invoicesService.uploadFotoKatalog(visitId, dto.store_id, file);
  }

  @Get('foto-katalog/:id')
  getFotoKatalog(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.getFotoKatalogResult(id);
  }

  // ---- Legacy/flat invoice endpoints ----

  @Post('invoices/upload')
  @UseInterceptors(FileInterceptor('invoice'))
  uploadInvoice(
    @Body() dto: UploadInvoiceDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!dto.visit_id) {
      throw new Error('visit_id required for legacy upload endpoint');
    }
    return this.invoicesService.uploadInvoice(dto.visit_id, dto.store_id, file);
  }

  // AC-7 — poll status; FE checks ≤10s after upload.
  @Get('invoices/:id/status')
  getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.getStatus(id);
  }

  @Get('invoices/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.findOne(id);
  }

  // AC-22 — rep can attach a note / mark unclear / edit brand without leaving the flow.
  @Patch('invoice-line-items/:id')
  patchLineItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: { note?: string; is_unclear?: boolean; brand_id?: string | null; brand_name?: string | null },
  ) {
    return this.invoicesService.updateLineItem(id, body);
  }

  @Get('invoices/:id/image')
  async getImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const imagePath = await this.invoicesService.getImage(id);
    const contentType = getContentType(imagePath);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${path.basename(imagePath)}"`,
    });
    return new StreamableFile(createReadStream(imagePath));
  }
}
