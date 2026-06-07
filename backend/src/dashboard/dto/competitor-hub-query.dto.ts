import { IsOptional, IsUUID, IsDateString } from 'class-validator';

export class CompetitorHubQueryDto {
  @IsOptional()
  @IsUUID()
  brand_id?: string;

  @IsOptional()
  @IsUUID()
  territory_id?: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}
