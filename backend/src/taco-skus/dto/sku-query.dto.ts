import { IsOptional, IsString } from 'class-validator';

export class SkuQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
