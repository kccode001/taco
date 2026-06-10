import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { RecommendationsService } from './recommendations.service';
import { ListRecommendationsDto } from './dto/list-recommendations.dto';

/**
 * v2 MANAGEMENT — Recommendations. Routes:
 *   GET  /api/v2/recommendations?status=&auto_actionable=&area=
 *   POST /api/v2/recommendations/:id/apply         (auto_actionable only)
 *   POST /api/v2/recommendations/:id/acknowledge
 * Admin + manager only.
 */
@Controller('v2/recommendations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class RecommendationsController {
  constructor(private readonly service: RecommendationsService) {}

  @Get()
  list(@Query() query: ListRecommendationsDto) {
    return this.service.list(query);
  }

  /** Force a re-scan of mismatch reasons → derive any new recommendations. */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generate() {
    return this.service.generate();
  }

  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  apply(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.apply(id);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  acknowledge(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.acknowledge(id);
  }
}
