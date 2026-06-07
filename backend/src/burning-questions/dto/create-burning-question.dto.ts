import { IsString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { BurningQuestionScope } from '../../database/entities/burning-question.entity';

export class CreateBurningQuestionDto {
  @IsString()
  text: string;

  @IsEnum(BurningQuestionScope)
  scope: BurningQuestionScope;

  @IsOptional()
  @IsUUID()
  territory_id?: string;

  @IsOptional()
  @IsUUID()
  store_id?: string;
}
