import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { VisitScheduleFrequency } from '../../database/entities/visit-schedule.entity';

export class VisitScheduleQueryDto {
  @IsOptional()
  @IsUUID()
  sales_staff_id?: string;

  @IsOptional()
  @IsUUID()
  store_id?: string;

  @IsOptional()
  @IsEnum(VisitScheduleFrequency)
  frequency?: VisitScheduleFrequency;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;
}
