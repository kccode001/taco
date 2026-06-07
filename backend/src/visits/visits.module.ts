import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Visit } from '../database/entities/visit.entity';
import { VisitSection } from '../database/entities/visit-section.entity';
import { VisitTacoSku } from '../database/entities/visit-taco-sku.entity';
import { VisitStockLevel } from '../database/entities/visit-stock-level.entity';
import { VisitPosm } from '../database/entities/visit-posm.entity';
import { VisitCompetitor } from '../database/entities/visit-competitor.entity';
import { VisitCompetitorSku } from '../database/entities/visit-competitor-sku.entity';
import { VisitCompetitorPromo } from '../database/entities/visit-competitor-promo.entity';
import { VisitCompetitorPosm } from '../database/entities/visit-competitor-posm.entity';
import { VisitBurningQuestion } from '../database/entities/visit-burning-question.entity';
import { VisitSinyalToko } from '../database/entities/visit-sinyal-toko.entity';
import { Pic } from '../database/entities/pic.entity';
import { VisitContext } from '../database/entities/visit-context.entity';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Visit,
      VisitSection,
      VisitTacoSku,
      VisitStockLevel,
      VisitPosm,
      VisitCompetitor,
      VisitCompetitorSku,
      VisitCompetitorPromo,
      VisitCompetitorPosm,
      VisitBurningQuestion,
      VisitSinyalToko,
      Pic,
      VisitContext,
    ]),
    BullModule.registerQueue({ name: 'digest' }),
  ],
  providers: [VisitsService],
  controllers: [VisitsController],
  exports: [VisitsService],
})
export class VisitsModule {}
