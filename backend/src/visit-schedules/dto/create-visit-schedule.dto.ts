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
  ValidateIf,
} from 'class-validator';
import { VisitScheduleFrequency } from '../../database/entities/visit-schedule.entity';

export class CreateVisitScheduleDto {
  @IsUUID()
  sales_staff_id: string;

  @IsUUID()
  store_id: string;

  @IsEnum(VisitScheduleFrequency)
  frequency: VisitScheduleFrequency;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string | null;

  @ValidateIf((o) => o.frequency === VisitScheduleFrequency.ONCE)
  @IsDateString()
  one_time_date?: string | null;

  @ValidateIf((o) => o.frequency === VisitScheduleFrequency.WEEKLY)
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekly_days?: number[] | null;

  @ValidateIf((o) => o.frequency === VisitScheduleFrequency.MONTHLY)
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
