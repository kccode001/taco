import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisitContext } from '../database/entities/visit-context.entity';
import { VisitContextsService } from './visit-contexts.service';
import { VisitContextsController } from './visit-contexts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VisitContext])],
  providers: [VisitContextsService],
  controllers: [VisitContextsController],
  exports: [VisitContextsService],
})
export class VisitContextsModule {}
