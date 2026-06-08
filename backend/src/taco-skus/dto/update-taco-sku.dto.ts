import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  Min,
  IsArray,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { TacoSkuCategory } from '../../database/entities/taco-sku.entity';

export class UpdateTacoSkuDto {
  @IsOptional() @IsString()
  code?: string;

  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsEnum(TacoSkuCategory)
  category?: TacoSkuCategory;

  /** Real catalog grouping (xlsx column 1) — "Laminates" | "Flooring" | "Hardware" | "FIDECO". */
  @IsOptional() @IsString() @MaxLength(64)
  catalog_category?: string | null;

  /** Canonical unit from catalog (e.g. PCS, M2). */
  @IsOptional() @IsString() @MaxLength(32)
  unit?: string | null;

  /** OCR / RAG synonyms for the product name. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  product_name_aliases?: string[];

  /** Synonyms for the unit (e.g. "lembar", "lbr", "panel"). */
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

  @IsOptional() @IsNumber() @Min(0)
  standard_price?: number;

  @IsOptional() @IsString()
  uom?: string;

  @IsOptional() @IsBoolean()
  is_active?: boolean;
}
