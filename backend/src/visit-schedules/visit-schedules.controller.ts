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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../database/entities/user.entity';
import { VisitSchedulesService } from './visit-schedules.service';
import { CreateVisitScheduleDto } from './dto/create-visit-schedule.dto';
import { UpdateVisitScheduleDto } from './dto/update-visit-schedule.dto';
import { VisitScheduleQueryDto } from './dto/visit-schedule-query.dto';

@Controller('visit-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VisitSchedulesController {
  constructor(private readonly service: VisitSchedulesService) {}

  // ---------- Staff (rep) endpoints — keep BEFORE ':id' routes ----------

  @Get('today')
  @Roles(UserRole.REP)
  today(@CurrentUser() user: { id: string }) {
    return this.service.todayForRep(user.id);
  }

  @Get('this-week')
  @Roles(UserRole.REP)
  thisWeek(@CurrentUser() user: { id: string }) {
    return this.service.thisWeekForRep(user.id);
  }

  @Get('upcoming')
  @Roles(UserRole.REP)
  upcoming(@CurrentUser() user: { id: string }) {
    return this.service.upcomingForRep(user.id);
  }

  // ---------- Admin endpoints ----------

  @Get('by-sales-staff')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  bySalesStaff() {
    return this.service.bySalesStaff();
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(@Query() query: VisitScheduleQueryDto) {
    return this.service.findAll(query);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateVisitScheduleDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitScheduleDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
