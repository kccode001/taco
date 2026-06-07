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
import { PicsService } from './pics.service';
import { CreatePicDto } from './dto/create-pic.dto';
import { UpdatePicDto } from './dto/update-pic.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';

@Controller('pics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PicsController {
  constructor(private readonly service: PicsService) {}

  @Get()
  findAll(@Query('store_id') storeId?: string) {
    return this.service.findAll(storeId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.REP)
  create(@Body() dto: CreatePicDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.REP)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePicDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
