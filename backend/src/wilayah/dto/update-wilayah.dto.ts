import { IsString, IsOptional, IsUUID } from 'class-validator';

export class UpdateWilayahDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  code?: string;

  @IsOptional() @IsUUID()
  parent_id?: string;
}
