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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';

@Controller('posm-assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PosmController {
  constructor(private readonly service: PosmService) {}

  @Get()
  findAllPosmAssets() {
    return this.service.findAllPosmAssets();
  }

  @Get(':id')
  findOnePosmAsset(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOnePosmAsset(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  createPosmAsset(@Body() dto: CreatePosmAssetDto) {
    return this.service.createPosmAsset(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  updatePosmAsset(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePosmAssetDto) {
    return this.service.updatePosmAsset(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  removePosmAsset(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removePosmAsset(id);
  }
}
