import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TerritoriesModule } from './territories/territories.module';
import { StoresModule } from './stores/stores.module';
import { VisitsModule } from './visits/visits.module';
import { InvoicesModule } from './invoices/invoices.module';
import { TacoSkusModule } from './taco-skus/taco-skus.module';
import { CompetitorSkusModule } from './competitor-skus/competitor-skus.module';
import { CompetitorBrandsModule } from './competitor-brands/competitor-brands.module';
import { BurningQuestionsModule } from './burning-questions/burning-questions.module';
import { PosmModule } from './posm/posm.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DigestModule } from './digest/digest.module';

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
    StoresModule,
    VisitsModule,
    InvoicesModule,
    TacoSkusModule,
    CompetitorSkusModule,
    CompetitorBrandsModule,
    BurningQuestionsModule,
    PosmModule,
    DashboardModule,
    DigestModule,
  ],
})
export class AppModule {}
