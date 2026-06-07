import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisitObjective } from '../database/entities/visit-objective.entity';
import { VisitObjectivesService } from './visit-objectives.service';
import { VisitObjectivesController } from './visit-objectives.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VisitObjective])],
  providers: [VisitObjectivesService],
  controllers: [VisitObjectivesController],
  exports: [VisitObjectivesService],
})
export class VisitObjectivesModule {}
