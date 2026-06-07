import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DigestService } from './digest.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';

@Controller('digest')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DigestController {
  constructor(private readonly service: DigestService) {}

  @Get('latest')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  getLatest() {
    return this.service.getLatest();
  }

  // AC-19: dashboard reads the daily digest by date + optional territory.
  @Get('daily')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.REP)
  getDaily(@Query('date') date?: string, @Query('territory_id') territoryId?: string) {
    return this.service.getDaily({ date, territoryId });
  }

  // On-demand regenerate — required for the demo flow.
  @Post('daily/regenerate')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  regenerate(@Query('date') date?: string, @Query('territory_id') territoryId?: string) {
    return this.service.generate({ date, territoryId });
  }
}
