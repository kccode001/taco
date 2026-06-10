import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { SalesService } from './sales.service';
import { CreateSalesDto } from './dto/create-sales.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';

/**
 * v2 MANAGEMENT — Sales (sales agent) CRUD. Routes: /api/v2/sales
 * Admin + manager only.
 */
@Controller('v2/sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Get()
  list(@Query('area_id') areaId?: string, @Query('search') search?: string) {
    return this.service.list({
      area_id: areaId && areaId.trim() ? areaId.trim() : undefined,
      search: search && search.trim() ? search.trim() : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSalesDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSalesDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
