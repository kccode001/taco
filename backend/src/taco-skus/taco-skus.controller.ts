import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TacoSkusService } from './taco-skus.service';
import { CreateTacoSkuDto } from './dto/create-taco-sku.dto';
import { UpdateTacoSkuDto } from './dto/update-taco-sku.dto';
import { SkuQueryDto } from './dto/sku-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';

@Controller('taco-skus')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TacoSkusController {
  constructor(private readonly tacoSkusService: TacoSkusService) {}

  @Get()
  findAll(@Query() query: SkuQueryDto) {
    return this.tacoSkusService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tacoSkusService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateTacoSkuDto) {
    return this.tacoSkusService.create(dto);
  }

  @Post('bulk-import')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  bulkImport(
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRunFlag?: string,
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required (multipart field "file")');
    }
    const dryRun = dryRunFlag !== 'false';
    const csvContent = file.buffer.toString('utf-8');
    return this.tacoSkusService.bulkImport(csvContent, dryRun);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTacoSkuDto) {
    return this.tacoSkusService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tacoSkusService.remove(id);
  }
}
