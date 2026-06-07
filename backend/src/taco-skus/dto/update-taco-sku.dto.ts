import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';

export class UpdateTacoSkuDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  standard_price?: number;

  @IsOptional()
  @IsString()
  uom?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
