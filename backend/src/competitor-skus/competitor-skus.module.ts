import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompetitorSku } from '../database/entities/competitor-sku.entity';
import { CompetitorSkusService } from './competitor-skus.service';
import { CompetitorSkusController } from './competitor-skus.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CompetitorSku])],
  controllers: [CompetitorSkusController],
  providers: [CompetitorSkusService],
  exports: [CompetitorSkusService],
})
export class CompetitorSkusModule {}
