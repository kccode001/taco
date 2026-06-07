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
  ParseUUIDPipe,
} from '@nestjs/common';
import { CompetitorSkusService } from './competitor-skus.service';
import { CreateCompetitorSkuDto } from './dto/create-competitor-sku.dto';
import { UpdateCompetitorSkuDto } from './dto/update-competitor-sku.dto';
import { CompetitorSkuQueryDto } from './dto/competitor-sku-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';

@Controller('competitor-skus')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompetitorSkusController {
  constructor(private readonly service: CompetitorSkusService) {}

  @Get()
  findAll(@Query() query: CompetitorSkuQueryDto) {
    return this.service.findAll(query);
  }

  @Get('pending-review')
  findPendingReview() {
    return this.service.findPendingReview();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateCompetitorSkuDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompetitorSkuDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
