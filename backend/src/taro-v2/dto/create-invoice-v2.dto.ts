import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Create a v2 invoice at upload step-1. Carries an Area + a Store. The store is
 * EITHER an existing `store_id` OR a free-typed `store_name` (saved to the
 * store master for future selection) — at least one is required.
 */
export class CreateInvoiceV2Dto {
  @IsUUID()
  area_id: string;

  /** Existing store. Provide this OR `store_name`. */
  @IsOptional()
  @IsUUID()
  store_id?: string;

  /** Free-typed new store name — persisted under `area_id` when no `store_id`. */
  @ValidateIf((o: CreateInvoiceV2Dto) => !o.store_id)
  @IsString()
  @IsNotEmpty({ message: 'store_id or store_name is required' })
  @MaxLength(300)
  store_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /**
   * Photo-first flow: ids returned by `POST /api/v2/invoices/detect`. The already
   * uploaded + validated photo(s) are adopted onto this invoice (no re-upload, no
   * re-validation). Omit for the classic pick-area-then-upload flow.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  staged_image_ids?: string[];
}
