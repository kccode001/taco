import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { MarketIntelService } from './market-intel.service';
import {
  DemandMixQueryDto,
  MarketIntelQueryDto,
  PriceBandsQueryDto,
  SkuEvidenceQueryDto,
} from './dto/market-intel.dto';

/**
 * TACO v2 — Market Intelligence (the revamped `/taro/v2/analytics`). Routes:
 *   GET /api/v2/market-intel/coverage?period=&area=
 *   GET /api/v2/market-intel/price-bands?period=&area=&limit=10
 *   GET /api/v2/market-intel/sku-evidence?sku_id=&period=&area=
 *   GET /api/v2/market-intel/demand-mix?period=&area=&top_n=5
 *   GET /api/v2/market-intel/competitor-basket?period=&area=
 *   GET /api/v2/market-intel/distributor-performance?period=&area=
 * Admin + manager only — all read-only over status='done' invoices.
 */
@Controller('v2/market-intel')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class MarketIntelController {
  constructor(private readonly service: MarketIntelService) {}

  /** Page-level coverage for the truth banner (AC-1, AC-2). */
  @Get('coverage')
  coverage(@Query() query: MarketIntelQueryDto) {
    return this.service.coverage(query);
  }

  /** Per-SKU real-price bands + outliers (AC-4, AC-5, AC-6). */
  @Get('price-bands')
  priceBands(@Query() query: PriceBandsQueryDto) {
    return this.service.priceBands(query);
  }

  /** Per-SKU invoice-evidence drill-down (AC-7). */
  @Get('sku-evidence')
  skuEvidence(@Query() query: SkuEvidenceQueryDto) {
    return this.service.skuEvidence(query);
  }

  /** Per-region demand mix by line-occurrence frequency (AC-8, AC-9). */
  @Get('demand-mix')
  demandMix(@Query() query: DemandMixQueryDto) {
    return this.service.demandMix(query);
  }

  /** Competitor share-of-basket co-occurrence (AC-10, AC-11). */
  @Get('competitor-basket')
  competitorBasket(@Query() query: MarketIntelQueryDto) {
    return this.service.competitorBasket(query);
  }

  /** Distributor purchase frequency + AOV + last-seen (AC-16, AC-17). */
  @Get('distributor-performance')
  distributorPerformance(@Query() query: MarketIntelQueryDto) {
    return this.service.distributorPerformance(query);
  }
}
