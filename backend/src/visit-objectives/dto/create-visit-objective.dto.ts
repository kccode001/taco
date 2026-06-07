import { IsString, IsOptional, IsBoolean, IsInt, MinLength } from 'class-validator';

export class CreateVisitObjectiveDto {
  @IsString() @MinLength(1)
  name: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsBoolean()
  is_active?: boolean;

  @IsOptional() @IsInt()
  sort_order?: number;
}
