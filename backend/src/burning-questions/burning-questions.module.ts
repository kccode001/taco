import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BurningQuestion } from '../database/entities/burning-question.entity';
import { BurningQuestionsService } from './burning-questions.service';
import { BurningQuestionsController } from './burning-questions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BurningQuestion])],
  controllers: [BurningQuestionsController],
  providers: [BurningQuestionsService],
  exports: [BurningQuestionsService],
})
export class BurningQuestionsModule {}
