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
import { PosmService } from './posm.service';
import { CreatePosmAssetDto } from './dto/create-posm-asset.dto';
import { UpdatePosmAssetDto } from './dto/update-posm-asset.dto';
import { CreateVisitObjectiveDto } from './dto/create-visit-objective.dto';
import { UpdateVisitObjectiveDto } from './dto/update-visit-objective.dto';
import { CreateVisitContextDto } from './dto/create-visit-context.dto';
import { UpdateVisitContextDto } from './dto/update-visit-context.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PosmController {
  constructor(private readonly service: PosmService) {}

  // ---- POSM Assets ----

  @Get('posm-assets')
  findAllPosmAssets() {
    return this.service.findAllPosmAssets();
  }

  @Post('posm-assets')
  createPosmAsset(@Body() dto: CreatePosmAssetDto) {
    return this.service.createPosmAsset(dto);
  }

  @Patch('posm-assets/:id')
  updatePosmAsset(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePosmAssetDto) {
    return this.service.updatePosmAsset(id, dto);
  }

  @Delete('posm-assets/:id')
  removePosmAsset(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removePosmAsset(id);
  }

  // ---- Visit Objectives ----

  @Get('visit-objectives')
  findAllVisitObjectives() {
    return this.service.findAllVisitObjectives();
  }

  @Post('visit-objectives')
  createVisitObjective(@Body() dto: CreateVisitObjectiveDto) {
    return this.service.createVisitObjective(dto);
  }

  @Patch('visit-objectives/:id')
  updateVisitObjective(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitObjectiveDto,
  ) {
    return this.service.updateVisitObjective(id, dto);
  }

  @Delete('visit-objectives/:id')
  removeVisitObjective(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeVisitObjective(id);
  }

  // ---- Visit Contexts ----

  @Get('visit-contexts')
  findAllVisitContexts() {
    return this.service.findAllVisitContexts();
  }

  @Post('visit-contexts')
  createVisitContext(@Body() dto: CreateVisitContextDto) {
    return this.service.createVisitContext(dto);
  }

  @Patch('visit-contexts/:id')
  updateVisitContext(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVisitContextDto) {
    return this.service.updateVisitContext(id, dto);
  }

  @Delete('visit-contexts/:id')
  removeVisitContext(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeVisitContext(id);
  }
}
