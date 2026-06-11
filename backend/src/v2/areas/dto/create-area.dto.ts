import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Create an Area in the authoritative `public.regions` table (type='area').
 * `parent_id` should be a BU row — when provided the area is placed under that
 * BU and its display_path is built accordingly. When omitted the area is created
 * as a top-level standalone entry.
 */
export class CreateAreaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;
}
