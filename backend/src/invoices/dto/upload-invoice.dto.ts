import { IsOptional, IsString } from 'class-validator';

export class UploadInvoiceDto {
  // Optional when used via /visits/:visitId/invoices (visitId from URL).
  @IsOptional()
  @IsString()
  visit_id?: string;

  @IsOptional()
  @IsString()
  store_id?: string;
}
