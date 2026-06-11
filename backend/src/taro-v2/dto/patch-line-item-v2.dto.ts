import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Admin resolve of a v2 line item. Exactly one resolution action per call,
 * applied in precedence order by the service:
 *   confirm_as_is → matched_sku_id → brand_id → is_competitor → bukan_kompetitor → (nothing).
 *
 * `mismatch_reason` is captured when the admin overrides the system's
 * TACO/not-TACO call (fuel for the recommendation engine).
 */
export class PatchLineItemV2Dto {
  /** Map a TACO SKU. `null` clears the match. Mutually exclusive w/ competitor. */
  @IsOptional()
  @IsUUID()
  matched_sku_id?: string | null;

  /** Mark a known competitor brand. Clears any TACO match. */
  @IsOptional()
  @IsUUID()
  brand_id?: string | null;

  /** Mark competitor-but-unknown-brand (sets is_competitor, no brand_id). */
  @IsOptional()
  @IsBoolean()
  is_competitor?: boolean;

  /** "Bukan Kompetitor" — not TACO and not a competitor brand (e.g. generic
   *  product). Clears TACO match, competitor flag, and brand; resolves the line. */
  @IsOptional()
  @IsBoolean()
  bukan_kompetitor?: boolean;

  /** "Sudah benar" — keep the current match, just clear the review flag. */
  @IsOptional()
  @IsBoolean()
  confirm_as_is?: boolean;

  /** Reason the system's TACO/not-TACO call was wrong (recommendation fuel). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mismatch_reason?: string;
}
