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

// FE-facing contract — see frontend/lib/api.ts (VoiceSummaryResponse) and
// frontend/app/app/visit/[id]/voice/page.tsx. The FE polls voice-summary and
// flips the 4 overview cards green when status === 'done' and groups[].status
// === 'filled'. Keys must match GROUP_LABELS on FE: info, data_taco,
// kompetitor, sinyal.
export type FeVoiceStatus = 'pending' | 'processing' | 'done' | 'failed';
export type FeVoiceStep = 'transcript' | 'context' | 'mapping';
export type FeGroupKey = 'info' | 'data_taco' | 'kompetitor' | 'sinyal';
export type FeGroupStatus = 'filled' | 'needs_review' | 'empty';

export interface FeVoiceGroup {
  key: FeGroupKey;
  status: FeGroupStatus;
  preview: string;
}

export interface FeVoiceSummaryResponse {
  visit_id: string;
  status: FeVoiceStatus;
  step: FeVoiceStep;
  transcript: string | null;
  summary: Record<string, any> | null;
  groups: FeVoiceGroup[];
}

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

  async getSummary(visitId: string): Promise<FeVoiceSummaryResponse> {
    const visit = await this.visitsRepo.findOne({ where: { id: visitId } });
    if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);

    let internalStatus: VoiceSummaryStatus = 'idle';
    if (visit.voice_ai_summary) {
      internalStatus = visit.voice_ai_summary.error ? 'failed' : 'ready';
    } else if (visit.voice_transcript) {
      internalStatus = 'summarizing';
    } else if (visit.voice_recording_url) {
      internalStatus = 'transcribing';
    }

    const { status, step } = this.mapToFeStatus(internalStatus);
    const summary =
      visit.voice_ai_summary && !visit.voice_ai_summary.error ? visit.voice_ai_summary : null;
    const groups = this.buildGroups(summary);

    return {
      visit_id: visitId,
      status,
      step,
      transcript: visit.voice_transcript ?? null,
      summary: visit.voice_ai_summary ?? null,
      groups,
    };
  }

  private mapToFeStatus(internal: VoiceSummaryStatus): {
    status: FeVoiceStatus;
    step: FeVoiceStep;
  } {
    switch (internal) {
      case 'idle':
        return { status: 'pending', step: 'transcript' };
      case 'transcribing':
        return { status: 'processing', step: 'transcript' };
      case 'summarizing':
        return { status: 'processing', step: 'context' };
      case 'ready':
        return { status: 'done', step: 'mapping' };
      case 'failed':
        return { status: 'failed', step: 'mapping' };
      default:
        return { status: 'pending', step: 'transcript' };
    }
  }

  private buildGroups(summary: Record<string, any> | null): FeVoiceGroup[] {
    // FE keys (info, data_taco, kompetitor, sinyal) ← AI summary keys
    // (info_kunjungan, data_taco, kompetitor, sinyal_pasar). Keep both
    // in sync with summarize.processor.ts SYSTEM_PROMPT.
    const map: Array<{
      key: FeGroupKey;
      src: 'info_kunjungan' | 'data_taco' | 'kompetitor' | 'sinyal_pasar';
    }> = [
      { key: 'info', src: 'info_kunjungan' },
      { key: 'data_taco', src: 'data_taco' },
      { key: 'kompetitor', src: 'kompetitor' },
      { key: 'sinyal', src: 'sinyal_pasar' },
    ];

    return map.map(({ key, src }) => {
      const block = summary?.[src];
      const preview = this.previewFor(src, block);
      const filled = this.hasContent(block);
      return {
        key,
        status: filled ? 'filled' : 'empty',
        preview: filled ? preview : 'Belum ada data',
      };
    });
  }

  private hasContent(block: unknown): boolean {
    if (block == null) return false;
    if (Array.isArray(block)) return block.length > 0;
    if (typeof block === 'object') {
      const obj = block as Record<string, any>;
      return Object.values(obj).some(
        (v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0),
      );
    }
    return Boolean(block);
  }

  private previewFor(
    src: 'info_kunjungan' | 'data_taco' | 'kompetitor' | 'sinyal_pasar',
    block: any,
  ): string {
    if (!this.hasContent(block)) return 'Belum ada data';
    try {
      switch (src) {
        case 'info_kunjungan': {
          const pic = block.pic_name ? `${block.pic_name}` : null;
          const role = block.pic_role ? ` (${block.pic_role})` : '';
          const ctx = block.context_notes ? block.context_notes : '';
          const head = pic ? `Bertemu ${pic}${role}` : 'PIC tidak disebut';
          const joined = ctx ? `${head}, ${ctx}` : head;
          return this.truncate(joined, 80);
        }
        case 'data_taco': {
          const arr: any[] = Array.isArray(block) ? block : [];
          if (arr.length === 0) return 'Belum ada data';
          const first = arr[0];
          const name = first?.sku_name ?? 'SKU';
          const extra = arr.length > 1 ? ` +${arr.length - 1} SKU lain` : '';
          const price = first?.harga_jual_tukang
            ? ` (Rp${this.formatIdr(first.harga_jual_tukang)})`
            : '';
          return this.truncate(`${name}${price}${extra}`, 80);
        }
        case 'kompetitor': {
          const arr: any[] = Array.isArray(block) ? block : [];
          if (arr.length === 0) return 'Belum ada data';
          const brands = Array.from(
            new Set(arr.map((c) => c?.brand).filter(Boolean)),
          );
          const head = brands.length ? brands.slice(0, 2).join(', ') : 'Kompetitor';
          const more = brands.length > 2 ? ` +${brands.length - 2} brand` : '';
          return this.truncate(`${head}${more} (${arr.length} SKU)`, 80);
        }
        case 'sinyal_pasar': {
          if (block.sentimen_owner) {
            return this.truncate(`Sentimen owner: ${block.sentimen_owner}`, 80);
          }
          const demand: string[] = Array.isArray(block.demand_signals)
            ? block.demand_signals
            : [];
          if (demand.length) return this.truncate(demand[0], 80);
          const projects: string[] = Array.isArray(block.project_mentions)
            ? block.project_mentions
            : [];
          if (projects.length) return this.truncate(`Proyek: ${projects[0]}`, 80);
          const bq = block.burning_q_answers;
          if (bq && typeof bq === 'object') {
            const firstKey = Object.keys(bq)[0];
            if (firstKey) {
              return this.truncate(`${firstKey}: ${String(bq[firstKey])}`, 80);
            }
          }
          return 'Sinyal pasar terdeteksi';
        }
      }
    } catch {
      // fall through
    }
    return 'Data tersedia';
  }

  private truncate(s: string, max: number): string {
    if (!s) return '';
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
  }

  private formatIdr(n: number): string {
    if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
    return n.toLocaleString('id-ID');
  }

  private safeName(name: string): string {
    return name.replace(/[^\w.\-]+/g, '_');
  }
}
