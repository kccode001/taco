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
import { VisitObjectivesService } from './visit-objectives.service';
import { CreateVisitObjectiveDto } from './dto/create-visit-objective.dto';
import { UpdateVisitObjectiveDto } from './dto/update-visit-objective.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';

// Mounted on BOTH paths so the admin UI's `/admin/visit-objectives` shortcut
// works alongside the canonical resource path.
@Controller(['visit-objectives', 'admin/visit-objectives'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class VisitObjectivesController {
  constructor(private readonly service: VisitObjectivesService) {}

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
  create(@Body() dto: CreateVisitObjectiveDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVisitObjectiveDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
