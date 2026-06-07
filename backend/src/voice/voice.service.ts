import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import { Visit, VisitSubmissionMethod } from '../database/entities/visit.entity';

export const QUEUE_VOICE_TRANSCRIBE = 'voice.transcribe';
export const QUEUE_VOICE_SUMMARIZE = 'voice.summarize-visit';

export type VoiceSummaryStatus = 'idle' | 'transcribing' | 'summarizing' | 'ready' | 'failed';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly voiceDir = path.join(
    process.cwd(),
    process.env.UPLOAD_DIR ?? 'uploads',
    'voice',
  );

  constructor(
    @InjectRepository(Visit) private readonly visitsRepo: Repository<Visit>,
    @InjectQueue(QUEUE_VOICE_TRANSCRIBE) private readonly transcribeQueue: Queue,
    @InjectQueue(QUEUE_VOICE_SUMMARIZE) private readonly summarizeQueue: Queue,
  ) {
    fs.mkdirSync(this.voiceDir, { recursive: true });
  }

  async uploadRecording(
    visitId: string,
    file: Express.Multer.File,
  ): Promise<{ visit_id: string; job_id: string | number; status: VoiceSummaryStatus }> {
    if (!file) throw new BadRequestException('audio file is required');

    const visit = await this.visitsRepo.findOne({ where: { id: visitId } });
    if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);

    const filename = `${visitId}-${Date.now()}-${this.safeName(file.originalname)}`;
    const filePath = path.join(this.voiceDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    await this.visitsRepo
      .createQueryBuilder()
      .update(Visit)
      .set({
        voice_recording_url: filePath,
        voice_transcript: () => 'NULL',
        voice_ai_summary: () => 'NULL',
        submission_method: VisitSubmissionMethod.VOICE_FIRST,
      })
      .where('id = :id', { id: visitId })
      .execute();

    const job = await this.transcribeQueue.add('transcribe', {
      visitId,
      audioPath: filePath,
    });

    return { visit_id: visitId, job_id: job.id, status: 'transcribing' };
  }

  async getSummary(visitId: string): Promise<{
    visit_id: string;
    status: VoiceSummaryStatus;
    transcript: string | null;
    summary: Record<string, any> | null;
  }> {
    const visit = await this.visitsRepo.findOne({ where: { id: visitId } });
    if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);

    let status: VoiceSummaryStatus = 'idle';
    if (visit.voice_ai_summary) {
      status = visit.voice_ai_summary.error ? 'failed' : 'ready';
    } else if (visit.voice_transcript) {
      status = 'summarizing';
    } else if (visit.voice_recording_url) {
      status = 'transcribing';
    }

    return {
      visit_id: visitId,
      status,
      transcript: visit.voice_transcript ?? null,
      summary: visit.voice_ai_summary ?? null,
    };
  }

  private safeName(name: string): string {
    return name.replace(/[^\w.\-]+/g, '_');
  }
}
