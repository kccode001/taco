import { IsOptional, IsUUID, IsEnum, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { StoreType } from '../../database/entities/store.entity';

export class StoreQueryDto {
  @IsOptional()
  @IsUUID()
  territory_id?: string;

  @IsOptional()
  @IsEnum(StoreType)
  type?: StoreType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
