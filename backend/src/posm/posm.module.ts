import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosmAsset } from '../database/entities/posm-asset.entity';
import { VisitObjective } from '../database/entities/visit-objective.entity';
import { VisitContext } from '../database/entities/visit-context.entity';
import { PosmService } from './posm.service';
import { PosmController } from './posm.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PosmAsset, VisitObjective, VisitContext])],
  controllers: [PosmController],
  providers: [PosmService],
  exports: [PosmService],
})
export class PosmModule {}
