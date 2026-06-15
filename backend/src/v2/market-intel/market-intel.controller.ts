import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { MarketIntelService } from './market-intel.service';
import {
  BrandBucketDetailQueryDto,
  BrandBucketDistributionQueryDto,
  CategoryQueryDto,
  CategorySkusQueryDto,
  MarketIntelQueryDto,
  PriceBandsQueryDto,
  SkuPriceHistoryQueryDto,
  SkuStorePricingQueryDto,
  TopNonTacoQueryDto,
  TopSkusPerAreaQueryDto,
} from './dto/market-intel.dto';

/**
 * TACO v2 — Market Intelligence (the revamped `/taro/v2/analytics`, KC's
 * 4-section v3 layout). Routes:
 *   GET /api/v2/market-intel/coverage?period=&area=
 *   GET /api/v2/market-intel/top-skus-per-area?period=&area=&top_n=10        (S1)
 *   GET /api/v2/market-intel/top-non-taco?period=&area=&top_n=10&sort=       (S1)
 *   GET /api/v2/market-intel/category-distribution?period=&area=             (S2)
 *   GET /api/v2/market-intel/category-monthly-trend?period=&area=            (S2)
 *   GET /api/v2/market-intel/category-skus?category=&period=&area=           (S2)
 *   GET /api/v2/market-intel/price-bands?period=&area=&q=&page=&page_size=   (S3)
 *   GET /api/v2/market-intel/sku-price-history?sku_id=&period=&area=&store_id=(S3)
 *   GET /api/v2/market-intel/sku-store-pricing?sku_id=&period=&area=         (S3)
 *   GET /api/v2/market-intel/brand-bucket-distribution?period=&area=         (S4)
 *   GET /api/v2/market-intel/brand-bucket-detail?bucket=&brand_id=&sku=&...  (S4)
 * Admin + manager only — all read-only over status='done' invoices.
 *
 * RETIRED in v3 (do not return): `price-gap-pairs` (R3) + `sku-whitespace` (R4).
 */
@Controller('v2/market-intel')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class MarketIntelController {
  constructor(private readonly service: MarketIntelService) {}

  /** Page-level coverage for the truth banner + per-panel chips (AC-1, AC-2). */
  @Get('coverage')
  coverage(@Query() query: MarketIntelQueryDto) {
    return this.service.coverage(query);
  }

  /** Section 1 — per-area top TACO SKUs by occurrence frequency (AC-19, AC-30). */
  @Get('top-skus-per-area')
  topSkusPerArea(@Query() query: TopSkusPerAreaQueryDto) {
    return this.service.topSkusPerArea(query);
  }

  /** Section 1 — top non-TACO (competitor + lain-lain) combined card (AC-31). */
  @Get('top-non-taco')
  topNonTaco(@Query() query: TopNonTacoQueryDto) {
    return this.service.topNonTaco(query);
  }

  /** Section 2 — Komposisi kategori TACO pie (AC-32). */
  @Get('category-distribution')
  categoryDistribution(@Query() query: CategoryQueryDto) {
    return this.service.categoryDistribution(query);
  }

  /** Section 2 — Tren unggahan kategori line (AC-33). */
  @Get('category-monthly-trend')
  categoryMonthlyTrend(@Query() query: CategoryQueryDto) {
    return this.service.categoryMonthlyTrend(query);
  }

  /** Section 2 — category → SKU drill list (AC-34). */
  @Get('category-skus')
  categorySkus(@Query() query: CategorySkusQueryDto) {
    return this.service.categorySkus(query);
  }

  /** Section 3 — Laporan SKU table: price + qty bands, paginated (AC-4, AC-5, AC-6, AC-35, AC-36). */
  @Get('price-bands')
  priceBands(@Query() query: PriceBandsQueryDto) {
    return this.service.priceBands(query);
  }

  /** Section 3 — detail modal: price + qty trend, stats, invoices (AC-7, AC-25, AC-26, AC-27). */
  @Get('sku-price-history')
  skuPriceHistory(@Query() query: SkuPriceHistoryQueryDto) {
    return this.service.skuPriceHistory(query);
  }

  /** Section 3 — per-store pricing sub-section + store pricing history (AC-37). */
  @Get('sku-store-pricing')
  skuStorePricing(@Query() query: SkuStorePricingQueryDto) {
    return this.service.skuStorePricing(query);
  }

  /** Section 4 — Komposisi merek pie: taco/kompetitor/lain-lain buckets (AC-38, AC-41). */
  @Get('brand-bucket-distribution')
  brandBucketDistribution(@Query() query: BrandBucketDistributionQueryDto) {
    return this.service.brandBucketDistribution(query);
  }

  /** Section 4 — brand-bucket drill modal: brands → SKUs (price stats) → invoices (AC-39, AC-40). */
  @Get('brand-bucket-detail')
  brandBucketDetail(@Query() query: BrandBucketDetailQueryDto) {
    return this.service.brandBucketDetail(query);
  }
}
