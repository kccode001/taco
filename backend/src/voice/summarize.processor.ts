import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Visit } from '../database/entities/visit.entity';
import { QUEUE_VOICE_SUMMARIZE } from './voice.service';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = [
  'You are a TACO sales-visit summarizer. Input: a Bahasa Indonesia voice transcript',
  'from a TACO sales representative who just visited a hardware store. Extract a',
  'structured JSON object with FOUR sections:',
  '',
  '(1) info_kunjungan — { pic_name?, pic_role?, context_notes? }',
  '(2) data_taco — array of { sku_name, harga_beli?, harga_jual_tukang?, terjual_qty?, uom?, stok_on_hand?, promo? }',
  '(3) kompetitor — array of { brand, sku_name, harga_beli?, harga_jual_tukang?, notes? }',
  '(4) sinyal_pasar — { burning_q_answers?: object, sentimen_owner?, demand_signals?: string[], project_mentions?: string[] }',
  '',
  'Output ONLY raw JSON. No prose, no markdown fences. If a field is unknown,',
  'omit it. Currency values are integers in IDR (e.g., 150000 for "Rp 150 ribu").',
].join('\n');

@Processor(QUEUE_VOICE_SUMMARIZE)
export class SummarizeProcessor {
  private readonly logger = new Logger(SummarizeProcessor.name);
  private readonly anthropic: Anthropic;

  constructor(@InjectRepository(Visit) private readonly visitsRepo: Repository<Visit>) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  @Process('summarize')
  async handle(job: Job<{ visitId: string; transcript: string }>): Promise<void> {
    const { visitId, transcript } = job.data;
    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
      }
      if (!transcript || transcript.trim().length === 0) {
        throw new Error('Empty transcript');
      }

      const response = await this.anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: transcript }],
      });

      const block = response.content[0];
      const raw = block.type === 'text' ? block.text : '{}';
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let summary: Record<string, any>;
      try {
        summary = JSON.parse(cleaned);
      } catch {
        throw new Error(`Failed to parse summary JSON: ${cleaned.slice(0, 200)}`);
      }

      await this.visitsRepo.update(visitId, { voice_ai_summary: summary });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Voice summarize failed for visit ${visitId}: ${message}`);
      const failPayload: Record<string, any> = { error: message, stage: 'summarize' };
      await this.visitsRepo.update(visitId, { voice_ai_summary: failPayload });
    }
  }
}
