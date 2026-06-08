import { IsOptional, IsString } from 'class-validator';

export class SkuQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  // Free-text catalog grouping from the xlsx (e.g. "Laminates", "TACO ADHESIVE").
  // Independent of the 9-cat survey enum above.
  @IsOptional()
  @IsString()
  catalog_category?: string;
}
