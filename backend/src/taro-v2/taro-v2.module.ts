import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthModule } from '../auth/auth.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { AreaV2 } from '../database/entities/v2/area-v2.entity';
import { StoreV2 } from '../database/entities/v2/store-v2.entity';
import { SalesAgentV2 } from '../database/entities/v2/sales-agent-v2.entity';
import { InvoiceV2 } from '../database/entities/v2/invoice-v2.entity';
import { InvoiceImageV2 } from '../database/entities/v2/invoice-image-v2.entity';
import { InvoiceLineItemV2 } from '../database/entities/v2/invoice-line-item-v2.entity';
import { CompetitorBrand } from '../database/entities/competitor-brand.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { InvoicesV2Service } from './invoices-v2.service';
import { ImageValidationService } from './image-validation.service';
import { InvoicesV2Controller } from './invoices-v2.controller';
import { LineItemsV2Controller } from './line-items-v2.controller';
import { TaroV2OcrProcessor } from './taro-v2-ocr.processor';
import { QUEUE_TARO_V2_OCR } from './taro-v2.constants';

/**
 * TACO v2 — core spine (Pair A BE). Owns the canonical v2 schema; the
 * management surface (Mortar) consumes these entities. v1 modules untouched.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AreaV2,
      StoreV2,
      SalesAgentV2,
      InvoiceV2,
      InvoiceImageV2,
      InvoiceLineItemV2,
      CompetitorBrand,
      TacoSku,
    ]),
    BullModule.registerQueue({ name: QUEUE_TARO_V2_OCR }),
    MulterModule.register({ storage: memoryStorage() }),
    EmbeddingsModule,
    AuthModule,
  ],
  providers: [InvoicesV2Service, ImageValidationService, TaroV2OcrProcessor],
  controllers: [InvoicesV2Controller, LineItemsV2Controller],
  exports: [InvoicesV2Service],
})
export class TaroV2Module {}
