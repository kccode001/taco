import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One group in a batch commit = one future invoice. Carries an Area + a Store
 * (existing `store_id` OR free-typed `store_name`) plus the staged photo ids that
 * were grouped under this (area, store) on the review screen.
 */
export class BatchInvoiceGroupDto {
  @IsUUID()
  area_id: string;

  /** Existing store. Provide this OR `store_name`. */
  @IsOptional()
  @IsUUID()
  store_id?: string;

  /** Free-typed store name — persisted under `area_id` when no `store_id`. */
  @ValidateIf((o: BatchInvoiceGroupDto) => !o.store_id)
  @IsString()
  @IsNotEmpty({ message: 'store_id or store_name is required' })
  @MaxLength(300)
  store_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /**
   * Staged photo ids (from `POST /api/v2/invoices/detect`) grouped under this
   * (area, store). All are adopted onto the one invoice — no re-upload, no second
   * vision call.
   */
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  staged_image_ids: string[];
}

/**
 * Batch commit for photo-first BATCH upload: the rep's reviewed groups, one
 * request → one invoice per group. Reduces FE round-trips vs looping
 * `POST /api/v2/invoices` per group. Results are returned per group (aligned by
 * index) so a single bad group never loses the others.
 */
export class BatchCreateInvoicesV2Dto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BatchInvoiceGroupDto)
  groups: BatchInvoiceGroupDto[];

  /**
   * When true, each successfully-created invoice is immediately enqueued for OCR
   * (same as `POST /api/v2/invoices/:id/process`) so the whole batch commits in
   * one call. Defaults to false (FE drives `process` itself).
   */
  @IsOptional()
  @IsBoolean()
  process?: boolean;
}
