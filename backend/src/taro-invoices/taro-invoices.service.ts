import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { TaroInvoice, TaroInvoiceStatus } from '../database/entities/taro-invoice.entity';
import { TaroInvoiceLineItem } from '../database/entities/taro-invoice-line-item.entity';
import { TaroInvoiceSkuCorrection } from '../database/entities/taro-invoice-sku-correction.entity';
import {
  TaroInvoiceRecommendation,
  TaroRecommendationStatus,
  TaroRecommendationType,
} from '../database/entities/taro-invoice-recommendation.entity';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { TaroMappingRule } from '../database/entities/taro-mapping-rule.entity';
import { TaroAgentRegion } from '../database/entities/taro-agent-region.entity';
import { User, UserRole } from '../database/entities/user.entity';
import { QUEUE_TARO_OCR } from './taro-invoices.constants';
import { RegionsService } from '../regions/regions.service';
import { parseEmbedding } from '../embeddings/similarity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { SkuEmbeddingCache } from '../embeddings/sku-embedding-cache.service';

const CONFIDENCE_THRESHOLD = 0.85;

@Injectable()
export class TaroInvoicesService {
  private readonly uploadDir = path.join(
    process.cwd(),
    process.env.UPLOAD_DIR ?? 'uploads',
    'taro-invoices',
  );

