import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Body for `PATCH /api/invoice-line-items/:id`.
 *
 * A single call carries ONE resolution action — the PWA fires them exclusively.
 * If more than one is present they are honoured in this precedence:
 * confirm_as_is → taco_sku_id → is_unknown → brand_id. `note` is orthogonal and
 * may accompany any action (or stand alone).
 */
export class PatchInvoiceLineItemDto {
  /**
   * "Bukan produk TACO" → competitor brand match. Sets brand_id (and brand_name
   * from the matched CompetitorBrand row), clears the TACO match and the unknown
   * flag.
   */
  @IsOptional()
  @IsUUID()
  brand_id?: string;

  /**
   * "Tidak diketahui" → competitor-but-unknown. Clears both brand and TACO match.
   */
  @IsOptional()
  @IsBoolean()
  is_unknown?: boolean;

  /**
   * Edit SKU → confirmed TACO match (existing path). Clears any competitor /
   * unknown classification and the perlu-dicek flag.
   */
  @IsOptional()
  @IsUUID()
  taco_sku_id?: string;

  /**
   * "Sudah benar" → accept the current match as-is: clear is_unclear and lock
   * confidence so the line is no longer flagged perlu dicek.
   */
  @IsOptional()
  @IsBoolean()
  confirm_as_is?: boolean;

  /** Free-text note — orthogonal to the resolution action. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
