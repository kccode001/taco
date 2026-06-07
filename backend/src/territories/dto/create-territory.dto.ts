import { IsString, IsOptional, IsUUID, MinLength } from 'class-validator';

export class CreateTerritoryDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  code: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;
}
