import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Visit } from '../database/entities/visit.entity';
import { VisitSection } from '../database/entities/visit-section.entity';
import { MarketDigest } from '../database/entities/market-digest.entity';
import { DigestService } from './digest.service';
import { DigestController } from './digest.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Visit, VisitSection, MarketDigest])],
  controllers: [DigestController],
  providers: [DigestService],
  exports: [DigestService],
})
export class DigestModule {}
