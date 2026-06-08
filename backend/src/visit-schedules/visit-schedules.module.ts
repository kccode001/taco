import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisitSchedule } from '../database/entities/visit-schedule.entity';
import { User } from '../database/entities/user.entity';
import { Visit } from '../database/entities/visit.entity';
import { VisitSchedulesService } from './visit-schedules.service';
import { VisitSchedulesController } from './visit-schedules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VisitSchedule, User, Visit])],
  providers: [VisitSchedulesService],
  controllers: [VisitSchedulesController],
  exports: [VisitSchedulesService],
})
export class VisitSchedulesModule {}
