import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthModule } from '../auth/auth.module';
import { TaroInvoice } from '../database/entities/taro-invoice.entity';
import { TaroInvoiceLineItem } from '../database/entities/taro-invoice-line-item.entity';
import { TaroInvoiceSkuCorrection } from '../database/entities/taro-invoice-sku-correction.entity';
import { TaroInvoiceRecommendation } from '../database/entities/taro-invoice-recommendation.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { Region } from '../database/entities/region.entity';
import { TaroMappingRule } from '../database/entities/taro-mapping-rule.entity';
import { TaroAgentRegion } from '../database/entities/taro-agent-region.entity';
import { User } from '../database/entities/user.entity';
import { TaroInvoicesService } from './taro-invoices.service';
import { TaroInvoicesController } from './taro-invoices.controller';
import { TaroInvoiceOcrProcessor } from './taro-invoice-ocr.processor';
import { TaroRecommendationsService } from './taro-recommendations.service';
import { QUEUE_TARO_OCR } from './taro-invoices.constants';
import { RegionsModule } from '../regions/regions.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaroInvoice,
      TaroInvoiceLineItem,
      TaroInvoiceSkuCorrection,
      TaroInvoiceRecommendation,
      TacoSku,
      Region,
      TaroMappingRule,
      TaroAgentRegion,
      User,
    ]),
    BullModule.registerQueue({ name: QUEUE_TARO_OCR }),
    MulterModule.register({ storage: memoryStorage() }),
    RegionsModule,
    EmbeddingsModule,
    AuthModule,
  ],
  providers: [TaroInvoicesService, TaroRecommendationsService, TaroInvoiceOcrProcessor],
  controllers: [TaroInvoicesController],
  exports: [TaroInvoicesService],
})
export class TaroInvoicesModule {}
