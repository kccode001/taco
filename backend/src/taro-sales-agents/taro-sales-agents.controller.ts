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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';
import { TaroSalesAgentsService } from './taro-sales-agents.service';
import { CreateTaroSalesAgentDto } from './dto/create-taro-sales-agent.dto';
import { UpdateTaroSalesAgentDto } from './dto/update-taro-sales-agent.dto';
import { ResetTaroSalesAgentPasswordDto } from './dto/reset-password.dto';

/**
 * CRUD for Taro Sales Agents — users with role=taro_agent assigned to a primary
 * ASM area (`taro_region_id`). Admin + manager only; agents themselves manage
 * their own profile through `/auth/me`.
 */
@Controller('taro-sales-agents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class TaroSalesAgentsController {
  constructor(private readonly service: TaroSalesAgentsService) {}

  @Get()
  list(
    @Query('region_id') regionId?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list({
      region_id: regionId && regionId.trim() ? regionId.trim() : undefined,
      search: search && search.trim() ? search.trim() : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTaroSalesAgentDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaroSalesAgentDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deactivate(id);
  }

  @Post(':id/reset-password')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetTaroSalesAgentPasswordDto,
  ) {
    return this.service.resetPassword(id, dto.new_password);
  }
}
