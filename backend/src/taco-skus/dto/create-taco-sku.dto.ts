import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  IsArray,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { TacoSkuCategory } from '../../database/entities/taco-sku.entity';

export class CreateTacoSkuDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(TacoSkuCategory)
  category?: TacoSkuCategory;

  @IsOptional() @IsString() @MaxLength(64)
  catalog_category?: string | null;

  @IsOptional() @IsString() @MaxLength(32)
  unit?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  product_name_aliases?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  unit_aliases?: string[];

  @IsOptional() @IsNumber() @Min(0)
  min_price?: number;

  @IsOptional() @IsNumber() @Min(0)
  max_price?: number;

  @IsOptional() @IsNumber() @Min(0)
  avg_price?: number;

  /** Legacy / fall-back price column. Defaults to avg_price when omitted. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  standard_price?: number;

  @IsOptional()
  @IsString()
  uom?: string;
}
