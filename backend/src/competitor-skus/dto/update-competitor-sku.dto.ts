import { PartialType } from '@nestjs/mapped-types';
import { CreateCompetitorSkuDto } from './create-competitor-sku.dto';

export class UpdateCompetitorSkuDto extends PartialType(CreateCompetitorSkuDto) {}
