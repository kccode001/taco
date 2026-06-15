import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { MarketIntelService } from './market-intel.service';
import {
  MarketIntelQueryDto,
  PriceBandsQueryDto,
  PriceGapPairsQueryDto,
  SkuPriceHistoryQueryDto,
  SkuWhitespaceQueryDto,
  TopSkusPerAreaQueryDto,
} from './dto/market-intel.dto';

/**
 * TACO v2 — Market Intelligence (the revamped `/taro/v2/analytics`). Routes:
 *   GET /api/v2/market-intel/coverage?period=&area=
 *   GET /api/v2/market-intel/price-bands?period=&area=&q=&page=&page_size=
 *   GET /api/v2/market-intel/sku-price-history?sku_id=&period=&area=&store_id=
 *   GET /api/v2/market-intel/top-skus-per-area?period=&area=&top_n=5
 *   GET /api/v2/market-intel/price-gap-pairs?period=&area=&q=&page=&page_size=
 *   GET /api/v2/market-intel/sku-whitespace?period=&area=&q=&page=&page_size=
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

  /** R2 hero — per-SKU real-price bands + outliers, paginated + searchable (AC-4, AC-5, AC-6). */
  @Get('price-bands')
  priceBands(@Query() query: PriceBandsQueryDto) {
    return this.service.priceBands(query);
  }

  /** R5 modal — per-SKU price trend + min/avg/max + invoice list (AC-7, AC-25, AC-26, AC-27). */
  @Get('sku-price-history')
  skuPriceHistory(@Query() query: SkuPriceHistoryQueryDto) {
    return this.service.skuPriceHistory(query);
  }

  /** R1 — per-area top SKUs by line-occurrence frequency (AC-8, AC-9, AC-18, AC-19). */
  @Get('top-skus-per-area')
  topSkusPerArea(@Query() query: TopSkusPerAreaQueryDto) {
    return this.service.topSkusPerArea(query);
  }

  /** R3 — same-receipt TACO vs resolved-competitor price gaps (AC-10, AC-11, AC-20, AC-21, AC-22). */
  @Get('price-gap-pairs')
  priceGapPairs(@Query() query: PriceGapPairsQueryDto) {
    return this.service.priceGapPairs(query);
  }

  /** R4 — (taco_sku × region) combos not yet seen in the sample (AC-23, AC-24). */
  @Get('sku-whitespace')
  skuWhitespace(@Query() query: SkuWhitespaceQueryDto) {
    return this.service.skuWhitespace(query);
  }
}
