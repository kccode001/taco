import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { Visit, VisitStatus } from '../database/entities/visit.entity';
import { VisitSection } from '../database/entities/visit-section.entity';
import { Store } from '../database/entities/store.entity';
import { MarketDigest } from '../database/entities/market-digest.entity';

const MODEL = 'claude-sonnet-4-6';
const MAX_WORDS = 500;

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);
  private readonly anthropic: Anthropic;

  constructor(
    @InjectRepository(Visit) private readonly visitRepo: Repository<Visit>,
    @InjectRepository(VisitSection) private readonly sectionRepo: Repository<VisitSection>,
    @InjectRepository(Store) private readonly storeRepo: Repository<Store>,
    @InjectRepository(MarketDigest) private readonly digestRepo: Repository<MarketDigest>,
    private readonly config: ConfigService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  /**
   * AC-19 — daily market digest, 17:00 WIB (Asia/Jakarta).
   * @nestjs/schedule supports tz on @Cron.
   */
  @Cron('0 0 17 * * *', { timeZone: 'Asia/Jakarta', name: 'digest.daily' })
  async scheduledGenerate(): Promise<void> {
    this.logger.log('Daily market digest cron firing (17:00 WIB)...');
    try {
      const today = todayInJakarta();
      const territories = await this.getActiveTerritoryIds(today);
      // Generate one global digest plus one per territory that had visits today.
      await this.generate({ date: today });
      for (const territoryId of territories) {
        await this.generate({ date: today, territoryId });
      }
      this.logger.log(
        `Generated ${territories.length + 1} digest row(s) for ${today}.`,
      );
    } catch (err) {
      this.logger.error('Daily digest generation failed', err);
    }
  }

  /**
   * Generate (or regenerate) a market digest for a given date.
   * Stores territory_id + source_visit_count inside `metadata` since we don't
   * own the entity schema. AC-19 acceptance fields are all captured.
   */
  async generate(opts: { date?: string; territoryId?: string } = {}): Promise<MarketDigest> {
    const date = opts.date ?? todayInJakarta();
    const territoryId = opts.territoryId ?? null;

    const qb = this.visitRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.sections', 'sections')
      .leftJoinAndSelect('v.store', 'store')
      .leftJoinAndSelect('v.user', 'user')
      .leftJoinAndSelect('v.competitors', 'competitors')
      .leftJoinAndSelect('competitors.competitor_sku', 'competitor_sku_join')
      .leftJoinAndSelect('competitors.brand', 'brand')
      .where('v.visit_date = :date', { date })
      .andWhere('v.status = :status', { status: VisitStatus.SUBMITTED });
    if (territoryId) {
      qb.andWhere('store.territory_id = :territoryId', { territoryId });
    }
    const visits = await qb.getMany();

    const sourceVisitCount = visits.length;
    let content: string;

    if (sourceVisitCount === 0) {
      content = `Tidak ada kunjungan yang ter-submit pada ${date}${
        territoryId ? ` untuk teritori ini` : ''
      }. Digest tidak tersedia.`;
    } else {
      content = await this.callClaude(date, visits, territoryId);
    }

    const existing = await this.digestRepo.findOne({
      where: { digest_date: date },
      order: { created_at: 'DESC' },
    });

    // Per-territory digests live alongside the global one — we key by (date, territory_id)
    // in metadata to avoid a schema change.
    const existingMatchesScope =
      existing &&
      (existing.metadata?.territory_id ?? null) === territoryId;

    if (existingMatchesScope) {
      existing!.content = content;
      existing!.metadata = {
        ...(existing!.metadata ?? {}),
        territory_id: territoryId,
        source_visit_count: sourceVisitCount,
        generated_at: new Date().toISOString(),
        model: MODEL,
      };
      return this.digestRepo.save(existing!);
    }

    return this.digestRepo.save(
      this.digestRepo.create({
        digest_date: date,
        content,
        metadata: {
          territory_id: territoryId,
          source_visit_count: sourceVisitCount,
          generated_at: new Date().toISOString(),
          model: MODEL,
        },
      }),
    );
  }

  async getDaily(opts: { date?: string; territoryId?: string }): Promise<MarketDigest | null> {
    const date = opts.date ?? todayInJakarta();
    const territoryId = opts.territoryId ?? null;

    const candidates = await this.digestRepo.find({
      where: { digest_date: date },
      order: { created_at: 'DESC' },
    });
    return (
      candidates.find(
        (d) => (d.metadata?.territory_id ?? null) === territoryId,
      ) ?? null
    );
  }

  getLatest(): Promise<MarketDigest | null> {
    return this.digestRepo.findOne({ order: { created_at: 'DESC' }, where: {} });
  }

  // ---- internals ----

  private async callClaude(
    date: string,
    visits: Visit[],
    territoryId: string | null,
  ): Promise<string> {
    if (!process.env.ANTHROPIC_API_KEY) {
      return `[Gagal: ANTHROPIC_API_KEY belum dikonfigurasi pada ${date}]`;
    }

    const prompt = this.buildPrompt(date, visits, territoryId);
    try {
      const response = await this.anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = response.content[0];
      const text = block.type === 'text' ? block.text : '';
      return capWords(text, MAX_WORDS);
    } catch (err) {
      this.logger.error('Claude digest call failed', err);
      return `[Gagal menghasilkan digest untuk ${date}: ${(err as Error).message}]`;
    }
  }

  private buildPrompt(date: string, visits: Visit[], territoryId: string | null): string {
    const scope = territoryId ? `teritori ${territoryId}` : 'seluruh wilayah';

    const competitors = visits.flatMap((v) =>
      (v.competitors ?? []).map((c) => ({
        store: v.store?.name ?? 'Toko',
        brand: (c as any).brand?.name ?? null,
        sku: (c as any).competitor_sku?.name ?? null,
      })),
    );

    const sectionDump = visits
      .flatMap((v) =>
        (v.sections ?? []).map((s) => ({
          store: v.store?.name ?? 'Toko',
          key: s.section_key,
          data: s.data,
        })),
      )
      .slice(0, 40);

    const compLine = competitors.length
      ? competitors
          .slice(0, 30)
          .map(
            (c, i) =>
              `  ${i + 1}. [${c.store}] brand=${c.brand ?? '?'} sku=${c.sku ?? '?'}`,
          )
          .join('\n')
      : '  (tidak ada data kompetitor)';

    const sectionLines = sectionDump.length
      ? sectionDump
          .map(
            (s, i) =>
              `  ${i + 1}. [${s.store}] ${s.key}: ${JSON.stringify(s.data).slice(0, 200)}`,
          )
          .join('\n')
      : '  (tidak ada section)';

    return `Kamu adalah analis intelijen pasar TACO, produsen material bangunan Indonesia.

Tanggal: ${date}. Cakupan: ${scope}. Tim sales menyelesaikan ${visits.length} kunjungan ter-submit.

DATA KOMPETITOR (brand + SKU yang ditemukan):
${compLine}

DATA SECTION KUNJUNGAN (jsonb per section):
${sectionLines}

---

Tulis Digest Pasar Harian dalam Bahasa Indonesia, MAKSIMAL ${MAX_WORDS} kata, struktur 4 paragraf:

1. **Ancaman Kompetitor** — sebut nama brand/SKU spesifik yang muncul; soroti harga atau promo agresif.
2. **Pola Permintaan** — produk TACO apa yang paling dicari; ada kategori naik/turun?
3. **Sentimen Toko** — suasana pemilik toko (keluhan, apresiasi, sinyal proyek).
4. **Rekomendasi Tindakan** — satu langkah konkret yang harus diambil tim sales/manajemen besok.

Wajib menyebut minimal satu brand kompetitor secara eksplisit. Akhiri dengan baris "Rekomendasi: ...".`;
  }

  private async getActiveTerritoryIds(date: string): Promise<string[]> {
    const rows = await this.visitRepo
      .createQueryBuilder('v')
      .leftJoin('v.store', 'store')
      .select('DISTINCT store.territory_id', 'territory_id')
      .where('v.visit_date = :date', { date })
      .andWhere('v.status = :status', { status: VisitStatus.SUBMITTED })
      .andWhere('store.territory_id IS NOT NULL')
      .getRawMany<{ territory_id: string }>();
    return rows.map((r) => r.territory_id).filter(Boolean);
  }
}

function todayInJakarta(): string {
  // ISO date in Asia/Jakarta TZ. WIB = UTC+7, no DST.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()); // en-CA → YYYY-MM-DD
}

function capWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text.trim();
  return words.slice(0, max).join(' ') + '…';
}
