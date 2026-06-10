import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';

import {
  RecommendationV2,
  RecommendationV2ActionType,
  RecommendationV2Status,
} from '../../database/entities/v2/recommendation-v2.entity';
import { InvoiceLineItemV2 } from '../../database/entities/v2/invoice-line-item-v2.entity';
import { TacoSku } from '../../database/entities/taco-sku.entity';
import { ListRecommendationsDto } from './dto/list-recommendations.dto';

/** Sonnet — reason → structured recommendation derivation. */
const REC_MODEL = 'claude-sonnet-4-6';

/** Max new reasons turned into recommendations per generation pass. */
const GENERATE_CAP = 50;

/** Shape the LLM is asked to return per mismatch reason. */
interface DerivedRec {
  line_item_id: string;
  kind: string;
  title: string;
  detail: string;
  auto_actionable: boolean;
  action_type: 'add_synonym' | 'create_sku' | null;
  synonym?: string | null;
  sku_code?: string | null;
  sku_name?: string | null;
}

/**
 * v2 MANAGEMENT — reason-derived Recommendation engine.
 *
 * Mines the `mismatch_reason` an admin captured on the v2 resolve flow (Grout's
 * PATCH line-items writes it when the system's TACO/not-TACO call was wrong) and
 * turns each into a sensible suggested action via Sonnet. Every recommendation
 * is tagged `auto_actionable`:
 *   true  → the system can mechanically apply it (add a SKU synonym / create a
 *           catalog SKU) → FE shows "Terapkan".
 *   false → acknowledge-only ("Akui").
 *
 * The auto-action itself is VALIDATED + executed server-side (the LLM never
 * decides the SKU id) so `apply` is safe regardless of model output:
 *   - add_synonym: appends the failed raw text as an alias of the SKU the admin
 *                  actually mapped the line to (authoritative `matched_sku_id`).
 *   - create_sku:  creates a minimal TacoSku from an LLM-proposed code + name.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private readonly anthropic: Anthropic | null;

  constructor(
    @InjectRepository(RecommendationV2)
    private readonly recs: Repository<RecommendationV2>,
    @InjectRepository(InvoiceLineItemV2)
    private readonly lineItems: Repository<InvoiceLineItemV2>,
    @InjectRepository(TacoSku)
    private readonly skus: Repository<TacoSku>,
  ) {
    this.anthropic = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
  }

  // ---- list ----------------------------------------------------------------

  /**
   * List recommendations. Lazily derives recs for any newly-captured mismatch
   * reasons first (cheap no-op when there are none), so the FE just calls GET.
   */
  async list(query: ListRecommendationsDto) {
    await this.generate();

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.auto_actionable !== undefined) {
      where.auto_actionable = query.auto_actionable === 'true';
    }
    if (query.area) where.area_id = query.area;

    const items = await this.recs.find({
      where,
      order: { created_at: 'DESC' },
    });
    return {
      count: items.length,
      generated_from: 'line_item.mismatch_reason',
      items,
    };
  }

  // ---- generate ------------------------------------------------------------

  /**
   * Scan line items carrying a mismatch_reason not yet turned into a
   * recommendation and derive one per line. Idempotent (unique source line).
   */
  async generate(): Promise<{ created: number; skipped: number }> {
    const existing = await this.recs.find({
      where: { source_line_item_id: Not(IsNull()) },
      select: { source_line_item_id: true },
    });
    const seen = new Set(existing.map((r) => r.source_line_item_id));

    const candidates = await this.lineItems
      .createQueryBuilder('li')
      .innerJoinAndSelect('li.invoice', 'inv')
      .leftJoinAndSelect('li.matched_sku', 'sku')
      .where('li.mismatch_reason IS NOT NULL')
      .andWhere("btrim(li.mismatch_reason) <> ''")
      .orderBy('li.updated_at', 'DESC')
      .limit(GENERATE_CAP + seen.size)
      .getMany();

    const fresh = candidates
      .filter((li) => !seen.has(li.id))
      .slice(0, GENERATE_CAP);
    if (fresh.length === 0) return { created: 0, skipped: 0 };

    const derived = await this.deriveBatch(fresh);
    const byId = new Map(derived.map((d) => [d.line_item_id, d]));

    const rows: RecommendationV2[] = [];
    let skipped = 0;
    for (const li of fresh) {
      const d = byId.get(li.id) ?? this.ruleFallback(li);
      const built = this.buildEntity(li, d);
      if (built) rows.push(built);
      else skipped++;
    }

    if (rows.length) await this.recs.save(rows);
    return { created: rows.length, skipped };
  }

  /**
   * Turn an LLM-derived suggestion into a validated entity. The auto-action is
   * only honored when its preconditions actually hold server-side.
   */
  private buildEntity(
    li: InvoiceLineItemV2,
    d: DerivedRec,
  ): RecommendationV2 | null {
    const reason = (li.mismatch_reason ?? '').trim();
    if (!reason) return null;

    let auto = false;
    let actionType: RecommendationV2ActionType | null = null;
    let payload: Record<string, unknown> | null = null;

    if (d.action_type === 'add_synonym' && li.matched_sku_id) {
      const synonym = (d.synonym?.trim() || li.raw_text?.trim() || '').trim();
      if (synonym) {
        auto = true;
        actionType = RecommendationV2ActionType.ADD_SYNONYM;
        payload = { sku_id: li.matched_sku_id, synonym };
      }
    } else if (d.action_type === 'create_sku') {
      const name = d.sku_name?.trim() || li.raw_text?.trim() || '';
      const code = d.sku_code?.trim() || '';
      if (name && code) {
        auto = true;
        actionType = RecommendationV2ActionType.CREATE_SKU;
        payload = { code, name };
      }
    }

    return this.recs.create({
      source_line_item_id: li.id,
      area_id: li.invoice?.area_id ?? null,
      source_reason: reason,
      kind: d.kind || (auto ? actionType! : 'review'),
      title: d.title?.trim() || this.defaultTitle(li, auto),
      detail: d.detail?.trim() || reason,
      auto_actionable: auto,
      action_type: actionType,
      action_payload: payload,
      status: RecommendationV2Status.PENDING,
    });
  }

  private defaultTitle(li: InvoiceLineItemV2, auto: boolean): string {
    const txt = li.raw_text?.trim() || 'item';
    return auto
      ? `Tambahkan sinonim untuk "${txt}"`
      : `Tinjau klasifikasi "${txt}"`;
  }

  /** Deterministic derivation when the LLM is unavailable / fails. */
  private ruleFallback(li: InvoiceLineItemV2): DerivedRec {
    const reason = (li.mismatch_reason ?? '').trim();
    // If the admin mapped the line to a real SKU, the raw text is a synonym the
    // matcher missed — that's a concrete, auto-actionable fix.
    if (li.matched_sku_id && li.raw_text?.trim()) {
      return {
        line_item_id: li.id,
        kind: 'add_synonym',
        title: `Tambahkan sinonim "${li.raw_text.trim()}"`,
        detail: `Sistem salah mengklasifikasi tetapi admin memetakan ke SKU ini. Alasan: ${reason}`,
        auto_actionable: true,
        action_type: 'add_synonym',
        synonym: li.raw_text.trim(),
      };
    }
    return {
      line_item_id: li.id,
      kind: 'review',
      title: `Tinjau: ${li.raw_text?.trim() || 'item tidak terbaca'}`,
      detail: reason,
      auto_actionable: false,
      action_type: null,
    };
  }

  /** One Sonnet call deriving structured recommendations for a batch of lines. */
  private async deriveBatch(lines: InvoiceLineItemV2[]): Promise<DerivedRec[]> {
    if (!this.anthropic) return lines.map((li) => this.ruleFallback(li));

    const payload = lines.map((li) => ({
      line_item_id: li.id,
      raw_text: li.raw_text,
      classification: li.classification,
      is_competitor: li.is_competitor,
      mismatch_reason: li.mismatch_reason,
      mapped_to_taco_sku: li.matched_sku
        ? {
            id: li.matched_sku.id,
            code: li.matched_sku.code,
            name: li.matched_sku.name,
          }
        : null,
    }));

    try {
      const response = await this.anthropic.messages.create({
        model: REC_MODEL,
        max_tokens: 2000,
        system:
          'Anda mesin rekomendasi katalog untuk TACO. Input: daftar baris invoice di mana sistem salah ' +
          'mengklasifikasi TACO/non-TACO dan admin mencatat alasan (mismatch_reason). ' +
          'Untuk setiap baris, usulkan SATU tindakan yang masuk akal. Hanya dua jenis yang bisa dieksekusi otomatis: ' +
          '"add_synonym" (jika baris sudah dipetakan ke SKU TACO / mapped_to_taco_sku != null, dan teks mentah adalah ejaan/sinonim yang gagal dikenali) ' +
          'dan "create_sku" (jika ini jelas produk TACO yang belum ada di katalog — sediakan sku_code & sku_name singkat). ' +
          'Selain itu set auto_actionable=false dan action_type=null (mis. butuh pelatihan tim, kualitas foto, atau perlu tinjauan manusia). ' +
          'Title & detail dalam Bahasa Indonesia, ringkas. Jangan mengarang SKU id. ' +
          'Balas HANYA JSON array valid, tiap elemen: ' +
          '{"line_item_id","kind","title","detail","auto_actionable","action_type","synonym","sku_code","sku_name"}. ' +
          'Gunakan null untuk field yang tidak relevan.',
        messages: [
          {
            role: 'user',
            content: JSON.stringify(payload),
          },
        ],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      const parsed = this.extractJsonArray(text);
      if (!parsed) return lines.map((li) => this.ruleFallback(li));

      // Backfill any line the model dropped with the rule fallback.
      const got = new Set(parsed.map((d) => d.line_item_id));
      const missing = lines
        .filter((li) => !got.has(li.id))
        .map((li) => this.ruleFallback(li));
      return [...parsed, ...missing];
    } catch (err) {
      this.logger.error(`Recommendation derivation failed: ${String(err)}`);
      return lines.map((li) => this.ruleFallback(li));
    }
  }

  private extractJsonArray(text: string): DerivedRec[] | null {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (!Array.isArray(arr)) return null;
      return arr.filter(
        (d): d is DerivedRec =>
          !!d &&
          typeof d === 'object' &&
          typeof (d as DerivedRec).line_item_id === 'string',
      );
    } catch {
      return null;
    }
  }

  // ---- apply / acknowledge -------------------------------------------------

  private async load(id: string): Promise<RecommendationV2> {
    const rec = await this.recs.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Recommendation ${id} not found`);
    return rec;
  }

  /** Auto-action a recommendation (only valid when auto_actionable=true). */
  async apply(id: string) {
    const rec = await this.load(id);
    if (rec.status !== RecommendationV2Status.PENDING) {
      throw new ConflictException(
        `Recommendation already ${rec.status}; cannot apply.`,
      );
    }
    if (!rec.auto_actionable || !rec.action_type) {
      throw new ConflictException(
        'Recommendation is not auto-actionable; use acknowledge instead.',
      );
    }

    let result: string;
    switch (rec.action_type) {
      case RecommendationV2ActionType.ADD_SYNONYM:
        result = await this.applyAddSynonym(rec);
        break;
      case RecommendationV2ActionType.CREATE_SKU:
        result = await this.applyCreateSku(rec);
        break;
      default:
        throw new ConflictException('Unsupported action type.');
    }

    rec.status = RecommendationV2Status.APPLIED;
    rec.applied_result = result;
    await this.recs.save(rec);
    return { id: rec.id, status: rec.status, result };
  }

  /** Safe coercion of an unknown jsonb payload field to a trimmed string. */
  private str(v: unknown): string {
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    return '';
  }

  private async applyAddSynonym(rec: RecommendationV2): Promise<string> {
    const payload = rec.action_payload ?? {};
    const skuId = this.str(payload.sku_id);
    const synonym = this.str(payload.synonym);
    if (!skuId || !synonym) {
      throw new ConflictException('add_synonym payload incomplete.');
    }
    const sku = await this.skus.findOne({ where: { id: skuId } });
    if (!sku) throw new ConflictException(`SKU ${skuId} no longer exists.`);

    const aliases = sku.product_name_aliases ?? [];
    const exists = aliases.some(
      (a) => a.trim().toLowerCase() === synonym.toLowerCase(),
    );
    if (!exists) {
      sku.product_name_aliases = [...aliases, synonym];
      await this.skus.save(sku);
    }
    return `Sinonim "${synonym}" ${exists ? 'sudah ada pada' : 'ditambahkan ke'} SKU ${sku.code} (${sku.name}).`;
  }

  private async applyCreateSku(rec: RecommendationV2): Promise<string> {
    const payload = rec.action_payload ?? {};
    const code = this.str(payload.code);
    const name = this.str(payload.name);
    if (!code || !name) {
      throw new ConflictException('create_sku payload incomplete.');
    }
    const dupe = await this.skus.findOne({ where: { code } });
    if (dupe) {
      return `SKU dengan kode ${code} sudah ada (${dupe.name}); tidak membuat duplikat.`;
    }
    const sku = this.skus.create({ code, name });
    await this.skus.save(sku);
    return `SKU baru dibuat: ${code} (${name}).`;
  }

  /** Acknowledge-only (for non-auto-actionable recommendations). */
  async acknowledge(id: string) {
    const rec = await this.load(id);
    if (rec.status === RecommendationV2Status.APPLIED) {
      throw new ConflictException('Recommendation already applied.');
    }
    rec.status = RecommendationV2Status.ACKNOWLEDGED;
    await this.recs.save(rec);
    return { id: rec.id, status: rec.status };
  }
}
