import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { TacoSkusService } from './taco-skus.service';
import { TacoSkusController } from './taco-skus.controller';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [TypeOrmModule.forFeature([TacoSku]), EmbeddingsModule],
  providers: [TacoSkusService],
  controllers: [TacoSkusController],
  exports: [TacoSkusService],
})
export class TacoSkusModule {}
