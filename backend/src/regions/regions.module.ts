import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Region } from '../database/entities/region.entity';
import { RegionsService } from './regions.service';
import { RegionsController } from './regions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Region])],
  providers: [RegionsService],
  controllers: [RegionsController],
  exports: [RegionsService],
})
export class RegionsModule {}
