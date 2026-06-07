import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import * as path from 'path';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { UploadInvoiceDto } from './dto/upload-invoice.dto';

// mime-types may not be installed; use a simple lookup helper instead
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

@Controller('invoices')
@UseGuards(AuthGuard('jwt'))
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('invoice'))
  uploadInvoice(
    @Body() dto: UploadInvoiceDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.invoicesService.uploadInvoice(dto.visit_id, dto.store_id, file);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Get(':id/image')
  async getImage(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const imagePath = await this.invoicesService.getImage(id);
    const contentType = getContentType(imagePath);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${path.basename(imagePath)}"`,
    });

    const stream = createReadStream(imagePath);
    return new StreamableFile(stream);
  }
}
