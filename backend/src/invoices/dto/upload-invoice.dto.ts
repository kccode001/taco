import { IsString } from 'class-validator';

export class UploadInvoiceDto {
  @IsString()
  visit_id: string;

  @IsString()
  store_id: string;
}
