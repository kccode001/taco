import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { TaroInvoice } from '../database/entities/taro-invoice.entity';
import { Region } from '../database/entities/region.entity';
import { TaroAgentRegion } from '../database/entities/taro-agent-region.entity';
import { TaroSalesAgentsService } from './taro-sales-agents.service';
import { TaroSalesAgentsController } from './taro-sales-agents.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, TaroInvoice, Region, TaroAgentRegion]),
  ],
  controllers: [TaroSalesAgentsController],
  providers: [TaroSalesAgentsService],
  exports: [TaroSalesAgentsService],
})
export class TaroSalesAgentsModule {}
