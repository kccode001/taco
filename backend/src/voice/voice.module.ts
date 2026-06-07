import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Visit } from '../database/entities/visit.entity';
import {
  VoiceService,
  QUEUE_VOICE_TRANSCRIBE,
  QUEUE_VOICE_SUMMARIZE,
} from './voice.service';
import { VoiceController } from './voice.controller';
import { TranscribeProcessor } from './transcribe.processor';
import { SummarizeProcessor } from './summarize.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Visit]),
    BullModule.registerQueue(
      { name: QUEUE_VOICE_TRANSCRIBE },
      { name: QUEUE_VOICE_SUMMARIZE },
    ),
    MulterModule.register({ storage: memoryStorage() }),
  ],
  providers: [VoiceService, TranscribeProcessor, SummarizeProcessor],
  controllers: [VoiceController],
  exports: [VoiceService],
})
export class VoiceModule {}
