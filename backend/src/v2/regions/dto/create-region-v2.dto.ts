import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Create an AREA in the authoritative `public.regions` table (the v2 dashboard
 * Area management surface). Areas are leaf rows under a BU, so `parent_id` (a
 * `type='bu'` region) is required — it drives the hierarchy + `display_path`
 * ("Central - BU1 - ASM Cirebon"). `code` is optional; when omitted the service
 * derives a unique one from the parent code + name.
 *
 * NOTE: type is fixed to `area` by the service — this surface manages areas
 * only, never region/bu rows (those are seeded territory structure).
 */
export class CreateRegionV2Dto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  /** Parent BU (`type='bu'` region). Required — an area must hang off a BU. */
  @IsUUID()
  parent_id: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}
