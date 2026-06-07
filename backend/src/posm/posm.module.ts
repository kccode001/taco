import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosmAsset } from '../database/entities/posm-asset.entity';
import { PosmService } from './posm.service';
import { PosmController } from './posm.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PosmAsset])],
  controllers: [PosmController],
  providers: [PosmService],
  exports: [PosmService],
})
export class PosmModule {}
