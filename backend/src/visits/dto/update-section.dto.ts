import { IsObject } from 'class-validator';

export class UpdateSectionDto {
  @IsObject()
  data: Record<string, any>;
}
