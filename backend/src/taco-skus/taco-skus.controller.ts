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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TacoSkusService } from './taco-skus.service';
import { CreateTacoSkuDto } from './dto/create-taco-sku.dto';
import { UpdateTacoSkuDto } from './dto/update-taco-sku.dto';
import { SkuQueryDto } from './dto/sku-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';

@Controller('taco-skus')
@UseGuards(AuthGuard('jwt'))
export class TacoSkusController {
  constructor(private readonly tacoSkusService: TacoSkusService) {}

  @Get()
  findAll(@Query() query: SkuQueryDto) {
    return this.tacoSkusService.findAll(query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateTacoSkuDto) {
    return this.tacoSkusService.create(dto);
  }

  @Post('bulk-import')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  bulkImport(@UploadedFile() file: Express.Multer.File) {
    const csvContent = file.buffer.toString('utf-8');
    return this.tacoSkusService.bulkImport(csvContent);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTacoSkuDto) {
    return this.tacoSkusService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.tacoSkusService.remove(id);
  }
}
