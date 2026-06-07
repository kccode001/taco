import { IsOptional, IsUUID, IsString } from 'class-validator';

export class CompetitorSkuQueryDto {
  @IsOptional()
  @IsUUID()
  brand_id?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
