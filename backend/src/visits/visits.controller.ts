import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VisitsService } from './visits.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { VisitQueryDto } from './dto/visit-query.dto';

@Controller('visits')
@UseGuards(AuthGuard('jwt'))
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get()
  findAll(@Query() query: VisitQueryDto, @Request() req: any) {
    return this.visitsService.findAll(query, req.user);
  }

  /**
   * Rep's completed (submitted) visits, paginated. RolesGuard not used on
   * this controller, so we filter by the auth'd user inside findAll (reps
   * are already limited to their own rows). Admin/manager hitting this
   * endpoint gets a global submitted history — by design for cross-staff
   * review.
   */
  @Get('history')
  history(@Query() query: VisitQueryDto, @Request() req: any) {
    return this.visitsService.findAll({ ...query, status: 'submitted' }, req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateVisitDto,
    @Request() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.visitsService.create(dto, req.user.id, idempotencyKey);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.visitsService.findOne(id);
  }

  @Patch(':id/sections/:key')
  updateSection(
    @Param('id') visitId: string,
    @Param('key') sectionKey: string,
    @Body() dto: UpdateSectionDto,
    @Request() req: any,
  ) {
    return this.visitsService.updateSection(visitId, sectionKey, dto, req.user.id);
  }

  @Post(':id/submit')
  submit(@Param('id') visitId: string, @Request() req: any) {
    return this.visitsService.submit(visitId, req.user.id);
  }
}
