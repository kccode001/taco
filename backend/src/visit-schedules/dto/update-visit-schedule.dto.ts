import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMinSize,
  Max,
  Min,
} from 'class-validator';
import { VisitScheduleFrequency } from '../../database/entities/visit-schedule.entity';

/**
 * All fields optional; the service re-runs the same shape validation
 * (frequency → required fields) after merging with the existing row.
 */
export class UpdateVisitScheduleDto {
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
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string | null;

  @IsOptional()
  @IsDateString()
  one_time_date?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekly_days?: number[] | null;

  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(31)
  monthly_day?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
