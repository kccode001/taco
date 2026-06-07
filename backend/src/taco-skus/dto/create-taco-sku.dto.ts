import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateTacoSkuDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  category: string;

  @IsNumber()
  @Min(0)
  standard_price: number;

  @IsOptional()
  @IsString()
  uom?: string;
}
