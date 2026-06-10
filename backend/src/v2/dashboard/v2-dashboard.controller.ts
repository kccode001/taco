import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { V2DashboardService } from './v2-dashboard.service';
import {
  AiInsightQueryDto,
  RecapQueryDto,
  TrendingQueryDto,
} from '../dto/period.dto';

/**
 * v2 MANAGEMENT — Dashboard. Routes:
 *   GET /api/v2/dashboard/recap?period=&area=
 *   GET /api/v2/dashboard/trending?period=&area=&limit=
 *   GET /api/v2/dashboard/ai-insight?period=&area=
 * Admin + manager only — this is management's market-demand surface.
 */
@Controller('v2/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class V2DashboardController {
  constructor(private readonly service: V2DashboardService) {}

  @Get('recap')
  recap(@Query() query: RecapQueryDto) {
    return this.service.recap(query);
  }

  @Get('trending')
  trending(@Query() query: TrendingQueryDto) {
    return this.service.trending(query);
  }

  @Get('ai-insight')
  aiInsight(@Query() query: AiInsightQueryDto) {
    return this.service.aiInsight(query);
  }
}
