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
import { RegionType } from '../../database/entities/region.entity';
import { RegionsV2Service } from './regions-v2.service';
import { CreateRegionV2Dto } from './dto/create-region-v2.dto';
import { UpdateRegionV2Dto } from './dto/update-region-v2.dto';

/**
 * v2 MANAGEMENT — Area master CRUD on the authoritative `public.regions` table.
 *   GET/POST/PATCH/DELETE /api/v2/regions
 *
 * Default surface is leaf `area` rows; `?type=bu` lists BUs so the FE can offer
 * a parent picker when creating an area. Mutations are admin/manager-only; reads
 * also allow taro_agent (area pickers). DELETE is a soft-deactivate.
 */
@Controller('v2/regions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class RegionsV2Controller {
  constructor(private readonly service: RegionsV2Service) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.TARO_AGENT)
  list(
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('include_inactive') includeInactive?: string,
  ) {
    const t =
      type && Object.values(RegionType).includes(type as RegionType)
        ? (type as RegionType)
        : undefined;
    return this.service.list({
      type: t,
      search: search && search.trim() ? search.trim() : undefined,
      includeInactive: includeInactive === 'true' || includeInactive === '1',
    });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.TARO_AGENT)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateRegionV2Dto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRegionV2Dto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
