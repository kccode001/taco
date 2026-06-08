import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateTaroSalesAgentDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  /**
   * Multi-region (m-to-m). `primary_region_id` MUST be one of these.
   *
   * Legacy `region_id` is still accepted for back-compat — when present and
   * `region_ids` is missing, the service treats it as a single primary.
   */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  region_ids?: string[];

  @IsOptional()
  @IsUUID()
  primary_region_id?: string;

  /** Legacy single-region field — accepted for back-compat. */
  @IsOptional()
  @IsUUID()
  region_id?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
