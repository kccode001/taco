import { PartialType } from '@nestjs/mapped-types';
import { CreateVisitContextDto } from './create-visit-context.dto';

export class UpdateVisitContextDto extends PartialType(CreateVisitContextDto) {}
