import { IsString, IsUUID } from 'class-validator';

export class RefreshDto {
  @IsString()
  refresh_token: string;

  @IsUUID()
  user_id: string;
}
