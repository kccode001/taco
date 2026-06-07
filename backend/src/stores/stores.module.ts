import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { Store } from '../database/entities/store.entity';
import { Visit } from '../database/entities/visit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Store, Visit])],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
