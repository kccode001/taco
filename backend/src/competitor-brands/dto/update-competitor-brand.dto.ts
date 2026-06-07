import { PartialType } from '@nestjs/mapped-types';
import { CreateCompetitorBrandDto } from './create-competitor-brand.dto';

export class UpdateCompetitorBrandDto extends PartialType(CreateCompetitorBrandDto) {}
