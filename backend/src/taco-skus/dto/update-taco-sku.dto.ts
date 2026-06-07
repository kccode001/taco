import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, Min } from 'class-validator';
import { TacoSkuCategory } from '../../database/entities/taco-sku.entity';

export class UpdateTacoSkuDto {
  @IsOptional() @IsString()
  code?: string;

  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsEnum(TacoSkuCategory)
  category?: TacoSkuCategory;

  @IsOptional() @IsNumber() @Min(0)
  standard_price?: number;

  @IsOptional() @IsString()
  uom?: string;

  @IsOptional() @IsBoolean()
  is_active?: boolean;
}
