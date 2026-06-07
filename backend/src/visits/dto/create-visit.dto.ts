import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateVisitDto {
  @IsString()
  store_id: string;

  @IsOptional()
  @IsDateString()
  visit_date?: string;
}
