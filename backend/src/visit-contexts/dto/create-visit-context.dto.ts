import { IsString, IsOptional, IsBoolean, IsInt, MinLength } from 'class-validator';

export class CreateVisitContextDto {
  @IsString() @MinLength(1)
  name: string;

  @IsOptional() @IsBoolean()
  is_active?: boolean;

  @IsOptional() @IsInt()
  sort_order?: number;
}
