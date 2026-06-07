import { IsString, IsOptional, IsUUID, IsEnum, IsBoolean } from 'class-validator';
import { PicRole } from '../../database/entities/pic.entity';

export class UpdatePicDto {
  @IsOptional() @IsUUID()
  store_id?: string;

  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsEnum(PicRole)
  role?: PicRole;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsBoolean()
  is_primary?: boolean;
}
