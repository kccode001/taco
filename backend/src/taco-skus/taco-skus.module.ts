import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { TacoSkusService } from './taco-skus.service';
import { TacoSkusController } from './taco-skus.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TacoSku])],
  providers: [TacoSkusService],
  controllers: [TacoSkusController],
  exports: [TacoSkusService],
})
export class TacoSkusModule {}
