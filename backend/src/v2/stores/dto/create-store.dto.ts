import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Create a Store.
 * Canonical shape (build plan): { id, area_id FK, name, created_at, created_by }.
 * NOTE: the PWA upload "free-type-new-store" flow also writes here for future
 * selection — so create must be callable by the upload path, not just admin.
 */
export class CreateStoreDto {
  @IsUUID()
  area_id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;
}
