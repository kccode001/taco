import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { VisitContextsService } from './visit-contexts.service';
import { CreateVisitContextDto } from './dto/create-visit-context.dto';
import { UpdateVisitContextDto } from './dto/update-visit-context.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';

// Mounted on BOTH paths so the admin UI's `/admin/visit-contexts` shortcut
// works alongside the canonical resource path.
@Controller(['visit-contexts', 'admin/visit-contexts'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class VisitContextsController {
  constructor(private readonly service: VisitContextsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateVisitContextDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVisitContextDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
