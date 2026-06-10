import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateSalesDto } from './create-sales.dto';

/** Password is not updated here (use a dedicated reset endpoint, per v1). */
export class UpdateSalesDto extends PartialType(CreateSalesDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
