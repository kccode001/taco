import { IsString, IsOptional, IsUUID, IsEnum, IsBoolean, MinLength } from 'class-validator';
import { PicRole } from '../../database/entities/pic.entity';

export class CreatePicDto {
  @IsOptional() @IsUUID()
  store_id?: string;

  @IsString() @MinLength(1)
  name: string;

  @IsEnum(PicRole)
  role: PicRole;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsBoolean()
  is_primary?: boolean;
}
