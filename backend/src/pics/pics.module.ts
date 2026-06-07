import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pic } from '../database/entities/pic.entity';
import { Store } from '../database/entities/store.entity';
import { PicsService } from './pics.service';
import { PicsController } from './pics.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Pic, Store])],
  controllers: [PicsController],
  providers: [PicsService],
  exports: [PicsService],
})
export class PicsModule {}
