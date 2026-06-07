import { IsString, IsEnum, IsOptional, IsUUID, MinLength } from 'class-validator';
import { StoreType } from '../../database/entities/store.entity';

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(StoreType)
  type?: StoreType;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUUID()
  territory_id?: string;

  @IsOptional()
  @IsUUID()
  assigned_user_id?: string;
}
