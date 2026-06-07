import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateCompetitorSkuDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsUUID()
  brand_id?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsUUID()
  mapped_taco_sku_id?: string;
}
