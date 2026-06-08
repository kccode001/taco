import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseUUIDPipe,
  StreamableFile,
  Res,
  BadRequestException,
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
import { TaroInvoicesService } from './taro-invoices.service';
import { TaroRecommendationsService } from './taro-recommendations.service';
import { ListTaroInvoicesDto } from './dto/list-taro-invoices.dto';
import { PatchTaroLineItemDto } from './dto/patch-line-item.dto';
import { TaroInvoiceStatus } from '../database/entities/taro-invoice.entity';
import { TaroRecommendationStatus } from '../database/entities/taro-invoice-recommendation.entity';

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
 * Taro Invoices — admin/manager-only bulk OCR + SKU mapping.
 * Mounted under `/api/taro-invoices` via the global `api` prefix in main.ts.
 */
@Controller('taro-invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class TaroInvoicesController {
  constructor(
    private readonly invoices: TaroInvoicesService,
    private readonly recommendations: TaroRecommendationsService,
  ) {}

  @Post('bulk-upload')
  @UseInterceptors(FilesInterceptor('files', 20))
  bulkUpload(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('id') userId: string,
  ) {
    return this.invoices.bulkUpload(files, userId);
  }

  @Get('analytics')
  analytics() {
    return this.invoices.analytics();
  }

  @Get('recommendations')
  listRecommendations(@Query('status') status?: string) {
    const s =
      status && Object.values(TaroRecommendationStatus).includes(status as TaroRecommendationStatus)
        ? (status as TaroRecommendationStatus)
        : TaroRecommendationStatus.PENDING;
    return this.invoices.listPendingRecommendations(s);
  }

  @Post('recommendations/regenerate')
  regenerateRecommendations() {
    return this.recommendations.regenerate();
  }

  @Patch('line-items/:id')
  patchLineItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchTaroLineItemDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.invoices.patchLineItem(id, userId, body);
  }

  @Get(':id/image')
  async getImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = this.invoices.imagePath(id);
    res.set({
      'Content-Type': getContentType(filePath),
      'Content-Disposition': `inline; filename="${path.basename(filePath)}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.findOne(id);
  }

  @Get()
  list(@Query() query: ListTaroInvoicesDto) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));
    const status =
      query.status && Object.values(TaroInvoiceStatus).includes(query.status as TaroInvoiceStatus)
        ? (query.status as TaroInvoiceStatus)
        : undefined;
    const needs_review =
      query.needs_review === 'true' ? true : query.needs_review === 'false' ? false : undefined;
    if (query.needs_review && !['true', 'false'].includes(query.needs_review)) {
      throw new BadRequestException('needs_review must be true|false');
    }
    return this.invoices.list({ status, needs_review, page, limit });
  }
}
