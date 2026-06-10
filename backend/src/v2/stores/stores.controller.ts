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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

/**
 * v2 MANAGEMENT — Stores CRUD. Routes: /api/v2/stores
 * `area_id` query filters the list (selector is Area-scoped).
 *
 * NOTE on roles: list/create are also needed by the PWA upload flow
 * (free-type-new-store). TARO_AGENT is included here provisionally so the
 * upload path can read/create; tighten once Grout confirms the upload writes
 * Stores directly vs. via the invoice-create path.
 */
@Controller('v2/stores')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class StoresController {
  constructor(private readonly service: StoresService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.TARO_AGENT)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.TARO_AGENT)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateStoreDto, @CurrentUser('id') userId?: string) {
    return this.service.create(dto, userId);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStoreDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
