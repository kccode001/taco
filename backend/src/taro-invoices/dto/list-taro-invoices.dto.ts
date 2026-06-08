import { IsOptional, IsString, IsBooleanString, IsNumberString, IsUUID } from 'class-validator';
import { TaroInvoiceStatus } from '../../database/entities/taro-invoice.entity';

export class ListTaroInvoicesDto {
  @IsOptional()
  @IsString()
  status?: TaroInvoiceStatus;

  @IsOptional()
  @IsBooleanString()
  needs_review?: string;

  @IsOptional()
  @IsUUID()
  region_id?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
