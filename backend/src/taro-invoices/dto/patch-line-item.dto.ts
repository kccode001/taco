import { IsOptional, IsString, IsUUID } from 'class-validator';

export class PatchTaroLineItemDto {
  @IsOptional()
  @IsUUID()
  matched_sku_id?: string | null;

  @IsOptional()
  @IsString()
  reason?: string;
}
