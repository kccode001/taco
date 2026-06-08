import { IsOptional, IsString, IsBooleanString, IsNumberString } from 'class-validator';
import { TaroInvoiceStatus } from '../../database/entities/taro-invoice.entity';

export class ListTaroInvoicesDto {
  @IsOptional()
  @IsString()
  status?: TaroInvoiceStatus;

  @IsOptional()
  @IsBooleanString()
  needs_review?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
