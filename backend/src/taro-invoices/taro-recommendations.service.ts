import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { TaroInvoiceSkuCorrection } from '../database/entities/taro-invoice-sku-correction.entity';
import {
  TaroInvoiceRecommendation,
  TaroRecommendationSource,
  TaroRecommendationStatus,
  TaroRecommendationType,
} from '../database/entities/taro-invoice-recommendation.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { TaroInvoicesService } from './taro-invoices.service';

const REC_MODEL = 'claude-sonnet-4-5';
const CORRECTION_WINDOW = 50;
const FAILED_OCR_WINDOW = 30;

interface RecommendationDraft {
  type: TaroRecommendationType;
  source: TaroRecommendationSource;
  title: string;
  body: string;
  suggested_payload: Record<string, unknown>;
}

interface FailedOcrSnippet {
  raw_text: string;
  occurrence_count: number;
  closest_sku_candidate: {
    id: string;
    code: string;
    name: string;
    similarity: number;
  } | null;
}

/**
 * Recommendation engine 2.0.
 *
 * Reads BOTH the last N admin corrections AND the top-M most-frequent failed
 * OCR raw_texts, hands them to Claude in one prompt, persists the cards as
 * pending (with `source` so the FE can badge by dataset).
 *
 * Fallback (no Anthropic key): deterministic "add_synonym from corrections"
 * + "investigate_competitor from frequent failed OCR" so the endpoint stays
 * useful in dev.
 */
@Injectable()
export class TaroRecommendationsService {
  private readonly logger = new Logger(TaroRecommendationsService.name);
  private readonly anthropic: Anthropic | null;

  constructor(
    @InjectRepository(TaroInvoiceSkuCorrection)
    private readonly correctionsRepo: Repository<TaroInvoiceSkuCorrection>,
    @InjectRepository(TaroInvoiceRecommendation)
    private readonly recsRepo: Repository<TaroInvoiceRecommendation>,
    @InjectRepository(TacoSku)
    private readonly skusRepo: Repository<TacoSku>,
    @Inject(forwardRef(() => TaroInvoicesService))
    private readonly invoices: TaroInvoicesService,
  ) {
    this.anthropic = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
  }

  async regenerate(): Promise<TaroInvoiceRecommendation[]> {
    const corrections = await this.correctionsRepo.find({
      order: { corrected_at: 'DESC' },
      take: CORRECTION_WINDOW,
      relations: { original_sku: true, corrected_sku: true, line_item: true },
    });

    const failedOcr = await this.invoices.topFailedOcrForRecommendations(
      FAILED_OCR_WINDOW,
    );

    // Dismiss old pending cards regardless of whether new ones land.
    await this.recsRepo
      .createQueryBuilder()
      .update()
      .set({ status: TaroRecommendationStatus.DISMISSED })
      .where('status = :s', { s: TaroRecommendationStatus.PENDING })
      .execute();

    if (corrections.length === 0 && failedOcr.length === 0) {
      return [];
    }

    const drafts = this.anthropic
      ? await this.askClaude(corrections, failedOcr).catch((err) => {
          this.logger.error(`Claude recommendation call failed: ${err.message}`);
          return this.fallbackDrafts(corrections, failedOcr);
        })
      : this.fallbackDrafts(corrections, failedOcr);

    if (drafts.length === 0) return [];

    const rows = drafts.map((d) =>
      this.recsRepo.create({
        type: d.type,
        source: d.source,
        title: d.title,
        body: d.body,
        suggested_payload: d.suggested_payload,
        status: TaroRecommendationStatus.PENDING,
      }),
    );
    return this.recsRepo.save(rows);
  }

