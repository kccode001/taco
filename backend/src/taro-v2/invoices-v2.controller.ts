import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseUUIDPipe,
  StreamableFile,
  Res,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../database/entities/user.entity';
import { InvoicesV2Service } from './invoices-v2.service';
import { CreateInvoiceV2Dto } from './dto/create-invoice-v2.dto';
import { InvoiceV2Status } from '../database/entities/v2/invoice-v2.enums';

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

/**
 * Antrian Invoice queue filter. Exactly three options:
 *   - `pending` → every non-done state (validating, ocr_processing, needs_review,
 *                 failed) — i.e. anything still in the pipeline / awaiting action.
 *   - `selesai` → done only.
 *   - `semua`   → no filter (undefined).
 * Returns the status SET for `pending`/`selesai`, or undefined for `semua`/unknown.
 */
function resolveQueueFilter(filter?: string): InvoiceV2Status[] | undefined {
  switch ((filter ?? '').trim().toLowerCase()) {
    case 'pending':
      return [
        InvoiceV2Status.VALIDATING,
        InvoiceV2Status.OCR_PROCESSING,
        InvoiceV2Status.NEEDS_REVIEW,
        InvoiceV2Status.FAILED,
      ];
    case 'selesai':
      return [InvoiceV2Status.DONE];
    default:
      return undefined;
  }
}

/**
 * TACO v2 invoice spine — PWA upload + admin read. Mounted under `/api/v2`
 * (global `api` prefix + `v2` base). taro_agent is scoped to their own uploads
 * at the service layer; admin/manager have full access.
 */
@Controller('v2')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.TARO_AGENT)
export class InvoicesV2Controller {
  constructor(private readonly invoices: InvoicesV2Service) {}

  @Post('invoices')
  create(
    @Body() body: CreateInvoiceV2Dto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.invoices.create(body, { id: userId, role });
  }

  @Post('invoices/:id/images')
  @UseInterceptors(FilesInterceptor('files', 20))
  addImages(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.invoices.addImages(id, files, { id: userId, role });
  }

  @Post('invoices/:id/validate')
  validate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.invoices.validate(id, { id: userId, role });
  }

  @Post('invoices/:id/process')
  process(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.invoices.process(id, { id: userId, role });
  }

  @Get('invoices')
  list(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Query('filter') filter?: string,
    @Query('status') status?: string,
    @Query('area_id') areaId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    // Antrian filter (Pending/Selesai/Semua) maps to a status SET and takes
    // precedence; the legacy exact `status` param still works when no filter.
    const statusIn = resolveQueueFilter(filter);
    const st =
      !statusIn &&
      status &&
      Object.values(InvoiceV2Status).includes(status as InvoiceV2Status)
        ? (status as InvoiceV2Status)
        : undefined;
    const area =
      typeof areaId === 'string' && areaId.trim() ? areaId.trim() : undefined;
    return this.invoices.list({
      status: st,
      statusIn,
      area_id: area,
      page: p,
      limit: l,
      user: { id: userId, role },
    });
  }

  @Get('invoices/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.invoices.findOne(id, { id: userId, role });
  }

  @Delete('invoice-images/:id')
  deleteImage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.invoices.deleteImage(id, { id: userId, role });
  }

  @Get('invoice-images/:id/image-url')
  async getImageUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string,
    @CurrentUser('role') role: UserRole,
  ): Promise<{ url: string }> {
    const url = await this.invoices.signImageUrl(id, {
      id: userId,
      email,
      role,
    });
    return { url };
  }

  @Get('invoice-images/:id/image')
  async getImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = await this.invoices.imagePath(id);
    res.set({
      'Content-Type': getContentType(filePath),
      'Content-Disposition': `inline; filename="${path.basename(filePath)}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }
}
