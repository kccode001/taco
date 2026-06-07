import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import type { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import OpenAI, { toFile } from 'openai';
import { Visit } from '../database/entities/visit.entity';
import { QUEUE_VOICE_TRANSCRIBE, QUEUE_VOICE_SUMMARIZE } from './voice.service';

const WHISPER_MODEL = 'whisper-1';

@Processor(QUEUE_VOICE_TRANSCRIBE)
export class TranscribeProcessor {
  private readonly logger = new Logger(TranscribeProcessor.name);
  private readonly openai?: OpenAI;

  constructor(
    @InjectRepository(Visit) private readonly visitsRepo: Repository<Visit>,
    @InjectQueue(QUEUE_VOICE_SUMMARIZE) private readonly summarizeQueue: Queue,
  ) {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  @Process('transcribe')
  async handle(job: Job<{ visitId: string; audioPath: string }>): Promise<void> {
    const { visitId, audioPath } = job.data;
    try {
      if (!this.openai) {
        throw new Error('OPENAI_API_KEY not configured');
      }
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file missing: ${audioPath}`);
      }

      const audio = await toFile(fs.createReadStream(audioPath), audioPath.split('/').pop());
      const result = await this.openai.audio.transcriptions.create({
        file: audio,
        model: WHISPER_MODEL,
        language: 'id',
        response_format: 'text',
      });

      const transcript = typeof result === 'string' ? result : (result as any).text ?? '';
      await this.visitsRepo.update(visitId, { voice_transcript: transcript });

      await this.summarizeQueue.add('summarize', { visitId, transcript });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Voice transcribe failed for visit ${visitId}: ${message}`);
      const summary: Record<string, any> = { error: message, stage: 'transcribe' };
      await this.visitsRepo.update(visitId, { voice_ai_summary: summary });
    }
  }
}
