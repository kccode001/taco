import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetTaroSalesAgentPasswordDto {
  /**
   * If omitted, the service generates a random 12-char password and returns it
   * in the response so the admin can hand it to the agent over a side channel.
   */
  @IsOptional()
  @IsString()
  @MinLength(6)
  new_password?: string;
}