  constructor(
    @InjectRepository(TaroInvoice)
    private readonly invoicesRepo: Repository<TaroInvoice>,
    @InjectRepository(TaroInvoiceLineItem)
    private readonly lineItemsRepo: Repository<TaroInvoiceLineItem>,
    @InjectRepository(TaroInvoiceSkuCorrection)
    private readonly correctionsRepo: Repository<TaroInvoiceSkuCorrection>,
    @InjectRepository(TaroInvoiceRecommendation)
    private readonly recsRepo: Repository<TaroInvoiceRecommendation>,
    @InjectRepository(TacoSku)
    private readonly skusRepo: Repository<TacoSku>,
    @InjectRepository(TaroMappingRule)
    private readonly mappingRulesRepo: Repository<TaroMappingRule>,
    @InjectRepository(TaroAgentRegion)
    private readonly agentRegionsRepo: Repository<TaroAgentRegion>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectQueue(QUEUE_TARO_OCR) private readonly ocrQueue: Queue,
    private readonly regions: RegionsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly embeddings: EmbeddingsService,
    private readonly skuCache: SkuEmbeddingCache,
  ) {
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  // ---- Signed image URL ----

  /**
   * Build a short-lived signed URL for `GET /api/taro-invoices/:id/image`
   * that the FE can stuff into an `<img src>` tag. Browsers can't attach
   * an Authorization header to image GETs, so we instead embed a 15-minute
   * JWT in `?token=` — the JwtStrategy accepts both header and query-param
   * extraction so the existing guard chain stays in force.
   *
   * Caller is expected to have already gone through the normal scope check
   * (i.e. `findOne(id, scopeUploaderId)` for taro_agent).
   */
  async signImageUrl(id: string, user: { id: string; email: string; role: string }): Promise<string> {
    // Confirm the file exists so we don't hand out a token for a 404.
    this.imagePath(id);
    const token = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        scope: 'taro_invoice_image',
        invoice_id: id,
      },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );
    return `/api/taro-invoices/${id}/image?token=${encodeURIComponent(token)}`;
  }

  // ---- Upload ----

  async bulkUpload(
    files: Express.Multer.File[],
    uploadedBy: string | null,
    regionId: string | null,
    storeName: string | null = null,
  ): Promise<Array<{ id: string; file_name: string; status: TaroInvoiceStatus; region_id: string | null; store_name: string | null }>> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required (multipart field "files")');
    }

    if (regionId) {
      await this.regions.assertIsArea(regionId);
    }

    // For taro_agent uploads, validate region is in their m-to-m set.
    // Admin/manager bypass this (they upload on behalf of any region).
    if (uploadedBy && regionId) {
      const uploader = await this.usersRepo.findOne({ where: { id: uploadedBy } });
      if (uploader && uploader.role === UserRole.TARO_AGENT) {
        const allowed = await this.agentRegionsRepo.find({
          where: { user_id: uploadedBy },
        });
        const allowedIds = allowed.map((r) => r.region_id);
        if (!allowedIds.includes(regionId)) {
          throw new ForbiddenException(
            `Agent is not assigned to region ${regionId}. Assigned: [${allowedIds.join(', ')}]`,
          );
        }
      }
    }

    const results: Array<{ id: string; file_name: string; status: TaroInvoiceStatus; region_id: string | null; store_name: string | null }> = [];
    for (const file of files) {
      // Insert a row first so we get the UUID, then persist the file under the
      // canonical name `${id}${ext}`. Image streaming resolves by id prefix —
      // no separate disk-path column required.
      const invoice = await this.invoicesRepo.save(
        this.invoicesRepo.create({
          uploaded_by: uploadedBy,
          status: TaroInvoiceStatus.QUEUED,
          progress_percent: 0,
          raw_image_url: '',
          file_name: file.originalname,
          region_id: regionId,
          store_name: storeName,
        }),
      );
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      const canonicalPath = path.join(this.uploadDir, `${invoice.id}${ext}`);
      fs.writeFileSync(canonicalPath, file.buffer);

      invoice.raw_image_url = `/api/taro-invoices/${invoice.id}/image`;
      await this.invoicesRepo.save(invoice);

      await this.ocrQueue.add('process-taro-invoice', {
        invoiceId: invoice.id,
        imagePath: canonicalPath,
      });

      results.push({
        id: invoice.id,
        file_name: file.originalname,
        status: invoice.status,
        region_id: regionId,
        store_name: storeName,
      });
    }
    return results;
  }

  // ---- Upload progress (refresh-resilient) ----

  async inProgressForUser(userId: string | null): Promise<Array<{
    id: string;
    file_name: string | null;
    status: TaroInvoiceStatus;
    progress_percent: number;
    uploaded_at: Date;
    region: { id: string; code: string; name: string; display_path: string } | null;
  }>> {
    if (!userId) return [];
    const rows = await this.invoicesRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.region', 'region')
      .where('inv.uploaded_by = :uid', { uid: userId })
      .andWhere(`inv.status IN ('processing', 'queued')`)
      .andWhere(`inv.uploaded_at > NOW() - INTERVAL '24 hours'`)
      .orderBy('inv.uploaded_at', 'DESC')
      .getMany();

    return rows.map((r) => ({
      id: r.id,
      file_name: r.file_name,
      status: r.status,
      progress_percent: r.progress_percent ?? 0,
      uploaded_at: r.uploaded_at,
      region: r.region
        ? {
            id: r.region.id,
            code: r.region.code,
            name: r.region.name,
            display_path: r.region.display_path,
          }
        : null,
    }));
  }

  // ---- Recommendation apply/reject ----

  async applyRecommendation(
    id: string,
  ): Promise<{ applied: boolean; recommendation: TaroInvoiceRecommendation; result?: unknown; not_implemented?: string }> {
    const rec = await this.recsRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Recommendation ${id} not found`);
    if (rec.status !== TaroRecommendationStatus.PENDING) {
      throw new BadRequestException(
        `Recommendation already ${rec.status} — only pending can be applied.`,
      );
    }

    let result: unknown = undefined;
    let notImplemented: string | undefined;

    switch (rec.type) {
      case TaroRecommendationType.ADD_SYNONYM: {
        const payload = rec.suggested_payload as { sku_id?: string; synonym?: string };
        if (!payload.sku_id || !payload.synonym) {
          throw new BadRequestException(
            'Recommendation payload is missing required keys sku_id/synonym',
          );
        }
        // The recommendation generator sometimes stores the SKU `code`
        // (e.g. "TH 701 CR") in `sku_id` instead of the UUID. Try UUID first;
        // fall back to a lookup by code so existing seed data still applies
        // cleanly. The TacoSku entity has a UNIQUE constraint on `code` so the
        // resolution is deterministic.
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const sku = uuidRe.test(payload.sku_id)
          ? await this.skusRepo.findOne({ where: { id: payload.sku_id } })
          : await this.skusRepo.findOne({ where: { code: payload.sku_id } });
        if (!sku) throw new NotFoundException(`TacoSku ${payload.sku_id} not found`);
        const synonyms = sku.product_name_aliases ?? [];
        const next = synonyms.includes(payload.synonym)
          ? synonyms
          : [...synonyms, payload.synonym];
        await this.skusRepo.update(sku.id, { product_name_aliases: next });
        // Adding a synonym shifts the embedding text → re-embed + cache flush.
        await this.embeddings.enqueueTacoSku(sku.id);
        this.skuCache.invalidate().catch(() => {});
        result = { sku_id: sku.id, synonyms_count: next.length, embedding_queued: true };
        break;
      }
      case TaroRecommendationType.CREATE_SKU: {
        notImplemented = 'TODO: create SKU';
        // Mark as DISMISSED (stays out of the queue) and 501 the caller.
        await this.recsRepo.update(rec.id, {
          status: TaroRecommendationStatus.DISMISSED,
        });
        return {
          applied: false,
          recommendation: { ...rec, status: TaroRecommendationStatus.DISMISSED },
          not_implemented: notImplemented,
        };
      }
      case TaroRecommendationType.MAPPING_RULE: {
        const payload = rec.suggested_payload as { rule_text?: string };
        const text = (payload.rule_text ?? rec.body ?? '').trim();
        if (!text) {
          throw new BadRequestException(
            'Recommendation payload is missing rule_text and body is empty',
          );
        }
        const saved = await this.mappingRulesRepo.save(
          this.mappingRulesRepo.create({
            rule_text: text,
            source_recommendation_id: rec.id,
          }),
        );
        result = { rule_id: saved.id };
        break;
      }
      case TaroRecommendationType.UPDATE_SKU_KNOWLEDGE: {
        // Payload: { sku_id, suggested_synonyms: string[] }.
        // Append every unique, trimmed, non-empty synonym to the SKU's
        // product_name_aliases, then queue a re-embed so the new synonyms
        // immediately affect OCR matching.
        const payload = rec.suggested_payload as {
          sku_id?: string;
          suggested_synonyms?: unknown;
        };
        if (!payload.sku_id) {
          throw new BadRequestException(
            'Recommendation payload is missing required key sku_id',
          );
        }
        const rawSynonyms = Array.isArray(payload.suggested_synonyms)
          ? (payload.suggested_synonyms as unknown[])
          : [];
        const incoming = rawSynonyms
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        // Same fallback as ADD_SYNONYM — generator may store the code, not UUID.
        const uuidReKnowledge = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const sku = uuidReKnowledge.test(payload.sku_id)
          ? await this.skusRepo.findOne({ where: { id: payload.sku_id } })
          : await this.skusRepo.findOne({ where: { code: payload.sku_id } });
        if (!sku) throw new NotFoundException(`TacoSku ${payload.sku_id} not found`);
        const existing = sku.product_name_aliases ?? [];
        // Dedupe case-insensitively against the existing list AND within the
        // incoming list. Preserve original casing of the first occurrence.
        const seenLower = new Set(existing.map((s) => s.toLowerCase()));
        const additions: string[] = [];
        for (const syn of incoming) {
          const lower = syn.toLowerCase();
          if (seenLower.has(lower)) continue;
          seenLower.add(lower);
          additions.push(syn);
        }
        const next = [...existing, ...additions];
        await this.skusRepo.update(sku.id, { product_name_aliases: next });
        // Always re-embed — synonyms feed the embedding text directly.
        await this.embeddings.enqueueTacoSku(sku.id);
        this.skuCache.invalidate().catch(() => {});
        result = {
          sku_id: sku.id,
          synonyms_added: additions.length,
          synonyms_count: next.length,
          embedding_queued: true,
        };
        break;
      }
      case TaroRecommendationType.INVESTIGATE_COMPETITOR: {
        // No automated catalog change — this is a "flag for product team"
        // signal. Mark APPLIED so it leaves the pending queue when the admin
        // explicitly clicks "I've handed this off".
        result = { acknowledged: true };
        break;
      }
    }

    rec.status = TaroRecommendationStatus.APPLIED;
    rec.applied_at = new Date();
    const updated = await this.recsRepo.save(rec);
    return { applied: true, recommendation: updated, result };
  }

  async rejectRecommendation(id: string): Promise<TaroInvoiceRecommendation> {
    const rec = await this.recsRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Recommendation ${id} not found`);
    if (rec.status !== TaroRecommendationStatus.PENDING) {
      throw new BadRequestException(
        `Recommendation already ${rec.status} — only pending can be dismissed.`,
      );
    }
    rec.status = TaroRecommendationStatus.DISMISSED;
    return this.recsRepo.save(rec);
  }

  // ---- Listing ----

  async list(params: {
    status?: TaroInvoiceStatus;
    needs_review?: boolean;
    region_id?: string;
    page: number;
    limit: number;
    /**
     * When set, restricts results to invoices uploaded by this user. Used by
     * the taro_agent role to scope the listing to their own uploads — the
     * controller derives this from the JWT, never from a query param.
     */
    uploaded_by?: string;
    /**
     * Free-text search across store_name, id (UUID), file_name, region
     * name/display_path, and uploader name. Each field uses ILIKE '%q%' and
     * the fields are OR'd together so any one hit qualifies.
     */
    search?: string;
  }): Promise<{
    data: Array<{
      id: string;
      uploaded_at: Date;
      status: TaroInvoiceStatus;
      supplier_name: string | null;
      invoice_date: string | null;
      total_amount: string | null;
      file_name: string | null;
      region_id: string | null;
      store_name: string | null;
      uploaded_by: string | null;
      line_count: number;
      low_confidence_count: number;
      needs_review_count: number;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const { status, needs_review, region_id, page, limit, uploaded_by, search } = params;
    const offset = (page - 1) * limit;
    const trimmedSearch = typeof search === 'string' ? search.trim() : '';
    const hasSearch = trimmedSearch.length > 0;

    const qb = this.invoicesRepo
      .createQueryBuilder('inv')
      .leftJoin('inv.line_items', 'li')
      .select('inv.id', 'id')
      .addSelect('inv.uploaded_at', 'uploaded_at')
      .addSelect('inv.status', 'status')
      .addSelect('inv.supplier_name', 'supplier_name')
      .addSelect('inv.invoice_date', 'invoice_date')
      .addSelect('inv.total_amount', 'total_amount')
      .addSelect('inv.file_name', 'file_name')
      .addSelect('inv.region_id', 'region_id')
      .addSelect('inv.store_name', 'store_name')
      .addSelect('inv.uploaded_by', 'uploaded_by')
      .addSelect('COUNT(li.id)::int', 'line_count')
      .addSelect(
        `COUNT(li.id) FILTER (WHERE li.confidence_score < ${CONFIDENCE_THRESHOLD})::int`,
        'low_confidence_count',
      )
      .addSelect(
        'COUNT(li.id) FILTER (WHERE li.needs_review = true)::int',
        'needs_review_count',
      )
      .groupBy('inv.id')
      .orderBy('inv.uploaded_at', 'DESC');

    if (status) qb.andWhere('inv.status = :status', { status });
    if (region_id) qb.andWhere('inv.region_id = :rid', { rid: region_id });
    if (uploaded_by) qb.andWhere('inv.uploaded_by = :uid', { uid: uploaded_by });
    if (needs_review === true) {
      qb.andHaving('COUNT(li.id) FILTER (WHERE li.needs_review = true) > 0');
    } else if (needs_review === false) {
      qb.andHaving('COUNT(li.id) FILTER (WHERE li.needs_review = true) = 0');
    }

    // Search filter — case-insensitive ILIKE across store_name, id (UUID),
    // file_name, region (name + display_path), uploader name. Region + user
    // joins are added only when search is active so the default list query
    // stays cheap.
    if (hasSearch) {
      qb.leftJoin('inv.region', 'region_s')
        .leftJoin('inv.uploaded_by_user', 'uploader_s')
        .andWhere(
          `(
            inv.store_name ILIKE :q
            OR inv.id::text ILIKE :q
            OR inv.file_name ILIKE :q
            OR region_s.name ILIKE :q
            OR region_s.display_path ILIKE :q
            OR uploader_s.name ILIKE :q
          )`,
          { q: `%${trimmedSearch}%` },
        );
    }

    // Total — separate count query so the GROUP BY doesn't break pagination math.
    const totalQb = this.invoicesRepo.createQueryBuilder('inv');
    if (status) totalQb.andWhere('inv.status = :status', { status });
    if (region_id) totalQb.andWhere('inv.region_id = :rid', { rid: region_id });
    if (uploaded_by) totalQb.andWhere('inv.uploaded_by = :uid', { uid: uploaded_by });
    if (hasSearch) {
      totalQb
        .leftJoin('inv.region', 'region_s')
        .leftJoin('inv.uploaded_by_user', 'uploader_s')
        .andWhere(
          `(
            inv.store_name ILIKE :q
            OR inv.id::text ILIKE :q
            OR inv.file_name ILIKE :q
            OR region_s.name ILIKE :q
            OR region_s.display_path ILIKE :q
            OR uploader_s.name ILIKE :q
          )`,
          { q: `%${trimmedSearch}%` },
        );
    }
    const total = await totalQb.getCount();

    const raw = await qb.offset(offset).limit(limit).getRawMany();
    return {
      data: raw.map((r) => ({
        id: r.id,
        uploaded_at: r.uploaded_at,
        status: r.status,
        supplier_name: r.supplier_name,
        invoice_date: r.invoice_date,
        total_amount: r.total_amount,
        file_name: r.file_name,
        region_id: r.region_id ?? null,
        store_name: r.store_name ?? null,
        uploaded_by: r.uploaded_by ?? null,
        line_count: r.line_count ?? 0,
        low_confidence_count: r.low_confidence_count ?? 0,
        needs_review_count: r.needs_review_count ?? 0,
      })),
      total,
      page,
      limit,
    };
  }

  // ---- Detail ----

  /**
   * @param scopeUploaderId  When non-null, return 404 if the invoice was
   *                         uploaded by a different user. Used to scope
   *                         taro_agent reads to their own uploads. We return
   *                         404 (not 403) on purpose — the agent shouldn't be
   *                         able to probe for the existence of other agents'
   *                         invoice IDs.
   */
  async findOne(id: string, scopeUploaderId: string | null = null): Promise<TaroInvoice> {
    const inv = await this.invoicesRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.region', 'region')
      .leftJoinAndSelect('inv.line_items', 'li')
      .leftJoinAndSelect('li.matched_sku', 'sku')
      .where('inv.id = :id', { id })
      .orderBy('li.line_no', 'ASC')
      .getOne();
    if (!inv) throw new NotFoundException(`TaroInvoice ${id} not found`);
    if (scopeUploaderId !== null && inv.uploaded_by !== scopeUploaderId) {
      throw new NotFoundException(`TaroInvoice ${id} not found`);
    }
    return inv;
  }

  // ---- Per-agent weekly stats (PWA homescreen chart) ----

  /**
   * Returns the last 7 days of upload counts for the given user. Always
   * returns exactly 7 day-buckets (today last) so the FE can render a
   * fixed-width chart even when some days had zero uploads. Day labels use
   * 3-letter Indonesian weekday short names (Sen…Min) to match the PWA's
   * existing locale.
   */
  async myWeeklyStats(userId: string | null): Promise<{
    total_this_week: number;
    days: Array<{ date: string; weekday_short: string; count: number }>;
  }> {
    // Build the 7-day window in JS so we get stable [today-6 … today] regardless
    // of timezone weirdness in Postgres. Day buckets use the server's local
    // date — same convention as `uploaded_at::date`.
    const days: Array<{ date: string; weekday_short: string; count: number }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const idWeekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      days.push({
        date: `${yyyy}-${mm}-${dd}`,
        weekday_short: idWeekdays[d.getDay()],
        count: 0,
      });
    }

    if (!userId) {
      return { total_this_week: 0, days };
    }

    // Group by local-date to align with the JS-built window above.
    const rows = await this.invoicesRepo.query(
      `
      SELECT to_char(inv.uploaded_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM taro_invoices inv
      WHERE inv.uploaded_by = $1
        AND inv.uploaded_at >= NOW() - INTERVAL '7 days'
      GROUP BY inv.uploaded_at::date
      `,
      [userId],
    );
    const byDay = new Map<string, number>();
    for (const r of rows as Array<{ day: string; count: number }>) {
      byDay.set(r.day, Number(r.count));
    }
    let total = 0;
    for (const d of days) {
      d.count = byDay.get(d.date) ?? 0;
      total += d.count;
    }
    return { total_this_week: total, days };
  }

  // ---- Line-item patch ----

  async patchLineItem(
    lineItemId: string,
    correctedBy: string | null,
    body: { matched_sku_id?: string | null; reason?: string },
    actor: { id: string; role: UserRole } | null = null,
  ): Promise<TaroInvoiceLineItem> {
    const li = await this.lineItemsRepo.findOne({ where: { id: lineItemId } });
    if (!li) throw new NotFoundException(`TaroInvoiceLineItem ${lineItemId} not found`);

    // taro_agent → can only edit lines on invoices they themselves uploaded.
    // Derived from JWT (never trust query/body); admin/manager bypass.
    if (actor && actor.role === UserRole.TARO_AGENT) {
      const inv = await this.invoicesRepo.findOne({
        where: { id: li.invoice_id },
        select: { id: true, uploaded_by: true },
      });
      if (!inv || inv.uploaded_by !== actor.id) {
        throw new ForbiddenException(
          'Taro agents can only edit line items on invoices they uploaded',
        );
      }
    }

    const skuChanged =
      body.matched_sku_id !== undefined && body.matched_sku_id !== li.matched_sku_id;

    if (skuChanged && (!body.reason || body.reason.trim().length === 0)) {
      throw new BadRequestException('reason is required when changing matched_sku_id');
    }

    const originalSkuId = li.matched_sku_id;

    if (body.matched_sku_id !== undefined) {
      li.matched_sku_id = body.matched_sku_id;
    }
    li.edited = true;
    // Recompute needs_review using current confidence + new mapping.
    const conf = parseFloat(li.confidence_score);
    li.needs_review = (Number.isNaN(conf) ? 0 : conf) < CONFIDENCE_THRESHOLD || !li.matched_sku_id;

    const saved = await this.lineItemsRepo.save(li);

    if (skuChanged && body.matched_sku_id) {
      await this.correctionsRepo.save(
        this.correctionsRepo.create({
          line_item_id: saved.id,
          original_sku_id: originalSkuId,
          corrected_sku_id: body.matched_sku_id,
          reason: (body.reason ?? '').trim(),
          corrected_by: correctedBy,
        }),
      );
    }

    return saved;
  }

  // ---- Recommendations ----

  listPendingRecommendations(
    status: TaroRecommendationStatus = TaroRecommendationStatus.PENDING,
  ): Promise<TaroInvoiceRecommendation[]> {
    return this.recsRepo.find({
      where: { status },
      order: { generated_at: 'DESC' },
    });
  }

  // ---- Analytics ----

  async analytics(regionId?: string): Promise<{
    region_id: string | null;
    total_invoices: number;
    processed_count: number;
    needs_review_count: number;
    avg_confidence: number;
    top_uploaded_skus: Array<{ sku_id: string; sku_code: string; sku_name: string; count: number }>;
    low_confidence_skus: Array<{ sku_id: string; sku_code: string; sku_name: string; avg_confidence: number; line_count: number }>;
    monthly_volume: Array<{ month: string; count: number }>;
    regions_summary: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      invoice_count: number;
      total_line_items: number;
      avg_confidence: number;
      needs_review_rate: number;
    }>;
    region_monthly: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      months: Array<{ month: string; invoices: number }>;
    }>;
    top_skus_by_region: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      top_skus: Array<{ sku: { code: string; name: string; category: string | null }; count: number }>;
    }>;
    region_price_extremes: Array<{
      sku: { code: string; name: string; category: string | null };
      region: { id: string | null; code: string; name: string; display_path: string };
      avg_price: number;
      is_min: boolean;
      is_max: boolean;
    }>;
    agents_summary: Array<{
      agent: { id: string; name: string; email: string };
      region: { id: string | null; code: string; name: string; display_path: string } | null;
      invoice_count: number;
      avg_confidence: number;
      needs_review_rate: number;
    }>;
    agent_monthly: Array<{
      agent: { id: string; name: string; email: string };
      months: Array<{ month: string; invoices: number }>;
    }>;
    top_taco_skus: Array<{
      sku: { code: string; name: string; category: string | null };
      total_volume: number;
      total_value: number;
      invoice_count: number;
    }>;
    least_popular_taco_skus: Array<{
      sku: { code: string; name: string; category: string | null };
      total_volume: number;
      invoice_count: number;
    }>;
    trending_taco_skus: Array<{
      sku: { code: string; name: string; category: string | null };
      current_month_volume: number;
      previous_month_volume: number;
      growth_pct: number;
    }>;
    taco_sku_monthly: Array<{
      sku: { code: string; name: string; category: string | null };
      months: Array<{ month: string; volume: number }>;
    }>;
    detected_non_taco_products: Array<{
      raw_text: string;
      occurrence_count: number;
      avg_unit_price: number;
      likely_taco_sku_match: {
        sku: { code: string; name: string };
        similarity: number;
      } | null;
      is_likely_competitor: boolean;
      regions_seen_in: Array<{
        region: { id: string | null; code: string; name: string; display_path: string };
        count: number;
      }>;
    }>;
  }> {
    // Helper to apply region scope on either an invoice-rooted or a line-item-rooted QB.
    const scopeInvoice = <T extends import('typeorm').SelectQueryBuilder<any>>(qb: T): T => {
      if (regionId) qb.andWhere('inv.region_id = :rid', { rid: regionId });
      return qb;
    };

    const totals = await scopeInvoice(
      this.invoicesRepo
        .createQueryBuilder('inv')
        .select('COUNT(*)::int', 'total_invoices')
        .addSelect(
          `COUNT(*) FILTER (WHERE inv.status = 'done')::int`,
          'processed_count',
        ),
    ).getRawOne();

    const reviewQb = this.lineItemsRepo
      .createQueryBuilder('li')
      .select('COUNT(*) FILTER (WHERE li.needs_review = true)::int', 'needs_review_count')
      .addSelect('COALESCE(AVG(li.confidence_score), 0)::float', 'avg_confidence');
    if (regionId) {
      reviewQb.innerJoin('taro_invoices', 'inv', 'inv.id = li.invoice_id')
        .andWhere('inv.region_id = :rid', { rid: regionId });
    }
    const reviewRow = await reviewQb.getRawOne();

    const topSkusQb = this.lineItemsRepo
      .createQueryBuilder('li')
      .innerJoin(TacoSku, 'sku', 'sku.id = li.matched_sku_id')
      .select('sku.id', 'sku_id')
      .addSelect('sku.code', 'sku_code')
      .addSelect('sku.name', 'sku_name')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('sku.id')
      .addGroupBy('sku.code')
      .addGroupBy('sku.name')
      .orderBy('count', 'DESC')
      .limit(10);
    if (regionId) {
      topSkusQb.innerJoin('taro_invoices', 'inv', 'inv.id = li.invoice_id')
        .andWhere('inv.region_id = :rid', { rid: regionId });
    }
    const topSkus = await topSkusQb.getRawMany();

    const lowConfQb = this.lineItemsRepo
      .createQueryBuilder('li')
      .innerJoin(TacoSku, 'sku', 'sku.id = li.matched_sku_id')
      .select('sku.id', 'sku_id')
      .addSelect('sku.code', 'sku_code')
      .addSelect('sku.name', 'sku_name')
      .addSelect('AVG(li.confidence_score)::float', 'avg_confidence')
      .addSelect('COUNT(*)::int', 'line_count')
      .groupBy('sku.id')
      .addGroupBy('sku.code')
      .addGroupBy('sku.name')
      .having('AVG(li.confidence_score) < :t', { t: CONFIDENCE_THRESHOLD })
      .orderBy('avg_confidence', 'ASC')
      .limit(10);
    if (regionId) {
      lowConfQb.innerJoin('taro_invoices', 'inv', 'inv.id = li.invoice_id')
        .andWhere('inv.region_id = :rid', { rid: regionId });
    }
    const lowConfSkus = await lowConfQb.getRawMany();

    const monthly = await scopeInvoice(
      this.invoicesRepo
        .createQueryBuilder('inv')
        .select(`to_char(date_trunc('month', inv.uploaded_at), 'YYYY-MM')`, 'month')
        .addSelect('COUNT(*)::int', 'count'),
    )
      .groupBy(`date_trunc('month', inv.uploaded_at)`)
      .orderBy(`date_trunc('month', inv.uploaded_at)`, 'ASC')
      .getRawMany();

    const regional = await this.computeRegionalAggregates(regionId);
    const agentPanels = await this.computeAgentAggregates(regionId);
    const skuIntel = await this.computeSkuIntelligence(regionId);

    return {
      region_id: regionId ?? null,
      total_invoices: totals?.total_invoices ?? 0,
      processed_count: totals?.processed_count ?? 0,
      needs_review_count: reviewRow?.needs_review_count ?? 0,
      avg_confidence: Number(reviewRow?.avg_confidence ?? 0),
      top_uploaded_skus: topSkus,
      low_confidence_skus: lowConfSkus,
      monthly_volume: monthly,
      regions_summary: regional.regions_summary,
      region_monthly: regional.region_monthly,
      top_skus_by_region: regional.top_skus_by_region,
      region_price_extremes: regional.region_price_extremes,
      agents_summary: agentPanels.agents_summary,
      agent_monthly: agentPanels.agent_monthly,
      top_taco_skus: skuIntel.top_taco_skus,
      least_popular_taco_skus: skuIntel.least_popular_taco_skus,
      trending_taco_skus: skuIntel.trending_taco_skus,
      taco_sku_monthly: skuIntel.taco_sku_monthly,
      detected_non_taco_products: skuIntel.detected_non_taco_products,
    };
  }

  /**
   * SKU intelligence panel data for the overview page:
   *
   *   top_taco_skus               — top 20 TACO SKUs by total volume (qty)
   *   least_popular_taco_skus     — bottom 20 TACO SKUs by volume (only ones
   *                                 that have mapped at least once)
   *   trending_taco_skus          — top 10 by current/previous month growth %
   *   taco_sku_monthly            — last-6-months volume series for top 10
   *                                 by volume
   *   detected_non_taco_products  — top 20 raw_texts the OCR DIDN'T match
   *                                 (matched_sku_id NULL or confidence < 0.5),
   *                                 enriched with closest-TACO embedding hint
   *                                 + per-region distribution
   *
   * All scoped to `regionId` when present.
   */
  private async computeSkuIntelligence(regionId?: string): Promise<{
    top_taco_skus: Array<{
      sku: { code: string; name: string; category: string | null };
      total_volume: number;
      total_value: number;
      invoice_count: number;
    }>;
    least_popular_taco_skus: Array<{
      sku: { code: string; name: string; category: string | null };
      total_volume: number;
      invoice_count: number;
    }>;
    trending_taco_skus: Array<{
      sku: { code: string; name: string; category: string | null };
      current_month_volume: number;
      previous_month_volume: number;
      growth_pct: number;
    }>;
    taco_sku_monthly: Array<{
      sku: { code: string; name: string; category: string | null };
      months: Array<{ month: string; volume: number }>;
    }>;
    detected_non_taco_products: Array<{
      raw_text: string;
      occurrence_count: number;
      avg_unit_price: number;
      likely_taco_sku_match: {
        sku: { code: string; name: string };
        similarity: number;
      } | null;
      is_likely_competitor: boolean;
      regions_seen_in: Array<{
        region: { id: string | null; code: string; name: string; display_path: string };
        count: number;
      }>;
    }>;
  }> {
    const regionWhere = regionId ? 'AND inv.region_id = $1' : '';
    const regionArgs: string[] = regionId ? [regionId] : [];

    // --- top_taco_skus: top 20 by total volume (qty) ---
    // GREATEST(qty,1) so rows with NULL/0 quantity still count as one unit —
    // OCR sometimes drops the qty cell.
    const topRows = await this.invoicesRepo.query(
      `
      SELECT
        sku.id AS sku_id,
        sku.code AS sku_code,
        sku.name AS sku_name,
        sku.catalog_category AS sku_category,
        SUM(GREATEST(COALESCE(li.quantity, 0), 1))::float AS total_volume,
        SUM(COALESCE(li.total_price, 0))::float AS total_value,
        COUNT(DISTINCT li.invoice_id)::int AS invoice_count
      FROM taro_invoice_line_items li
      INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
      INNER JOIN taco_skus sku ON sku.id = li.matched_sku_id
      WHERE li.matched_sku_id IS NOT NULL
        ${regionWhere}
      GROUP BY sku.id, sku.code, sku.name, sku.catalog_category
      ORDER BY total_volume DESC
      LIMIT 20
      `,
      regionArgs,
    );
    const topTacoSkus = (topRows as Array<{
      sku_id: string;
      sku_code: string;
      sku_name: string;
      sku_category: string | null;
      total_volume: number;
      total_value: number;
      invoice_count: number;
    }>).map((r) => ({
      sku: { code: r.sku_code, name: r.sku_name, category: r.sku_category },
      total_volume: Number(r.total_volume ?? 0),
      total_value: Number(r.total_value ?? 0),
      invoice_count: Number(r.invoice_count ?? 0),
    }));

    // --- least_popular_taco_skus: bottom 20 (only mapped at least once) ---
    const leastRows = await this.invoicesRepo.query(
      `
      SELECT
        sku.id AS sku_id,
        sku.code AS sku_code,
        sku.name AS sku_name,
        sku.catalog_category AS sku_category,
        SUM(GREATEST(COALESCE(li.quantity, 0), 1))::float AS total_volume,
        COUNT(DISTINCT li.invoice_id)::int AS invoice_count
      FROM taro_invoice_line_items li
      INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
      INNER JOIN taco_skus sku ON sku.id = li.matched_sku_id
      WHERE li.matched_sku_id IS NOT NULL
        ${regionWhere}
      GROUP BY sku.id, sku.code, sku.name, sku.catalog_category
      ORDER BY total_volume ASC
      LIMIT 20
      `,
      regionArgs,
    );
    const leastPopularTacoSkus = (leastRows as Array<{
      sku_code: string;
      sku_name: string;
      sku_category: string | null;
      total_volume: number;
      invoice_count: number;
    }>).map((r) => ({
      sku: { code: r.sku_code, name: r.sku_name, category: r.sku_category },
      total_volume: Number(r.total_volume ?? 0),
      invoice_count: Number(r.invoice_count ?? 0),
    }));

    // --- trending_taco_skus: current month vs previous month ---
    // Buckets are computed in SQL with date_trunc so "this month" = current
    // calendar month, "previous" = preceding month.
    const trendRows = await this.invoicesRepo.query(
      `
      WITH per_sku AS (
        SELECT
          sku.id AS sku_id,
          sku.code AS sku_code,
          sku.name AS sku_name,
          sku.catalog_category AS sku_category,
          SUM(CASE WHEN date_trunc('month', inv.uploaded_at) = date_trunc('month', NOW())
                   THEN GREATEST(COALESCE(li.quantity, 0), 1)
                   ELSE 0 END)::float AS curr_vol,
          SUM(CASE WHEN date_trunc('month', inv.uploaded_at) = date_trunc('month', NOW() - INTERVAL '1 month')
                   THEN GREATEST(COALESCE(li.quantity, 0), 1)
                   ELSE 0 END)::float AS prev_vol
        FROM taro_invoice_line_items li
        INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
        INNER JOIN taco_skus sku ON sku.id = li.matched_sku_id
        WHERE li.matched_sku_id IS NOT NULL
          ${regionWhere}
        GROUP BY sku.id, sku.code, sku.name, sku.catalog_category
      )
      SELECT sku_id, sku_code, sku_name, sku_category, curr_vol, prev_vol,
             CASE WHEN prev_vol = 0 AND curr_vol > 0 THEN 9999.0
                  WHEN prev_vol = 0 THEN 0
                  ELSE ((curr_vol - prev_vol) / prev_vol) * 100.0
             END AS growth_pct
      FROM per_sku
      WHERE curr_vol > 0
      ORDER BY growth_pct DESC, curr_vol DESC
      LIMIT 10
      `,
      regionArgs,
    );
    const trendingTacoSkus = (trendRows as Array<{
      sku_code: string;
      sku_name: string;
      sku_category: string | null;
      curr_vol: number;
      prev_vol: number;
      growth_pct: number;
    }>).map((r) => ({
      sku: { code: r.sku_code, name: r.sku_name, category: r.sku_category },
      current_month_volume: Number(r.curr_vol ?? 0),
      previous_month_volume: Number(r.prev_vol ?? 0),
      growth_pct: Number(r.growth_pct ?? 0),
    }));

    // --- taco_sku_monthly: 6-month series for top 10 by volume ---
    const top10Ids = (topRows as Array<{ sku_id: string }>)
      .slice(0, 10)
      .map((r) => r.sku_id);

    const monthLabels: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      monthLabels.push(`${yyyy}-${mm}`);
    }

    let tacoSkuMonthly: Array<{
      sku: { code: string; name: string; category: string | null };
      months: Array<{ month: string; volume: number }>;
    }> = [];

    if (top10Ids.length > 0) {
      const monthlyArgs: Array<string | string[]> = [top10Ids];
      let monthlyWhere = `sku.id = ANY($1)`;
      if (regionId) {
        monthlyArgs.push(regionId);
        monthlyWhere += ` AND inv.region_id = $${monthlyArgs.length}`;
      }

      const monthlyRows = await this.invoicesRepo.query(
        `
        SELECT
          sku.id AS sku_id,
          sku.code AS sku_code,
          sku.name AS sku_name,
          sku.catalog_category AS sku_category,
          to_char(date_trunc('month', inv.uploaded_at), 'YYYY-MM') AS month,
          SUM(GREATEST(COALESCE(li.quantity, 0), 1))::float AS volume
        FROM taro_invoice_line_items li
        INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
        INNER JOIN taco_skus sku ON sku.id = li.matched_sku_id
        WHERE ${monthlyWhere}
          AND inv.uploaded_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        GROUP BY sku.id, sku.code, sku.name, sku.catalog_category, date_trunc('month', inv.uploaded_at)
        `,
        monthlyArgs,
      );
      const bySku = new Map<string, {
        code: string;
        name: string;
        category: string | null;
        months: Map<string, number>;
      }>();
      for (const r of monthlyRows as Array<{
        sku_id: string;
        sku_code: string;
        sku_name: string;
        sku_category: string | null;
        month: string;
        volume: number;
      }>) {
        const entry =
          bySku.get(r.sku_id) ??
          {
            code: r.sku_code,
            name: r.sku_name,
            category: r.sku_category,
            months: new Map<string, number>(),
          };
        entry.months.set(r.month, Number(r.volume));
        bySku.set(r.sku_id, entry);
      }

      tacoSkuMonthly = top10Ids
        .filter((id) => bySku.has(id))
        .map((id) => {
          const e = bySku.get(id)!;
          return {
            sku: { code: e.code, name: e.name, category: e.category },
            months: monthLabels.map((m) => ({ month: m, volume: e.months.get(m) ?? 0 })),
          };
        });
    }

    // --- detected_non_taco_products ---
    // Pull top 20 raw_texts where OCR didn't match a TACO SKU with confidence.
    // Then in-memory: compute closest TACO SKU via stored embeddings; tag
    // is_likely_competitor when similarity < 0.65 (or no embeddings).
    const failedArgs: Array<string | number> = [0.5];
    let failedWhere = `(li.matched_sku_id IS NULL OR li.confidence_score < $1)`;
    if (regionId) {
      failedArgs.push(regionId);
      failedWhere += ` AND inv.region_id = $${failedArgs.length}`;
    }
    const failedRows = await this.invoicesRepo.query(
      `
      SELECT
        li.raw_text AS raw_text,
        COUNT(*)::int AS occurrence_count,
        COALESCE(AVG(NULLIF(li.unit_price::float, 0)), 0)::float AS avg_unit_price
      FROM taro_invoice_line_items li
      INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
      WHERE ${failedWhere}
      GROUP BY li.raw_text
      ORDER BY occurrence_count DESC, raw_text ASC
      LIMIT 20
      `,
      failedArgs,
    );

    const rawTexts = (failedRows as Array<{ raw_text: string }>).map((r) => r.raw_text);

    // Per-region distribution.
    let regionDistRows: Array<{
      raw_text: string;
      region_id: string | null;
      region_code: string | null;
      region_name: string | null;
      region_path: string | null;
      count: number;
    }> = [];
    if (rawTexts.length > 0) {
      const distArgs: Array<string[] | number | string> = [rawTexts, 0.5];
      let distWhere = `li.raw_text = ANY($1) AND (li.matched_sku_id IS NULL OR li.confidence_score < $2)`;
      if (regionId) {
        distArgs.push(regionId);
        distWhere += ` AND inv.region_id = $${distArgs.length}`;
      }
      regionDistRows = await this.invoicesRepo.query(
        `
        SELECT
          li.raw_text AS raw_text,
          inv.region_id AS region_id,
          r.code AS region_code,
          r.name AS region_name,
          r.display_path AS region_path,
          COUNT(*)::int AS count
        FROM taro_invoice_line_items li
        INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
        LEFT JOIN regions r ON r.id = inv.region_id
        WHERE ${distWhere}
        GROUP BY li.raw_text, inv.region_id, r.code, r.name, r.display_path
        ORDER BY count DESC
        `,
        distArgs,
      );
    }
    const regionsByRaw = new Map<string, Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      count: number;
    }>>();
    for (const r of regionDistRows) {
      const list = regionsByRaw.get(r.raw_text) ?? [];
      list.push({
        region: {
          id: r.region_id,
          code: r.region_code ?? 'TANPA-REGION',
          name: r.region_name ?? 'Tanpa Region',
          display_path: r.region_path ?? 'Tanpa Region',
        },
        count: Number(r.count),
      });
      regionsByRaw.set(r.raw_text, list);
    }

    // Embedding-based closest TACO SKU per raw_text.
    let allSkus: TacoSku[] = [];
    if (rawTexts.length > 0) {
      allSkus = await this.skusRepo
        .createQueryBuilder('sku')
        .where('sku.embedding IS NOT NULL')
        .getMany();
    }
    const skuVecs = allSkus
      .map((s) => ({ sku: s, vec: parseEmbedding(s.embedding) }))
      .filter((x): x is { sku: TacoSku; vec: number[] } => !!x.vec);

    // For each raw_text: fetch the matched_sku_id if any has one (low_conf
    // case) — its confidence_score doubles as similarity. For pure no-match,
    // we'd need to embed the raw_text on the fly; that's expensive. To stay
    // synchronous we use the matched-sku-confidence as a best-effort
    // similarity, which lines up with the existing failed-OCR shape.
    const matchedRows = await this.invoicesRepo.query(
      `
      SELECT
        li.raw_text AS raw_text,
        sku.id AS sku_id,
        sku.code AS sku_code,
        sku.name AS sku_name,
        AVG(li.confidence_score)::float AS similarity
      FROM taro_invoice_line_items li
      INNER JOIN taco_skus sku ON sku.id = li.matched_sku_id
      WHERE li.raw_text = ANY($1)
      GROUP BY li.raw_text, sku.id, sku.code, sku.name
      ORDER BY similarity DESC
      `,
      [rawTexts.length > 0 ? rawTexts : ['__none__']],
    );
    const bestByRaw = new Map<string, {
      sku: { code: string; name: string };
      similarity: number;
    }>();
    for (const r of matchedRows as Array<{
      raw_text: string;
      sku_code: string;
      sku_name: string;
      similarity: number;
    }>) {
      const cur = bestByRaw.get(r.raw_text);
      const sim = Number(r.similarity ?? 0);
      if (!cur || sim > cur.similarity) {
        bestByRaw.set(r.raw_text, {
          sku: { code: r.sku_code, name: r.sku_name },
          similarity: sim,
        });
      }
    }

    const detectedNonTaco = (failedRows as Array<{
      raw_text: string;
      occurrence_count: number;
      avg_unit_price: number;
    }>).map((r) => {
      // Suggest match only when similarity is in [0.65, 0.85] — below that
      // it's likely a different product, above that the OCR already matched
      // (so it wouldn't be in this bucket).
      const best = bestByRaw.get(r.raw_text) ?? null;
      const likely =
        best && best.similarity >= 0.65 && best.similarity <= 0.85 ? best : null;
      const isCompetitor = !best || best.similarity < 0.5;
      return {
        raw_text: r.raw_text,
        occurrence_count: Number(r.occurrence_count ?? 0),
        avg_unit_price: Number(r.avg_unit_price ?? 0),
        likely_taco_sku_match: likely,
        is_likely_competitor: isCompetitor,
        regions_seen_in: regionsByRaw.get(r.raw_text) ?? [],
      };
    });
    void skuVecs; // kept loaded for future embed-on-the-fly upgrade

    return {
      top_taco_skus: topTacoSkus,
      least_popular_taco_skus: leastPopularTacoSkus,
      trending_taco_skus: trendingTacoSkus,
      taco_sku_monthly: tacoSkuMonthly,
      detected_non_taco_products: detectedNonTaco,
    };
  }

  /**
   * Top-10 agents by invoice volume (with confidence + needs-review rate),
   * plus a 6-month invoice series for the top-5 of those agents. Mirrors the
   * shape of `computeRegionalAggregates` so the FE can render region/agent
   * panels with the same component.
   */
  private async computeAgentAggregates(regionId?: string): Promise<{
    agents_summary: Array<{
      agent: { id: string; name: string; email: string };
      region: { id: string | null; code: string; name: string; display_path: string } | null;
      invoice_count: number;
      avg_confidence: number;
      needs_review_rate: number;
    }>;
    agent_monthly: Array<{
      agent: { id: string; name: string; email: string };
      months: Array<{ month: string; invoices: number }>;
    }>;
  }> {
    const summaryArgs: Array<string> = [];
    let summaryWhere = `inv.uploaded_by IS NOT NULL`;
    if (regionId) {
      summaryArgs.push(regionId);
      summaryWhere += ` AND inv.region_id = $${summaryArgs.length}`;
    }

    const summaryRows = await this.invoicesRepo.query(
      `
      SELECT
        u.id AS agent_id,
        u.name AS agent_name,
        u.email AS agent_email,
        r.id AS region_id,
        r.code AS region_code,
        r.name AS region_name,
        r.display_path AS region_path,
        COUNT(DISTINCT inv.id)::int AS invoice_count,
        COALESCE(AVG(li.confidence_score), 0)::float AS avg_confidence,
        CASE WHEN COUNT(li.id) = 0 THEN 0
             ELSE (COUNT(li.id) FILTER (WHERE li.needs_review = true))::float
                  / COUNT(li.id)::float
        END AS needs_review_rate
      FROM taro_invoices inv
      INNER JOIN users u ON u.id = inv.uploaded_by
      LEFT JOIN regions r ON r.id = u.taro_region_id
      LEFT JOIN taro_invoice_line_items li ON li.invoice_id = inv.id
      WHERE ${summaryWhere}
      GROUP BY u.id, u.name, u.email, r.id, r.code, r.name, r.display_path
      ORDER BY invoice_count DESC, u.name ASC
      LIMIT 10
      `,
      summaryArgs,
    );

    const agentsSummary = (summaryRows as Array<{
      agent_id: string;
      agent_name: string;
      agent_email: string;
      region_id: string | null;
      region_code: string | null;
      region_name: string | null;
      region_path: string | null;
      invoice_count: number;
      avg_confidence: number;
      needs_review_rate: number;
    }>).map((r) => ({
      agent: { id: r.agent_id, name: r.agent_name, email: r.agent_email },
      region: r.region_id
        ? {
            id: r.region_id,
            code: r.region_code ?? '',
            name: r.region_name ?? '',
            display_path: r.region_path ?? '',
          }
        : null,
      invoice_count: Number(r.invoice_count ?? 0),
      avg_confidence: Number(r.avg_confidence ?? 0),
      needs_review_rate: Number(r.needs_review_rate ?? 0),
    }));

    // Last-6-months labels (oldest first) so the FE chart gets a contiguous
    // series even where some months have zero uploads.
    const monthLabels: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      monthLabels.push(`${yyyy}-${mm}`);
    }

    const top5 = agentsSummary.slice(0, 5);
    if (top5.length === 0) {
      return { agents_summary: agentsSummary, agent_monthly: [] };
    }

    const monthlyArgs: Array<string | string[]> = [top5.map((a) => a.agent.id)];
    let monthlyWhere = `inv.uploaded_by = ANY($1)`;
    if (regionId) {
      monthlyArgs.push(regionId);
      monthlyWhere += ` AND inv.region_id = $${monthlyArgs.length}`;
    }

    const monthlyRows = await this.invoicesRepo.query(
      `
      SELECT
        inv.uploaded_by AS agent_id,
        to_char(date_trunc('month', inv.uploaded_at), 'YYYY-MM') AS month,
        COUNT(*)::int AS invoices
      FROM taro_invoices inv
      WHERE ${monthlyWhere}
        AND inv.uploaded_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
      GROUP BY inv.uploaded_by, date_trunc('month', inv.uploaded_at)
      ORDER BY inv.uploaded_by, date_trunc('month', inv.uploaded_at) ASC
      `,
      monthlyArgs,
    );

    const byAgent = new Map<string, Map<string, number>>();
    for (const r of monthlyRows as Array<{
      agent_id: string;
      month: string;
      invoices: number;
    }>) {
      const inner = byAgent.get(r.agent_id) ?? new Map<string, number>();
      inner.set(r.month, Number(r.invoices));
      byAgent.set(r.agent_id, inner);
    }

    const agentMonthly = top5.map((a) => {
      const inner = byAgent.get(a.agent.id) ?? new Map<string, number>();
      return {
        agent: a.agent,
        months: monthLabels.map((m) => ({ month: m, invoices: inner.get(m) ?? 0 })),
      };
    });

    return { agents_summary: agentsSummary, agent_monthly: agentMonthly };
  }

  /**
   * Build the four region-flavoured arrays. Split out so `analytics()` stays
   * readable.
   *
   *   regions_summary       — every ASM area + "Tanpa Region" bucket
   *                           (sorted by invoice_count desc)
   *   region_monthly        — last 6 months of invoice counts per region with
   *                           >0 invoices
   *   top_skus_by_region    — top 5 line-item SKUs per region with >0 invoices
   *   region_price_extremes — 10 SKUs that show the widest avg-price spread
   *                           across regions (returns the min + max row pair)
   *
   * When `regionId` is set, all four collapse to that region's slice and
   * `region_price_extremes` is empty (cross-region context is N/A).
   */
  private async computeRegionalAggregates(regionId?: string): Promise<{
    regions_summary: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      invoice_count: number;
      total_line_items: number;
      avg_confidence: number;
      needs_review_rate: number;
    }>;
    region_monthly: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      months: Array<{ month: string; invoices: number }>;
    }>;
    top_skus_by_region: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      top_skus: Array<{ sku: { code: string; name: string; category: string | null }; count: number }>;
    }>;
    region_price_extremes: Array<{
      sku: { code: string; name: string; category: string | null };
      region: { id: string | null; code: string; name: string; display_path: string };
      avg_price: number;
      is_min: boolean;
      is_max: boolean;
    }>;
  }> {
    // --- All areas + "Tanpa Region" pseudo-bucket ---
    // When scoped, we only need that one area row (no Tanpa Region) so the
    // dashboard keeps showing "your" KPIs without a noisy null bucket.
    let areaRows: Array<{ id: string; code: string; name: string; display_path: string }>;
    if (regionId) {
      const r = await this.regions.findOne(regionId);
      areaRows = [{ id: r.id, code: r.code, name: r.name, display_path: r.display_path }];
    } else {
      const all = await this.regions.areas();
      areaRows = all.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        display_path: r.display_path,
      }));
    }

    const TANPA_REGION = {
      id: null as string | null,
      code: 'TANPA-REGION',
      name: 'Tanpa Region',
      display_path: 'Tanpa Region',
    };

    // --- regions_summary ---
    // Group by region_id once and fan back out across `areaRows` so areas with
    // zero invoices still render — `regionsRowsRaw` only includes regions that
    // have at least one invoice.
    const summaryRowsRaw = await this.invoicesRepo.query(
      `
      SELECT
        inv.region_id AS region_id,
        COUNT(DISTINCT inv.id)::int AS invoice_count,
        COUNT(li.id)::int AS total_line_items,
        COALESCE(AVG(li.confidence_score), 0)::float AS avg_confidence,
        CASE WHEN COUNT(li.id) = 0 THEN 0
             ELSE (COUNT(li.id) FILTER (WHERE li.needs_review = true))::float
                  / COUNT(li.id)::float
        END AS needs_review_rate
      FROM taro_invoices inv
      LEFT JOIN taro_invoice_line_items li ON li.invoice_id = inv.id
      ${regionId ? 'WHERE inv.region_id = $1' : ''}
      GROUP BY inv.region_id
      `,
      regionId ? [regionId] : [],
    );
    const summaryByRegion = new Map<string | null, {
      invoice_count: number;
      total_line_items: number;
      avg_confidence: number;
      needs_review_rate: number;
    }>();
    for (const r of summaryRowsRaw as Array<{
      region_id: string | null;
      invoice_count: number;
      total_line_items: number;
      avg_confidence: number;
      needs_review_rate: number;
    }>) {
      summaryByRegion.set(r.region_id, {
        invoice_count: Number(r.invoice_count ?? 0),
        total_line_items: Number(r.total_line_items ?? 0),
        avg_confidence: Number(r.avg_confidence ?? 0),
        needs_review_rate: Number(r.needs_review_rate ?? 0),
      });
    }

    type RegionSummaryRow = {
      region: { id: string | null; code: string; name: string; display_path: string };
      invoice_count: number;
      total_line_items: number;
      avg_confidence: number;
      needs_review_rate: number;
    };
    const regionsSummary: RegionSummaryRow[] = areaRows.map((r) => {
      const agg = summaryByRegion.get(r.id) ?? {
        invoice_count: 0,
        total_line_items: 0,
        avg_confidence: 0,
        needs_review_rate: 0,
      };
      return {
        region: { id: r.id, code: r.code, name: r.name, display_path: r.display_path },
        invoice_count: agg.invoice_count,
        total_line_items: agg.total_line_items,
        avg_confidence: agg.avg_confidence,
        needs_review_rate: agg.needs_review_rate,
      };
    });
    // Append "Tanpa Region" bucket only in global scope.
    if (!regionId) {
      const tanpa = summaryByRegion.get(null);
      regionsSummary.push({
        region: TANPA_REGION,
        invoice_count: tanpa?.invoice_count ?? 0,
        total_line_items: tanpa?.total_line_items ?? 0,
        avg_confidence: tanpa?.avg_confidence ?? 0,
        needs_review_rate: tanpa?.needs_review_rate ?? 0,
      });
    }
    regionsSummary.sort((a, b) => b.invoice_count - a.invoice_count);

    // --- region_monthly: last 6 months, one row per region with >0 invoices ---
    const monthlyRows = await this.invoicesRepo.query(
      `
      SELECT
        inv.region_id AS region_id,
        to_char(date_trunc('month', inv.uploaded_at), 'YYYY-MM') AS month,
        COUNT(*)::int AS invoices
      FROM taro_invoices inv
      WHERE inv.uploaded_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        ${regionId ? 'AND inv.region_id = $1' : ''}
      GROUP BY inv.region_id, date_trunc('month', inv.uploaded_at)
      ORDER BY inv.region_id NULLS LAST, date_trunc('month', inv.uploaded_at) ASC
      `,
      regionId ? [regionId] : [],
    );

    // Build last-6-months window labels (oldest first) so frontend gets a
    // contiguous series even where some months are empty.
    const monthLabels: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      monthLabels.push(`${yyyy}-${mm}`);
    }

    const monthlyByRegion = new Map<string | null, Map<string, number>>();
    for (const r of monthlyRows as Array<{
      region_id: string | null;
      month: string;
      invoices: number;
    }>) {
      const key = r.region_id;
      const inner = monthlyByRegion.get(key) ?? new Map<string, number>();
      inner.set(r.month, Number(r.invoices));
      monthlyByRegion.set(key, inner);
    }

    const regionByIdLookup = new Map<string, typeof areaRows[number]>();
    for (const a of areaRows) regionByIdLookup.set(a.id, a);

    const regionMonthly: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      months: Array<{ month: string; invoices: number }>;
    }> = [];

    // Iterate using summary order (already sorted by invoice_count desc) so the
    // heaviest region surfaces first.
    for (const s of regionsSummary) {
      if (s.invoice_count === 0) continue;
      const key = s.region.id;
      const inner = monthlyByRegion.get(key) ?? new Map<string, number>();
      regionMonthly.push({
        region: s.region,
        months: monthLabels.map((m) => ({ month: m, invoices: inner.get(m) ?? 0 })),
      });
    }

    // --- top_skus_by_region: top 5 SKUs per region (regions with >0 invoices) ---
    const topByRegionRows = await this.invoicesRepo.query(
      `
      SELECT region_id, sku_code, sku_name, sku_category, line_count
      FROM (
        SELECT
          inv.region_id AS region_id,
          sku.code AS sku_code,
          sku.name AS sku_name,
          sku.catalog_category AS sku_category,
          COUNT(*)::int AS line_count,
          ROW_NUMBER() OVER (
            PARTITION BY inv.region_id
            ORDER BY COUNT(*) DESC, sku.code ASC
          ) AS rn
        FROM taro_invoice_line_items li
        INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
        INNER JOIN taco_skus sku ON sku.id = li.matched_sku_id
        ${regionId ? 'WHERE inv.region_id = $1' : ''}
        GROUP BY inv.region_id, sku.code, sku.name, sku.catalog_category
      ) ranked
      WHERE rn <= 5
      ORDER BY region_id NULLS LAST, line_count DESC
      `,
      regionId ? [regionId] : [],
    );
    const topByRegionMap = new Map<string | null, Array<{
      sku: { code: string; name: string; category: string | null };
      count: number;
    }>>();
    for (const r of topByRegionRows as Array<{
      region_id: string | null;
      sku_code: string;
      sku_name: string;
      sku_category: string | null;
      line_count: number;
    }>) {
      const list = topByRegionMap.get(r.region_id) ?? [];
      list.push({
        sku: { code: r.sku_code, name: r.sku_name, category: r.sku_category },
        count: Number(r.line_count),
      });
      topByRegionMap.set(r.region_id, list);
    }
    const topSkusByRegion: Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      top_skus: Array<{ sku: { code: string; name: string; category: string | null }; count: number }>;
    }> = [];
    for (const s of regionsSummary) {
      if (s.invoice_count === 0) continue;
      const skus = topByRegionMap.get(s.region.id) ?? [];
      if (skus.length === 0) continue;
      topSkusByRegion.push({ region: s.region, top_skus: skus });
    }

    // --- region_price_extremes ---
    // When scoped to a single region, cross-region price comparison is by
    // definition empty.
    let regionPriceExtremes: Array<{
      sku: { code: string; name: string; category: string | null };
      region: { id: string | null; code: string; name: string; display_path: string };
      avg_price: number;
      is_min: boolean;
      is_max: boolean;
    }> = [];

    if (!regionId) {
      const priceRows = await this.invoicesRepo.query(
        `
        WITH per_sku_region AS (
          SELECT
            sku.id AS sku_id,
            sku.code AS sku_code,
            sku.name AS sku_name,
            sku.catalog_category AS sku_category,
            inv.region_id AS region_id,
            AVG(li.unit_price)::float AS avg_price
          FROM taro_invoice_line_items li
          INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
          INNER JOIN taco_skus sku ON sku.id = li.matched_sku_id
          WHERE inv.region_id IS NOT NULL
            AND li.unit_price IS NOT NULL
            AND li.unit_price > 0
          GROUP BY sku.id, sku.code, sku.name, sku.catalog_category, inv.region_id
        ),
        spreads AS (
          SELECT
            sku_id,
            COUNT(DISTINCT region_id) AS region_count,
            MAX(avg_price) - MIN(avg_price) AS spread
          FROM per_sku_region
          GROUP BY sku_id
          HAVING COUNT(DISTINCT region_id) >= 2
        ),
        top_spreads AS (
          SELECT sku_id, spread
          FROM spreads
          ORDER BY spread DESC
          LIMIT 10
        )
        SELECT psr.sku_id, psr.sku_code, psr.sku_name, psr.sku_category,
               psr.region_id, psr.avg_price, ts.spread
        FROM per_sku_region psr
        INNER JOIN top_spreads ts ON ts.sku_id = psr.sku_id
        ORDER BY ts.spread DESC, psr.sku_code, psr.avg_price ASC
        `,
        [],
      );

      // Group by sku_id, pick min + max region for each, emit two rows per SKU.
      const bySku = new Map<string, Array<{
        sku_code: string;
        sku_name: string;
        sku_category: string | null;
        region_id: string | null;
        avg_price: number;
      }>>();
      for (const r of priceRows as Array<{
        sku_id: string;
        sku_code: string;
        sku_name: string;
        sku_category: string | null;
        region_id: string | null;
        avg_price: number;
        spread: number;
      }>) {
        const list = bySku.get(r.sku_id) ?? [];
        list.push({
          sku_code: r.sku_code,
          sku_name: r.sku_name,
          sku_category: r.sku_category,
          region_id: r.region_id,
          avg_price: Number(r.avg_price),
        });
        bySku.set(r.sku_id, list);
      }

      // Preserve spread ordering by tracking SKU appearance order.
      const seenOrder: string[] = [];
      for (const r of priceRows as Array<{ sku_id: string }>) {
        if (!seenOrder.includes(r.sku_id)) seenOrder.push(r.sku_id);
      }

      for (const skuId of seenOrder) {
        const rows = bySku.get(skuId) ?? [];
        if (rows.length < 2) continue;
        let minRow = rows[0];
        let maxRow = rows[0];
        for (const row of rows) {
          if (row.avg_price < minRow.avg_price) minRow = row;
          if (row.avg_price > maxRow.avg_price) maxRow = row;
        }
        const minRegion = minRow.region_id
          ? regionByIdLookup.get(minRow.region_id) ?? TANPA_REGION
          : TANPA_REGION;
        const maxRegion = maxRow.region_id
          ? regionByIdLookup.get(maxRow.region_id) ?? TANPA_REGION
          : TANPA_REGION;
        regionPriceExtremes.push({
          sku: { code: minRow.sku_code, name: minRow.sku_name, category: minRow.sku_category },
          region: {
            id: minRegion.id,
            code: minRegion.code,
            name: minRegion.name,
            display_path: minRegion.display_path,
          },
          avg_price: minRow.avg_price,
          is_min: true,
          is_max: false,
        });
        regionPriceExtremes.push({
          sku: { code: maxRow.sku_code, name: maxRow.sku_name, category: maxRow.sku_category },
          region: {
            id: maxRegion.id,
            code: maxRegion.code,
            name: maxRegion.name,
            display_path: maxRegion.display_path,
          },
          avg_price: maxRow.avg_price,
          is_min: false,
          is_max: true,
        });
      }
    }

    return {
      regions_summary: regionsSummary,
      region_monthly: regionMonthly,
      top_skus_by_region: topSkusByRegion,
      region_price_extremes: regionPriceExtremes,
    };
  }

  // ---- Failed OCR queue ----

  /**
   * Roll-up of OCR failures, grouped by exact `raw_text` so admin sees
   * "this label appeared 15 times and we never matched it". Two failure
   * shapes today:
   *   - no_match       : `matched_sku_id IS NULL`
   *   - low_confidence : `matched_sku_id` set but score < FAILED_THRESHOLD
   * (`ambiguous` is reserved for the multi-candidate case once the OCR
   * pipeline starts emitting alternates — wire is in place.)
   *
   * Pagination is over the grouped rows, not raw line items, so a single
   * page is a stable working set for the review screen.
   */
  async failedOcr(params: {
    page: number;
    limit: number;
    region_id?: string;
    agent_id?: string;
  }): Promise<{
    data: Array<{
      raw_text: string;
      failure_reason: 'no_match' | 'low_confidence' | 'ambiguous';
      occurrence_count: number;
      latest_uploaded_at: Date | null;
      last_seen_at: Date | null;
      avg_confidence: number;
      is_likely_taco: boolean;
      closest_sku_candidate: {
        id: string;
        code: string;
        name: string;
        similarity: number;
      } | null;
      regions_seen: Array<{
        region: { id: string | null; code: string; name: string; display_path: string };
        count: number;
      }>;
      agents_seen: Array<{
        agent: { id: string; name: string; email: string };
        count: number;
      }>;
      sample_line_items: Array<{
        line_item_id: string;
        invoice_id: string;
        raw_text: string;
        confidence_score: number;
        region: { id: string | null; code: string; name: string; display_path: string } | null;
        agent: { id: string | null; name: string | null; email: string | null } | null;
        uploaded_at: Date;
      }>;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const FAILED_THRESHOLD = 0.5;
    const offset = (params.page - 1) * params.limit;

    // 1. Aggregate by raw_text. Filters are inlined as parameters so the
    //    same SQL handles all four optional-scope combinations.
    const where: string[] = [
      `(li.matched_sku_id IS NULL OR li.confidence_score < $1)`,
    ];
    const args: Array<string | number> = [FAILED_THRESHOLD];

    if (params.region_id) {
      args.push(params.region_id);
      where.push(`inv.region_id = $${args.length}`);
    }
    if (params.agent_id) {
      args.push(params.agent_id);
      where.push(`inv.uploaded_by = $${args.length}`);
    }

    const whereSql = where.join(' AND ');

    const totalRow = await this.invoicesRepo.query(
      `
      SELECT COUNT(DISTINCT li.raw_text)::int AS total
      FROM taro_invoice_line_items li
      INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
      WHERE ${whereSql}
      `,
      args,
    );
    const total = Number(totalRow?.[0]?.total ?? 0);

    const groupRows = await this.invoicesRepo.query(
      `
      SELECT
        li.raw_text AS raw_text,
        COUNT(*)::int AS occurrence_count,
        MAX(inv.uploaded_at) AS latest_uploaded_at,
        COALESCE(AVG(li.confidence_score), 0)::float AS avg_confidence,
        BOOL_OR(li.matched_sku_id IS NULL) AS has_no_match,
        BOOL_OR(li.matched_sku_id IS NOT NULL AND li.confidence_score < $1) AS has_low_conf
      FROM taro_invoice_line_items li
      INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
      WHERE ${whereSql}
      GROUP BY li.raw_text
      ORDER BY occurrence_count DESC, latest_uploaded_at DESC
      OFFSET ${offset} LIMIT ${params.limit}
      `,
      args,
    );

    if (groupRows.length === 0) {
      return { data: [], total, page: params.page, limit: params.limit };
    }

    const rawTexts = (groupRows as Array<{ raw_text: string }>).map((r) => r.raw_text);

    // 2. Pull up to N sample line items per group for the admin context panel.
    //    Use ROW_NUMBER window so we cap at 3 samples / group regardless of how
    //    many invoices share the same raw_text.
    const sampleRows = await this.invoicesRepo.query(
      `
      SELECT line_item_id, invoice_id, raw_text, confidence_score, region_id,
             region_code, region_name, region_path, agent_id, agent_name,
             agent_email, uploaded_at
      FROM (
        SELECT
          li.id AS line_item_id,
          li.invoice_id AS invoice_id,
          li.raw_text AS raw_text,
          li.confidence_score::float AS confidence_score,
          inv.region_id AS region_id,
          r.code AS region_code,
          r.name AS region_name,
          r.display_path AS region_path,
          inv.uploaded_by AS agent_id,
          u.name AS agent_name,
          u.email AS agent_email,
          inv.uploaded_at AS uploaded_at,
          ROW_NUMBER() OVER (
            PARTITION BY li.raw_text
            ORDER BY inv.uploaded_at DESC
          ) AS rn
        FROM taro_invoice_line_items li
        INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
        LEFT JOIN regions r ON r.id = inv.region_id
        LEFT JOIN users u ON u.id = inv.uploaded_by
        WHERE li.raw_text = ANY($1)
          AND (li.matched_sku_id IS NULL OR li.confidence_score < $2)
      ) ranked
      WHERE rn <= 3
      ORDER BY raw_text, uploaded_at DESC
      `,
      [rawTexts, FAILED_THRESHOLD],
    );

    const samplesByText = new Map<string, Array<{
      line_item_id: string;
      invoice_id: string;
      raw_text: string;
      confidence_score: number;
      region: { id: string | null; code: string; name: string; display_path: string } | null;
      agent: { id: string | null; name: string | null; email: string | null } | null;
      uploaded_at: Date;
    }>>();
    for (const r of sampleRows as Array<{
      line_item_id: string;
      invoice_id: string;
      raw_text: string;
      confidence_score: number;
      region_id: string | null;
      region_code: string | null;
      region_name: string | null;
      region_path: string | null;
      agent_id: string | null;
      agent_name: string | null;
      agent_email: string | null;
      uploaded_at: Date;
    }>) {
      const list = samplesByText.get(r.raw_text) ?? [];
      list.push({
        line_item_id: r.line_item_id,
        invoice_id: r.invoice_id,
        raw_text: r.raw_text,
        confidence_score: Number(r.confidence_score ?? 0),
        region: r.region_id
          ? {
              id: r.region_id,
              code: r.region_code ?? '',
              name: r.region_name ?? '',
              display_path: r.region_path ?? '',
            }
          : null,
        agent: r.agent_id
          ? { id: r.agent_id, name: r.agent_name, email: r.agent_email }
          : null,
        uploaded_at: r.uploaded_at,
      });
      samplesByText.set(r.raw_text, list);
    }

    // 3. Closest-SKU hint: where any line in the group already has a
    //    `matched_sku_id` (low_confidence case), expose that SKU as the
    //    candidate with `similarity = avg(confidence)` for that pairing.
    //    For pure `no_match` groups we leave it null — RAG re-scoring is
    //    available behind the recommendations regenerate endpoint.
    const candidateRows = await this.invoicesRepo.query(
      `
      SELECT raw_text, sku_id, code, name, similarity
      FROM (
        SELECT
          li.raw_text AS raw_text,
          sku.id AS sku_id,
          sku.code AS code,
          sku.name AS name,
          AVG(li.confidence_score)::float AS similarity,
          ROW_NUMBER() OVER (
            PARTITION BY li.raw_text
            ORDER BY AVG(li.confidence_score) DESC, COUNT(*) DESC
          ) AS rn
        FROM taro_invoice_line_items li
        INNER JOIN taco_skus sku ON sku.id = li.matched_sku_id
        WHERE li.raw_text = ANY($1)
          AND li.matched_sku_id IS NOT NULL
        GROUP BY li.raw_text, sku.id, sku.code, sku.name
      ) ranked
      WHERE rn = 1
      `,
      [rawTexts],
    );
    const candidateByText = new Map<string, {
      id: string;
      code: string;
      name: string;
      similarity: number;
    }>();
    for (const r of candidateRows as Array<{
      raw_text: string;
      sku_id: string;
      code: string;
      name: string;
      similarity: number;
    }>) {
      candidateByText.set(r.raw_text, {
        id: r.sku_id,
        code: r.code,
        name: r.name,
        similarity: Number(r.similarity ?? 0),
      });
    }

    // 4. Per-raw_text region distribution (regions_seen).
    const regionDistRows = await this.invoicesRepo.query(
      `
      SELECT
        li.raw_text AS raw_text,
        inv.region_id AS region_id,
        r.code AS region_code,
        r.name AS region_name,
        r.display_path AS region_path,
        COUNT(*)::int AS count
      FROM taro_invoice_line_items li
      INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
      LEFT JOIN regions r ON r.id = inv.region_id
      WHERE li.raw_text = ANY($1)
        AND (li.matched_sku_id IS NULL OR li.confidence_score < $2)
      GROUP BY li.raw_text, inv.region_id, r.code, r.name, r.display_path
      ORDER BY count DESC
      `,
      [rawTexts, FAILED_THRESHOLD],
    );
    const regionsByText = new Map<string, Array<{
      region: { id: string | null; code: string; name: string; display_path: string };
      count: number;
    }>>();
    for (const r of regionDistRows as Array<{
      raw_text: string;
      region_id: string | null;
      region_code: string | null;
      region_name: string | null;
      region_path: string | null;
      count: number;
    }>) {
      const list = regionsByText.get(r.raw_text) ?? [];
      list.push({
        region: {
          id: r.region_id,
          code: r.region_code ?? 'TANPA-REGION',
          name: r.region_name ?? 'Tanpa Region',
          display_path: r.region_path ?? 'Tanpa Region',
        },
        count: Number(r.count),
      });
      regionsByText.set(r.raw_text, list);
    }

    // 5. Per-raw_text agent distribution (agents_seen) — only when uploaded_by
    //    is non-null; system uploads don't surface.
    const agentDistRows = await this.invoicesRepo.query(
      `
      SELECT
        li.raw_text AS raw_text,
        inv.uploaded_by AS agent_id,
        u.name AS agent_name,
        u.email AS agent_email,
        COUNT(*)::int AS count
      FROM taro_invoice_line_items li
      INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
      INNER JOIN users u ON u.id = inv.uploaded_by
      WHERE li.raw_text = ANY($1)
        AND (li.matched_sku_id IS NULL OR li.confidence_score < $2)
      GROUP BY li.raw_text, inv.uploaded_by, u.name, u.email
      ORDER BY count DESC
      `,
      [rawTexts, FAILED_THRESHOLD],
    );
    const agentsByText = new Map<string, Array<{
      agent: { id: string; name: string; email: string };
      count: number;
    }>>();
    for (const r of agentDistRows as Array<{
      raw_text: string;
      agent_id: string;
      agent_name: string;
      agent_email: string;
      count: number;
    }>) {
      const list = agentsByText.get(r.raw_text) ?? [];
      list.push({
        agent: { id: r.agent_id, name: r.agent_name, email: r.agent_email },
        count: Number(r.count),
      });
      agentsByText.set(r.raw_text, list);
    }

    const data = (groupRows as Array<{
      raw_text: string;
      occurrence_count: number;
      latest_uploaded_at: Date | null;
      avg_confidence: number;
      has_no_match: boolean;
      has_low_conf: boolean;
    }>).map((g) => {
      // failure_reason precedence: pure no_match > pure low_confidence > mixed.
      // (`ambiguous` is reserved — pipeline doesn't surface multi-candidate
      // yet.) For mixed groups we surface `low_confidence` since the admin
      // can then promote the existing candidate.
      let failureReason: 'no_match' | 'low_confidence' | 'ambiguous' = 'no_match';
      if (g.has_low_conf && !g.has_no_match) failureReason = 'low_confidence';
      else if (g.has_low_conf && g.has_no_match) failureReason = 'low_confidence';

      // is_likely_taco — similarity >= 0.6 means embedding/conf says this is
      // probably a TACO SKU that's missing a synonym. False when we have no
      // candidate at all (pure no_match without prior mapping history).
      const candidate = candidateByText.get(g.raw_text) ?? null;
      const isLikelyTaco = !!candidate && candidate.similarity >= 0.6;

      return {
        raw_text: g.raw_text,
        failure_reason: failureReason,
        occurrence_count: Number(g.occurrence_count ?? 0),
        latest_uploaded_at: g.latest_uploaded_at,
        last_seen_at: g.latest_uploaded_at,
        avg_confidence: Number(g.avg_confidence ?? 0),
        is_likely_taco: isLikelyTaco,
        closest_sku_candidate: candidate,
        regions_seen: regionsByText.get(g.raw_text) ?? [],
        agents_seen: agentsByText.get(g.raw_text) ?? [],
        sample_line_items: samplesByText.get(g.raw_text) ?? [],
      };
    });

    return { data, total, page: params.page, limit: params.limit };
  }

  /**
   * Internal helper for the Recommendations 2.0 pipeline — same grouping
   * logic as `failedOcr` but returns a flat, embedding-keyed list of the
   * top-N most-frequent failed raw_texts with their closest TACO SKU hint.
   */
  async topFailedOcrForRecommendations(limit: number): Promise<Array<{
    raw_text: string;
    occurrence_count: number;
    closest_sku_candidate: {
      id: string;
      code: string;
      name: string;
      similarity: number;
    } | null;
  }>> {
    const FAILED_THRESHOLD = 0.5;
    const groupRows = await this.invoicesRepo.query(
      `
      SELECT
        li.raw_text AS raw_text,
        COUNT(*)::int AS occurrence_count
      FROM taro_invoice_line_items li
      INNER JOIN taro_invoices inv ON inv.id = li.invoice_id
      WHERE (li.matched_sku_id IS NULL OR li.confidence_score < $1)
      GROUP BY li.raw_text
      ORDER BY occurrence_count DESC, raw_text ASC
      LIMIT $2
      `,
      [FAILED_THRESHOLD, limit],
    );
    const rawTexts = (groupRows as Array<{ raw_text: string }>).map((r) => r.raw_text);
    if (rawTexts.length === 0) return [];

    const candidateRows = await this.invoicesRepo.query(
      `
      SELECT raw_text, sku_id, code, name, similarity
      FROM (
        SELECT
          li.raw_text AS raw_text,
          sku.id AS sku_id,
          sku.code AS code,
          sku.name AS name,
          AVG(li.confidence_score)::float AS similarity,
          ROW_NUMBER() OVER (
            PARTITION BY li.raw_text
            ORDER BY AVG(li.confidence_score) DESC, COUNT(*) DESC
          ) AS rn
        FROM taro_invoice_line_items li
        INNER JOIN taco_skus sku ON sku.id = li.matched_sku_id
        WHERE li.raw_text = ANY($1)
          AND li.matched_sku_id IS NOT NULL
        GROUP BY li.raw_text, sku.id, sku.code, sku.name
      ) ranked
      WHERE rn = 1
      `,
      [rawTexts],
    );
    const byText = new Map<string, {
      id: string;
      code: string;
      name: string;
      similarity: number;
    }>();
    for (const r of candidateRows as Array<{
      raw_text: string;
      sku_id: string;
      code: string;
      name: string;
      similarity: number;
    }>) {
      byText.set(r.raw_text, {
        id: r.sku_id,
        code: r.code,
        name: r.name,
        similarity: Number(r.similarity ?? 0),
      });
    }

    return (groupRows as Array<{ raw_text: string; occurrence_count: number }>).map((g) => ({
      raw_text: g.raw_text,
      occurrence_count: Number(g.occurrence_count ?? 0),
      closest_sku_candidate: byText.get(g.raw_text) ?? null,
    }));
  }

  // ---- Image streaming ----

  imagePath(id: string): string {
    // Files are stored as `${id}${ext}` for some extension; resolve by listing.
    const matches = fs
      .readdirSync(this.uploadDir)
      .filter((f) => f.startsWith(id));
    if (matches.length === 0) {
      throw new NotFoundException(`Image for TaroInvoice ${id} not found`);
    }
    return path.join(this.uploadDir, matches[0]);
  }
}
