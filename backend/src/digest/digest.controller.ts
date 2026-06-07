import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
