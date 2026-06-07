import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompetitorBrand } from '../database/entities/competitor-brand.entity';
import { CompetitorBrandsService } from './competitor-brands.service';
import { CompetitorBrandsController } from './competitor-brands.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CompetitorBrand])],
  controllers: [CompetitorBrandsController],
  providers: [CompetitorBrandsService],
  exports: [CompetitorBrandsService],
})
export class CompetitorBrandsModule {}
