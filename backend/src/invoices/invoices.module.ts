import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Invoice } from '../database/entities/invoice.entity';
import { InvoiceLineItem } from '../database/entities/invoice-line-item.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { CompetitorSku } from '../database/entities/competitor-sku.entity';
import { CompetitorBrand } from '../database/entities/competitor-brand.entity';
import { Visit } from '../database/entities/visit.entity';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { FotoKatalog } from './foto-katalog.entity';
import {
  InvoicesService,
  QUEUE_OCR_INVOICE,
  QUEUE_OCR_FOTO_KATALOG,
} from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoiceOcrProcessor } from './invoice-ocr.processor';
import { FotoKatalogProcessor } from './foto-katalog.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invoice,
      InvoiceLineItem,
      TacoSku,
      CompetitorSku,
      CompetitorBrand,
      Visit,
      FotoKatalog,
    ]),
    BullModule.registerQueue(
      { name: QUEUE_OCR_INVOICE },
      { name: QUEUE_OCR_FOTO_KATALOG },
    ),
    MulterModule.register({ storage: memoryStorage() }),
    EmbeddingsModule,
  ],
  providers: [InvoicesService, InvoiceOcrProcessor, FotoKatalogProcessor],
  controllers: [InvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
