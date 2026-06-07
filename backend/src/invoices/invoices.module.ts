import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Invoice } from '../database/entities/invoice.entity';
import { InvoiceLineItem } from '../database/entities/invoice-line-item.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { CompetitorSku } from '../database/entities/competitor-sku.entity';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { OcrProcessor } from './ocr.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, InvoiceLineItem, TacoSku, CompetitorSku]),
    BullModule.registerQueue({ name: 'ocr' }),
    MulterModule.register({
      storage: memoryStorage(),
    }),
  ],
  providers: [InvoicesService, OcrProcessor],
  controllers: [InvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
