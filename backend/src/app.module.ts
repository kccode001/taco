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
  ],
})
export class AppModule {}