  private async askClaude(
    corrections: TaroInvoiceSkuCorrection[],
    failedOcr: FailedOcrSnippet[],
  ): Promise<RecommendationDraft[]> {
    const correctionLines = corrections
      .map((c, i) => {
        const orig = c.original_sku?.name ?? '(none)';
        const corr = c.corrected_sku?.name ?? '(unknown)';
        const raw = c.line_item?.raw_text ?? '(no raw text)';
        return `${i + 1}. raw_text="${raw}" | original="${orig}" → corrected="${corr}" | reason="${c.reason}"`;
      })
      .join('\n');

    const failedLines = failedOcr
      .map((f, i) => {
        if (f.closest_sku_candidate) {
          return `${i + 1}. "${f.raw_text}" appeared ${f.occurrence_count} times. Closest TACO SKU candidate: ${f.closest_sku_candidate.code} ${f.closest_sku_candidate.name} @ similarity ${f.closest_sku_candidate.similarity.toFixed(2)}.`;
        }
        return `${i + 1}. "${f.raw_text}" appeared ${f.occurrence_count} times. NO close TACO SKU.`;
      })
      .join('\n');

    const prompt = [
      'You are improving the TACO product catalog using two signals: admin corrections AND frequently failed OCR rows.',
      '',
      'Allowed types + when to use each:',
      '  - "add_synonym"           payload: { sku_id: uuid, synonym: string }',
      '       Use when a failed OCR row is clearly a TACO product (similarity > 0.65) — add raw_text as a synonym.',
      '  - "create_sku"            payload: { category: string, name: string, suggested_synonyms: string[] }',
      '       Use when a failed OCR row is unfamiliar AND recurring (occurrence >= 3, no close TACO match).',
      '  - "update_sku_knowledge"  payload: { sku_id: uuid, change_summary: string }',
      '       Use when admin corrections show systematic mis-mapping — update synonym/name.',
      '  - "mapping_rule"          payload: { rule_text: string }',
      '       General heuristic the OCR worker should apply.',
      '  - "investigate_competitor" payload: { raw_text: string, note: string }',
      '       Use when failed OCR is recurring + has NO TACO similarity (< 0.5) — likely a competitor product.',
      '',
      'For each draft also output:',
      '  - "source": "correction" OR "failed_ocr" — which dataset triggered it.',
      '',
      'Return JSON array ONLY (no prose, no markdown fences). Each element:',
      '{ "type", "source", "title", "body", "suggested_payload" }. 4-10 recommendations.',
      '',
      'ADMIN CORRECTIONS (latest ' + corrections.length + '):',
      correctionLines || '(none)',
      '',
      'FREQUENTLY FAILED OCR (top ' + failedOcr.length + ' by occurrence):',
      failedLines || '(none)',
    ].join('\n');

    const response = await this.anthropic!.messages.create({
      model: REC_MODEL,
      max_tokens: 3072,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    const raw = block.type === 'text' ? block.text : '[]';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) return [];
      const validTypes = new Set(Object.values(TaroRecommendationType));
      const validSources = new Set(Object.values(TaroRecommendationSource));
      const drafts: RecommendationDraft[] = [];
      for (const p of parsed) {
        const type = String(p.type ?? '') as TaroRecommendationType;
        const source = String(p.source ?? 'correction') as TaroRecommendationSource;
        if (!validTypes.has(type)) continue;
        const safeSource = validSources.has(source)
          ? source
          : TaroRecommendationSource.CORRECTION;
        drafts.push({
          type,
          source: safeSource,
          title: String(p.title ?? '(untitled)'),
          body: String(p.body ?? ''),
          suggested_payload:
            (p.suggested_payload as Record<string, unknown>) ?? {},
        });
      }
      return drafts;
    } catch (err) {
      this.logger.warn(`Failed to parse Claude recommendation JSON: ${cleaned.slice(0, 200)}`);
      return this.fallbackDrafts(corrections, failedOcr);
    }
  }

  /**
   * Deterministic fallback when Claude is unavailable:
   *   - From corrections: propose "add_synonym" on the corrected SKU.
   *   - From failed OCR: propose "add_synonym" when close match exists,
   *     "investigate_competitor" when no close match + recurring.
   */
  private fallbackDrafts(
    corrections: TaroInvoiceSkuCorrection[],
    failedOcr: FailedOcrSnippet[],
  ): RecommendationDraft[] {
    const seen = new Set<string>();
    const drafts: RecommendationDraft[] = [];
    for (const c of corrections) {
      const raw = c.line_item?.raw_text?.trim();
      if (!raw || !c.corrected_sku_id) continue;
      const key = `${c.corrected_sku_id}::${raw.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      drafts.push({
        type: TaroRecommendationType.ADD_SYNONYM,
        source: TaroRecommendationSource.CORRECTION,
        title: `Add synonym to ${c.corrected_sku?.name ?? 'SKU'}`,
        body: `Admin re-mapped "${raw}" → ${c.corrected_sku?.name ?? c.corrected_sku_id}. Adding this raw text as a synonym should let the OCR match it next time.`,
        suggested_payload: { sku_id: c.corrected_sku_id, synonym: raw },
      });
      if (drafts.length >= 5) break;
    }

    for (const f of failedOcr) {
      if (f.closest_sku_candidate && f.closest_sku_candidate.similarity >= 0.65) {
        drafts.push({
          type: TaroRecommendationType.ADD_SYNONYM,
          source: TaroRecommendationSource.FAILED_OCR,
          title: `Add synonym to ${f.closest_sku_candidate.name}`,
          body: `"${f.raw_text}" appeared ${f.occurrence_count} times on invoices. Closest TACO SKU is ${f.closest_sku_candidate.code} ${f.closest_sku_candidate.name} at similarity ${f.closest_sku_candidate.similarity.toFixed(2)}. Adding it as a synonym should resolve future OCR rows.`,
          suggested_payload: {
            sku_id: f.closest_sku_candidate.id,
            synonym: f.raw_text,
          },
        });
      } else if (f.occurrence_count >= 3) {
        drafts.push({
          type: TaroRecommendationType.INVESTIGATE_COMPETITOR,
          source: TaroRecommendationSource.FAILED_OCR,
          title: `Investigate "${f.raw_text}"`,
          body: `"${f.raw_text}" appeared ${f.occurrence_count} times with no close TACO SKU match (best similarity ${(f.closest_sku_candidate?.similarity ?? 0).toFixed(2)}). Likely a competitor product — flag for the product team.`,
          suggested_payload: {
            raw_text: f.raw_text,
            note: `Occurrence: ${f.occurrence_count}. No TACO match >= 0.65.`,
          },
        });
      }
      if (drafts.length >= 10) break;
    }
    return drafts;
  }
}
