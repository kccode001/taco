import { IsString, IsNumber, IsOptional, IsEnum, Min } from 'class-validator';
import { TacoSkuCategory } from '../../database/entities/taco-sku.entity';

export class CreateTacoSkuDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(TacoSkuCategory)
  category?: TacoSkuCategory;

  @IsNumber()
  @Min(0)
  standard_price: number;

  @IsOptional()
  @IsString()
  uom?: string;
}
