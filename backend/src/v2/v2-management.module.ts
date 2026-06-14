import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AreaV2 } from '../database/entities/v2/area-v2.entity';
import { StoreV2 } from '../database/entities/v2/store-v2.entity';
import { SalesAgentV2 } from '../database/entities/v2/sales-agent-v2.entity';
import { InvoiceV2 } from '../database/entities/v2/invoice-v2.entity';
import { InvoiceLineItemV2 } from '../database/entities/v2/invoice-line-item-v2.entity';
import { RecommendationV2 } from '../database/entities/v2/recommendation-v2.entity';
import { MarketInsightV2 } from '../database/entities/v2/market-insight-v2.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { Region } from '../database/entities/region.entity';
import { TaroAgentRegion } from '../database/entities/taro-agent-region.entity';
import { User } from '../database/entities/user.entity';

import { AreasController } from './areas/areas.controller';
import { AreasService } from './areas/areas.service';
import { RegionsV2Controller } from './regions/regions-v2.controller';
import { RegionsV2Service } from './regions/regions-v2.service';
import { StoresController } from './stores/stores.controller';
import { StoresService } from './stores/stores.service';
import { SalesController } from './sales/sales.controller';
import { SalesService } from './sales/sales.service';
import { V2DashboardController } from './dashboard/v2-dashboard.controller';
import { V2DashboardService } from './dashboard/v2-dashboard.service';
import { V2AnalyticsController } from './analytics/v2-analytics.controller';
import { V2AnalyticsService } from './analytics/v2-analytics.service';
import { MarketIntelController } from './market-intel/market-intel.controller';
import { MarketIntelService } from './market-intel/market-intel.service';
import { RecommendationsController } from './recommendations/recommendations.controller';
import { RecommendationsService } from './recommendations/recommendations.service';

/**
 * TACO v2 MANAGEMENT surface (Pair B — Mortar BE / Mosaic FE).
 *
 * Owns: Areas/Stores/Sales CRUD, market-demand Dashboard (recap/trending/
 * ai-insight), reason-derived Recommendation engine. All routes under /api/v2/*.
 *
 * Most entities here are Grout's CANONICAL v2 tables (already registered in
 * the root TypeOrmModule) — `forFeature` only requests repositories, it does
 * NOT re-declare/fork tables. `RecommendationV2` is this surface's own table
 * (`taro_v2_recommendations`); `TacoSku` is the shared v1 catalog read/written
 * by the recommendation apply path. Areas/Stores/Sales CRUD, the demand
 * Dashboard (recap/trending/ai-insight) and the reason-derived Recommendation
 * engine are all live.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AreaV2,
      StoreV2,
      SalesAgentV2,
      InvoiceV2,
      InvoiceLineItemV2,
      RecommendationV2,
      MarketInsightV2,
      TacoSku,
      Region,
      TaroAgentRegion,
      User,
    ]),
  ],
  controllers: [
    AreasController,
    RegionsV2Controller,
    StoresController,
    SalesController,
    V2DashboardController,
    V2AnalyticsController,
    MarketIntelController,
    RecommendationsController,
  ],
  providers: [
    AreasService,
    RegionsV2Service,
    StoresService,
    SalesService,
    V2DashboardService,
    V2AnalyticsService,
    MarketIntelService,
    RecommendationsService,
  ],
})
export class V2ManagementModule {}
