import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TerritoriesModule } from './territories/territories.module';
import { WilayahModule } from './wilayah/wilayah.module';
import { StoresModule } from './stores/stores.module';
import { PicsModule } from './pics/pics.module';
import { VisitsModule } from './visits/visits.module';
import { VisitObjectivesModule } from './visit-objectives/visit-objectives.module';
import { VisitContextsModule } from './visit-contexts/visit-contexts.module';
import { InvoicesModule } from './invoices/invoices.module';
import { TacoSkusModule } from './taco-skus/taco-skus.module';
import { CompetitorSkusModule } from './competitor-skus/competitor-skus.module';
import { CompetitorBrandsModule } from './competitor-brands/competitor-brands.module';
import { BurningQuestionsModule } from './burning-questions/burning-questions.module';
import { PosmModule } from './posm/posm.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DigestModule } from './digest/digest.module';
import { VoiceModule } from './voice/voice.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { TaroInvoicesModule } from './taro-invoices/taro-invoices.module';
import { TaroSalesAgentsModule } from './taro-sales-agents/taro-sales-agents.module';
import { VisitSchedulesModule } from './visit-schedules/visit-schedules.module';
import { RegionsModule } from './regions/regions.module';

import { User } from './database/entities/user.entity';
import { Territory } from './database/entities/territory.entity';
import { Store } from './database/entities/store.entity';
import { Visit } from './database/entities/visit.entity';
import { VisitSection } from './database/entities/visit-section.entity';
import { Invoice } from './database/entities/invoice.entity';
import { InvoiceLineItem } from './database/entities/invoice-line-item.entity';
import { TacoSku } from './database/entities/taco-sku.entity';
import { CompetitorSku } from './database/entities/competitor-sku.entity';
import { CompetitorBrand } from './database/entities/competitor-brand.entity';
import { BurningQuestion } from './database/entities/burning-question.entity';
import { PosmAsset } from './database/entities/posm-asset.entity';
import { VisitObjective } from './database/entities/visit-objective.entity';
import { VisitContext } from './database/entities/visit-context.entity';
import { MarketDigest } from './database/entities/market-digest.entity';
import { Pic } from './database/entities/pic.entity';
import { VisitTacoSku } from './database/entities/visit-taco-sku.entity';
import { VisitStockLevel } from './database/entities/visit-stock-level.entity';
import { VisitPosm } from './database/entities/visit-posm.entity';
import { VisitCompetitor } from './database/entities/visit-competitor.entity';
import { VisitCompetitorSku } from './database/entities/visit-competitor-sku.entity';
import { VisitCompetitorPromo } from './database/entities/visit-competitor-promo.entity';
import { VisitCompetitorPosm } from './database/entities/visit-competitor-posm.entity';
import { VisitBurningQuestion } from './database/entities/visit-burning-question.entity';
import { VisitSinyalToko } from './database/entities/visit-sinyal-toko.entity';
import { FotoKatalog } from './invoices/foto-katalog.entity';
import { TaroInvoice } from './database/entities/taro-invoice.entity';
import { TaroInvoiceLineItem } from './database/entities/taro-invoice-line-item.entity';
import { TaroInvoiceSkuCorrection } from './database/entities/taro-invoice-sku-correction.entity';
import { TaroInvoiceRecommendation } from './database/entities/taro-invoice-recommendation.entity';
import { VisitSchedule } from './database/entities/visit-schedule.entity';
import { Region } from './database/entities/region.entity';
import { TaroMappingRule } from './database/entities/taro-mapping-rule.entity';
import { TaroAgentRegion } from './database/entities/taro-agent-region.entity';
// --- TACO v2 entities (new tables, prefix taro_v2_; v1 left frozen) ---
import { AreaV2 } from './database/entities/v2/area-v2.entity';
import { StoreV2 } from './database/entities/v2/store-v2.entity';
import { SalesAgentV2 } from './database/entities/v2/sales-agent-v2.entity';
import { InvoiceV2 } from './database/entities/v2/invoice-v2.entity';
import { InvoiceImageV2 } from './database/entities/v2/invoice-image-v2.entity';
import { InvoiceLineItemV2 } from './database/entities/v2/invoice-line-item-v2.entity';
import { TaroV2Module } from './taro-v2/taro-v2.module';
import { V2ManagementModule } from './v2/v2-management.module';
// --- TACO v2 MANAGEMENT surface entity (Mortar-owned: reason-derived recs) ---
import { RecommendationV2 } from './database/entities/v2/recommendation-v2.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [
          User, Territory, Store, Visit, VisitSection,
          Invoice, InvoiceLineItem, TacoSku, CompetitorSku,
          CompetitorBrand, BurningQuestion, PosmAsset,
          VisitObjective, VisitContext, MarketDigest,
          Pic, VisitTacoSku, VisitStockLevel, VisitPosm,
          VisitCompetitor, VisitCompetitorSku, VisitCompetitorPromo,
          VisitCompetitorPosm, VisitBurningQuestion, VisitSinyalToko,
          FotoKatalog,
          TaroInvoice, TaroInvoiceLineItem, TaroInvoiceSkuCorrection, TaroInvoiceRecommendation,
          VisitSchedule,
          Region, TaroMappingRule,
          TaroAgentRegion,
          AreaV2, StoreV2, SalesAgentV2,
          InvoiceV2, InvoiceImageV2, InvoiceLineItemV2,
          RecommendationV2,
        ],
        synchronize: true,
        logging: false,
      }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: config.get('REDIS_URL') || 'redis://localhost:6379',
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    TerritoriesModule,
    WilayahModule,
    StoresModule,
    PicsModule,
    VisitsModule,
    VisitObjectivesModule,
    VisitContextsModule,
    InvoicesModule,
    TacoSkusModule,
    CompetitorSkusModule,
    CompetitorBrandsModule,
    BurningQuestionsModule,
    PosmModule,
    DashboardModule,
    DigestModule,
    VoiceModule,
    EmbeddingsModule,
    TaroInvoicesModule,
    TaroSalesAgentsModule,
    VisitSchedulesModule,
    RegionsModule,
    TaroV2Module,
    V2ManagementModule,
  ],
})
export class AppModule {}
