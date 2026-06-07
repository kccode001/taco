import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Territory } from '../database/entities/territory.entity';
import { WilayahService } from './wilayah.service';
import { WilayahController } from './wilayah.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Territory])],
  providers: [WilayahService],
  controllers: [WilayahController],
  exports: [WilayahService],
})
export class WilayahModule {}
