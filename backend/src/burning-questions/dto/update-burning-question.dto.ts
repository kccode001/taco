import { PartialType } from '@nestjs/mapped-types';
import { CreateBurningQuestionDto } from './create-burning-question.dto';

export class UpdateBurningQuestionDto extends PartialType(CreateBurningQuestionDto) {}
