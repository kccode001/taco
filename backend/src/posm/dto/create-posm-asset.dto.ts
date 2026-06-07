import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreatePosmAssetDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
