import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateVisitContextDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
