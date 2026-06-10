import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Body for `PATCH /api/taro-invoices/line-items/:id` — the PWA four-way resolve.
 * Exactly one resolution action per call; precedence when several are present is
 * confirm_as_is → matched_sku_id → is_unknown → brand_id (see patchLineItem).
 */
export class PatchTaroLineItemDto {
  /** Confirmed TACO match. Taro-native field name (NOT taco_sku_id). */
  @IsOptional()
  @IsUUID()
  matched_sku_id?: string | null;

  /** Competitor brand match — resolves against competitor_brands.id. */
  @IsOptional()
  @IsUUID()
  brand_id?: string | null;

  /** "Competitor but unknown brand". */
  @IsOptional()
  @IsBoolean()
  is_unknown?: boolean;

  /** "Sudah benar" — keep the current match, just clear the review flag. */
  @IsOptional()
  @IsBoolean()
  confirm_as_is?: boolean;

  /** Audit reason — required when changing matched_sku_id. */
  @IsOptional()
  @IsString()
  reason?: string;
}
