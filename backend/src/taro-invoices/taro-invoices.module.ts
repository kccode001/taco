import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TaroInvoice } from '../database/entities/taro-invoice.entity';
import { TaroInvoiceLineItem } from '../database/entities/taro-invoice-line-item.entity';
import { TaroInvoiceSkuCorrection } from '../database/entities/taro-invoice-sku-correction.entity';
import { TaroInvoiceRecommendation } from '../database/entities/taro-invoice-recommendation.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { TaroInvoicesService } from './taro-invoices.service';
import { TaroInvoicesController } from './taro-invoices.controller';
import { TaroInvoiceOcrProcessor } from './taro-invoice-ocr.processor';
import { TaroRecommendationsService } from './taro-recommendations.service';
import { QUEUE_TARO_OCR } from './taro-invoices.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaroInvoice,
      TaroInvoiceLineItem,
      TaroInvoiceSkuCorrection,
      TaroInvoiceRecommendation,
      TacoSku,
    ]),
    BullModule.registerQueue({ name: QUEUE_TARO_OCR }),
    MulterModule.register({ storage: memoryStorage() }),
  ],
  providers: [TaroInvoicesService, TaroRecommendationsService, TaroInvoiceOcrProcessor],
  controllers: [TaroInvoicesController],
  exports: [TaroInvoicesService],
})
export class TaroInvoicesModule {}
