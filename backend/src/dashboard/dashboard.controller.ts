import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DigestService } from '../digest/digest.service';
import { CompetitorHubQueryDto } from './dto/competitor-hub-query.dto';
import { PriceMovementQueryDto } from './dto/price-movement-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly digestService: DigestService,
  ) {}

  @Get('kpis')
  getKpis() {
    return this.dashboardService.getKpis();
  }

  @Get('live-feed')
  getLiveFeed() {
    return this.dashboardService.getLiveFeed();
  }

  @Get('competitor-hub')
  getCompetitorHub(@Query() query: CompetitorHubQueryDto) {
    return this.dashboardService.getCompetitorHub(query);
  }

  @Get('price-movement')
  getPriceMovement(@Query() query: PriceMovementQueryDto) {
    return this.dashboardService.getPriceMovement(query);
  }

  @Get('market-digest/latest')
  getLatestDigest() {
    return this.dashboardService.getLatestDigest();
  }

  @Post('market-digest/generate')
  generateDigest() {
    return this.digestService.generate();
  }
}
