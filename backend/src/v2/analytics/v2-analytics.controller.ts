import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { V2AnalyticsService } from './v2-analytics.service';
import { AnalyticsQueryDto, AnalyticsDrillQueryDto } from '../dto/period.dto';

/**
 * v2 MANAGEMENT — Analytics. Routes:
 *   GET /api/v2/analytics/summary?period=&area=
 *   GET /api/v2/analytics/share-by-area?period=&area=
 *   GET /api/v2/analytics/trend?period=&area=
 *   GET /api/v2/analytics/top-skus?period=&area=&limit=
 *   GET /api/v2/analytics/competitor-brands?period=&area=
 *   GET /api/v2/analytics/area-stores?area_id=&period=
 * Admin + manager only.
 */
@Controller('v2/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class V2AnalyticsController {
  constructor(private readonly service: V2AnalyticsService) {}

  /** KPI header strip with period-over-period deltas. */
  @Get('summary')
  summary(@Query() query: AnalyticsQueryDto) {
    return this.service.summary(query);
  }

  /** Three-dimension TACO share per area (qty%, value%, frequency%). */
  @Get('share-by-area')
  shareByArea(@Query() query: AnalyticsQueryDto) {
    return this.service.shareByArea(query);
  }

  /** TACO share trend over time (created_at buckets, per area). */
  @Get('trend')
  trend(@Query() query: AnalyticsQueryDto) {
    return this.service.trend(query);
  }

  /** Top confirmed TACO SKUs (matched_sku_id IS NOT NULL). */
  @Get('top-skus')
  topSkus(@Query() query: AnalyticsQueryDto) {
    return this.service.topSkus(query);
  }

  /** Competitor brand presence per area. */
  @Get('competitor-brands')
  competitorBrands(@Query() query: AnalyticsQueryDto) {
    return this.service.competitorBrands(query);
  }

  /** Store-level drill-down for a single area. */
  @Get('area-stores')
  areaStores(@Query() query: AnalyticsDrillQueryDto) {
    return this.service.areaStores(query);
  }
}
