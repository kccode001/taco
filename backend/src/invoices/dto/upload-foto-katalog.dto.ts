import { IsOptional, IsString } from 'class-validator';

export class UploadFotoKatalogDto {
  @IsOptional()
  @IsString()
  store_id?: string;
}
