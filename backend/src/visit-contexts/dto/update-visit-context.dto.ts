import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';

export class UpdateVisitContextDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsBoolean()
  is_active?: boolean;

  @IsOptional() @IsInt()
  sort_order?: number;
}
