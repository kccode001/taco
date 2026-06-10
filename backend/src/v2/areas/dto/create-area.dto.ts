import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Create an Area.
 * Canonical Area shape (build plan): { id, name, code?, created_at }.
 * Final FK/table ownership is Grout's — DTO mirrors the published shape.
 */
export class CreateAreaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;
}
