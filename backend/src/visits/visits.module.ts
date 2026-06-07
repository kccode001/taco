import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Visit } from '../database/entities/visit.entity';
import { VisitSection } from '../database/entities/visit-section.entity';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Visit, VisitSection]),
    BullModule.registerQueue({ name: 'digest' }),
  ],
  providers: [VisitsService],
  controllers: [VisitsController],
  exports: [VisitsService],
})
export class VisitsModule {}
