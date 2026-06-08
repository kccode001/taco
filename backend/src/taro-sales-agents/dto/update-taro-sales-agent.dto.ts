import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UpdateTaroSalesAgentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /**
   * When present, FULLY REPLACES the agent's region set. Must contain
   * `primary_region_id` (when also passed) or include the current primary
   * id, otherwise primary defaults to first entry.
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

  /** Legacy single-region field — back-compat. */
  @IsOptional()
  @IsUUID()
  region_id?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
