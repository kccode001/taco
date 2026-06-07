import { PartialType } from '@nestjs/mapped-types';
import { CreateVisitObjectiveDto } from './create-visit-objective.dto';

export class UpdateVisitObjectiveDto extends PartialType(CreateVisitObjectiveDto) {}
