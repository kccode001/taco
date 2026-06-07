import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { Visit, VisitStatus } from '../database/entities/visit.entity';
import { VisitSection } from '../database/entities/visit-section.entity';
import { MarketDigest } from '../database/entities/market-digest.entity';

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);
  private readonly anthropic: Anthropic;

  constructor(
    @InjectRepository(Visit)
    private readonly visitRepo: Repository<Visit>,
    @InjectRepository(VisitSection)
    private readonly sectionRepo: Repository<VisitSection>,
    @InjectRepository(MarketDigest)
    private readonly digestRepo: Repository<MarketDigest>,
    private readonly config: ConfigService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  /** Cron: every day at 10:00 UTC = 17:00 WIB */
  @Cron('0 0 10 * * *')
  async scheduledGenerate(): Promise<void> {
    this.logger.log('Running scheduled market digest generation...');
    try {
      await this.generate();
      this.logger.log('Market digest generated successfully.');
    } catch (err) {
      this.logger.error('Failed to generate market digest', err);
    }
  }

  /**
   * Aggregate today's submitted visits, extract key sections, call Claude,
   * save and return the digest.
   */
  async generate(): Promise<MarketDigest> {
    const today = new Date().toISOString().split('T')[0];

    // Fetch all submitted visits for today with their sections
    const visits = await this.visitRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.sections', 'sections')
      .leftJoinAndSelect('v.store', 'store')
      .leftJoinAndSelect('v.user', 'user')
      .where('v.visit_date = :today', { today })
      .andWhere('v.status = :status', { status: VisitStatus.SUBMITTED })
      .getMany();

    const totalVisits = visits.length;

    if (totalVisits === 0) {
      this.logger.warn(`No submitted visits found for ${today}, skipping digest.`);
      // Return existing latest or create empty placeholder
      const existing = await this.getLatest();
      if (existing) return existing;
    }

    // Extract sections by key
    const demandSignals: any[] = [];   // S9
    const ownerSentiments: any[] = []; // S10
    const competitorIntels: any[] = []; // S8

    for (const visit of visits) {
      const storeName = visit.store?.name ?? 'Unknown Store';
      for (const section of visit.sections ?? []) {
        const entry = { store: storeName, data: section.data };
        if (section.section_key === 'S9') demandSignals.push(entry);
        if (section.section_key === 'S10') ownerSentiments.push(entry);
        if (section.section_key === 'S8') competitorIntels.push(entry);
      }
    }

    const prompt = this.buildPrompt({
      today,
      totalVisits,
      demandSignals,
      ownerSentiments,
      competitorIntels,
    });

    let content = '';
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const block = response.content[0];
      if (block.type === 'text') {
        content = block.text;
      }
    } catch (err) {
      this.logger.error('Claude API call failed', err);
      content = `[Gagal menghasilkan digest untuk ${today}: ${(err as Error).message}]`;
    }

    const digest = this.digestRepo.create({
      content,
      digest_date: today,
      metadata: {
        total_visits: totalVisits,
        demand_signals_count: demandSignals.length,
        owner_sentiments_count: ownerSentiments.length,
        competitor_intels_count: competitorIntels.length,
        generated_at: new Date().toISOString(),
      },
    });

    return this.digestRepo.save(digest);
  }

  getLatest(): Promise<MarketDigest | null> {
    return this.digestRepo.findOne({
      order: { created_at: 'DESC' },
      where: {},
    });
  }

  private buildPrompt(params: {
    today: string;
    totalVisits: number;
    demandSignals: any[];
    ownerSentiments: any[];
    competitorIntels: any[];
  }): string {
    const { today, totalVisits, demandSignals, ownerSentiments, competitorIntels } = params;

    const formatSection = (label: string, items: any[]): string => {
      if (items.length === 0) return `${label}: Tidak ada data.`;
      const entries = items
        .slice(0, 20) // limit to avoid huge prompts
        .map((item, i) => `  ${i + 1}. [${item.store}] ${JSON.stringify(item.data)}`)
        .join('\n');
      return `${label} (${items.length} entri):\n${entries}`;
    };

    return `Kamu adalah analis intelijen pasar untuk perusahaan TACO, produsen material bangunan.

Hari ini adalah ${today}. Tim sales TACO telah menyelesaikan ${totalVisits} kunjungan toko dan mengumpulkan data lapangan berikut:

${formatSection('SINYAL PERMINTAAN PASAR (S9 - Demand Signals)', demandSignals)}

${formatSection('SENTIMEN PEMILIK TOKO (S10 - Owner Sentiment)', ownerSentiments)}

${formatSection('INTELIJEN KOMPETITOR (S8 - Competitor Intel)', competitorIntels)}

---

Berdasarkan data di atas, buatlah ringkasan intelijen pasar harian dalam Bahasa Indonesia, maksimal 500 kata. Struktur ringkasan:

1. **Ancaman Kompetitor** — Merek/produk kompetitor apa yang paling banyak ditemukan? Ada yang harga agresif atau promosi khusus?
2. **Pola Permintaan** — Produk TACO apa yang paling banyak dicari? Ada kategori yang sedang tren naik/turun?
3. **Sentimen Toko** — Bagaimana suasana umum pemilik toko hari ini? Ada keluhan atau apresiasi khusus?
4. **Rekomendasi Tindakan** — Satu atau dua langkah konkret yang disarankan untuk tim sales atau manajemen berdasarkan temuan hari ini.

Tulis dengan ringkas, padat, dan actionable. Hindari jargon teknis yang tidak perlu.`;
  }
}
