import {
  Controller,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../database/entities/user.entity';
import { InvoicesV2Service } from './invoices-v2.service';
import { PatchLineItemV2Dto } from './dto/patch-line-item-v2.dto';

/**
 * TACO v2 admin resolve — `PATCH /api/v2/invoice-line-items/:id`.
 * Map SKU / mark competitor / capture mismatch reason. Admin + manager only
 * (resolution is an admin-dashboard concern in v2; the PWA only uploads).
 */
@Controller('v2/invoice-line-items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class LineItemsV2Controller {
  constructor(private readonly invoices: InvoicesV2Service) {}

  @Patch(':id')
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchLineItemV2Dto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.invoices.patchLineItem(id, body, { id: userId, role });
  }
}
