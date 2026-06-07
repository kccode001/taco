import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';

export class UpdateVisitObjectiveDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsBoolean()
  is_active?: boolean;

  @IsOptional() @IsInt()
  sort_order?: number;
}
