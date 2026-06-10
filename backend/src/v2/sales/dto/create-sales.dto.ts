import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Create a Sales (sales-agent roster) record.
 *
 * Matches Grout's canonical `SalesAgentV2` (`taro_v2_sales_agents`): an
 * admin-managed directory row, distinct from the auth `users` table. Optional
 * `user_id` links the roster row to the login user it represents.
 */
export class CreateSalesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** Optional home Area (canonical AreaV2 id). */
  @IsOptional()
  @IsUUID()
  area_id?: string;

  /** Optional link to the auth `users` row this agent logs in as. */
  @IsOptional()
  @IsUUID()
  user_id?: string;

  /** Active status on create. Defaults to true when omitted (Aktif). */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
