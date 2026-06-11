import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCompetitorBrandDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  country?: string;
}
