import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { TaroInvoiceSkuCorrection } from '../database/entities/taro-invoice-sku-correction.entity';
import {
  TaroInvoiceRecommendation,
  TaroRecommendationStatus,
  TaroRecommendationType,
} from '../database/entities/taro-invoice-recommendation.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';

const REC_MODEL = 'claude-sonnet-4-5';
const CORRECTION_WINDOW = 50;

interface RecommendationDraft {
  type: TaroRecommendationType;
  title: string;
  body: string;
  suggested_payload: Record<string, unknown>;
}

/**
 * Reads the last N admin corrections, asks Claude to suggest catalog improvements,
 * and persists them as `pending` cards (dismissing any older pending cards).
 *
 * Falls back to a deterministic "add_synonym from raw_text" suggestion when the
 * Anthropic key is missing — keeps the endpoint useful in local/dev environments.
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

    // Dismiss old pending cards regardless of whether new ones land.
    await this.recsRepo
      .createQueryBuilder()
      .update()
      .set({ status: TaroRecommendationStatus.DISMISSED })
      .where('status = :s', { s: TaroRecommendationStatus.PENDING })
      .execute();

    if (corrections.length === 0) {
      return [];
    }

    const drafts = this.anthropic
      ? await this.askClaude(corrections).catch((err) => {
          this.logger.error(`Claude recommendation call failed: ${err.message}`);
          return this.fallbackDrafts(corrections);
        })
      : this.fallbackDrafts(corrections);

    if (drafts.length === 0) return [];

    const rows = drafts.map((d) =>
      this.recsRepo.create({
        type: d.type,
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
  ): Promise<RecommendationDraft[]> {
    const context = corrections
      .map((c, i) => {
        const orig = c.original_sku?.name ?? '(none)';
        const corr = c.corrected_sku?.name ?? '(unknown)';
        const raw = c.line_item?.raw_text ?? '(no raw text)';
        return `${i + 1}. raw_text="${raw}" | original="${orig}" → corrected="${corr}" | reason="${c.reason}"`;
      })
      .join('\n');

    const prompt = [
      'You are improving the TACO product catalog using admin corrections from invoice OCR.',
      'Each correction shows the raw OCR row, the SKU originally suggested, the SKU the admin re-mapped to, and the typed reason.',
      'Suggest 3-7 actionable improvements. Allowed types:',
      '  - "add_synonym"  payload: { sku_id: uuid, synonym: string } — add a new product-name alias to an existing SKU.',
      '  - "create_sku"   payload: { category: string, name: string, suggested_synonyms: string[] } — when the raw text describes a product not in the catalog.',
      '  - "mapping_rule" payload: { rule_text: string } — a heuristic the OCR worker should apply (e.g. "rows starting with X always map to SKU Y").',
      'Return JSON array ONLY (no prose, no markdown fences) where each element is { type, title, body, suggested_payload }.',
      '',
      'Recent admin corrections:',
      context,
    ].join('\n');

    const response = await this.anthropic!.messages.create({
      model: REC_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    const raw = block.type === 'text' ? block.text : '[]';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned) as RecommendationDraft[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      this.logger.warn(`Failed to parse Claude recommendation JSON: ${cleaned.slice(0, 200)}`);
      return this.fallbackDrafts(corrections);
    }
  }

  /**
   * Deterministic fallback when Claude is unavailable: propose adding each
   * correction's raw_text as a synonym on the corrected SKU.
   */
  private fallbackDrafts(corrections: TaroInvoiceSkuCorrection[]): RecommendationDraft[] {
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
        title: `Add synonym to ${c.corrected_sku?.name ?? 'SKU'}`,
        body: `Admin re-mapped "${raw}" → ${c.corrected_sku?.name ?? c.corrected_sku_id}. Adding this raw text as a synonym should let the OCR match it next time.`,
        suggested_payload: { sku_id: c.corrected_sku_id, synonym: raw },
      });
      if (drafts.length >= 7) break;
    }
    return drafts;
  }
}
