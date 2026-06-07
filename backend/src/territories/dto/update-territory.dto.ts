import { IsString, IsOptional, IsUUID, MinLength } from 'class-validator';

export class UpdateTerritoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;
}
