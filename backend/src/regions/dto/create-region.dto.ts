import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, IsBoolean } from 'class-validator';
import { RegionType } from '../../database/entities/region.entity';

export class CreateRegionDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsEnum(RegionType)
  type: RegionType;

  @IsOptional()
  @IsUUID()
  parent_id?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
