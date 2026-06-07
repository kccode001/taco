import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Visit } from '../database/entities/visit.entity';
import { Store } from '../database/entities/store.entity';
import { InvoiceLineItem } from '../database/entities/invoice-line-item.entity';
import { MarketDigest } from '../database/entities/market-digest.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { DigestModule } from '../digest/digest.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Visit, Store, InvoiceLineItem, MarketDigest]),
    DigestModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
