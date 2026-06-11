import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Update an area row in `public.regions`. All fields optional (partial patch).
 * `active` toggles soft-delete state (false = deactivated, true = reactivated).
 * `parent_id` re-parents the area under a different BU (recomputes display_path).
 */
export class UpdateRegionV2Dto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
