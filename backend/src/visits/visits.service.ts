import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import {
  Visit,
  VisitStatus,
  VisitSubmissionMethod,
} from '../database/entities/visit.entity';
import { VisitSection } from '../database/entities/visit-section.entity';
import { VisitTacoSku } from '../database/entities/visit-taco-sku.entity';
import { VisitStockLevel } from '../database/entities/visit-stock-level.entity';
import { VisitPosm } from '../database/entities/visit-posm.entity';
import { VisitCompetitor } from '../database/entities/visit-competitor.entity';
import { VisitCompetitorSku } from '../database/entities/visit-competitor-sku.entity';
import { VisitCompetitorPromo } from '../database/entities/visit-competitor-promo.entity';
import { VisitCompetitorPosm } from '../database/entities/visit-competitor-posm.entity';
import { VisitBurningQuestion } from '../database/entities/visit-burning-question.entity';
import { VisitSinyalToko } from '../database/entities/visit-sinyal-toko.entity';
import { Pic } from '../database/entities/pic.entity';
import { VisitContext } from '../database/entities/visit-context.entity';
import { UserRole } from '../database/entities/user.entity';
import type { User } from '../database/entities/user.entity';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { VisitQueryDto } from './dto/visit-query.dto';

@Injectable()
export class VisitsService {
  constructor(
    @InjectRepository(Visit)
    private readonly visitsRepo: Repository<Visit>,
    @InjectRepository(VisitSection)
    private readonly sectionsRepo: Repository<VisitSection>,
    @InjectQueue('digest')
    private readonly digestQueue: Queue,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: VisitQueryDto, user: User): Promise<{ data: Visit[]; total: number }> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const qb = this.visitsRepo
      .createQueryBuilder('visit')
      .leftJoinAndSelect('visit.store', 'store')
      .leftJoinAndSelect('visit.user', 'user')
      .leftJoinAndSelect('visit.visit_objective', 'visit_objective')
      .orderBy('visit.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (user.role === UserRole.REP) {
      qb.andWhere('visit.user_id = :userId', { userId: user.id });
    }

    if (query.date) {
      qb.andWhere('visit.visit_date = :date', { date: query.date });
    }

    if (query.store_id) {
      qb.andWhere('visit.store_id = :storeId', { storeId: query.store_id });
    }

    if (query.status) {
      qb.andWhere('visit.status = :status', { status: query.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Visit> {
    const visit = await this.visitsRepo.findOne({
      where: { id },
      relations: {
        store: { territory: true },
        user: true,
        visit_objective: true,
        pics: true,
        contexts: true,
        sections: true,
        taco_skus: { taco_sku: true },
        stock_levels: true,
        posms: { posm_asset: true },
        competitors: {
          competitor_brand: true,
          skus: { competitor_sku: true },
          promos: true,
          posms: true,
        },
        burning_question_answers: { burning_question: true },
        sinyal_tokos: true,
      },
    });

    if (!visit) {
      throw new NotFoundException(`Visit ${id} not found`);
    }

    return visit;
  }

  /**
   * Create a v9 visit. Atomic: all child rows + relations land or none do (AC-13).
   * Idempotency: an `idempotency_key` (body field or `Idempotency-Key` header)
   * de-dupes retries (AC-14). If a visit with the same key exists, return it.
   */
  async create(
    dto: CreateVisitDto,
    userId: string,
    idempotencyKeyHeader?: string,
  ): Promise<Visit> {
    const idempotencyKey = dto.idempotency_key || idempotencyKeyHeader || null;

    if (idempotencyKey) {
      const existing = await this.visitsRepo.findOne({
        where: { idempotency_key: idempotencyKey },
      });
      if (existing) {
        return this.findOne(existing.id);
      }
    }

    const visitDate = dto.visit_date || new Date().toISOString().split('T')[0];

    const lastVisit = await this.visitsRepo
      .createQueryBuilder('visit')
      .where('visit.store_id = :storeId', { storeId: dto.store_id })
      .andWhere('visit.status = :status', { status: VisitStatus.SUBMITTED })
      .orderBy('visit.submitted_at', 'DESC')
      .getOne();

    const submit = dto.submit === true;

    try {
      const createdVisit = await this.dataSource.transaction(async (manager) => {
        const visit = manager.create(Visit, {
          store_id: dto.store_id,
          user_id: userId,
          visit_date: visitDate,
          status: submit ? VisitStatus.SUBMITTED : VisitStatus.DRAFT,
          prior_visit_id: lastVisit?.id ?? undefined,
          changed_sections: [],
          visit_objective_id: dto.visit_objective_id,
          notable_things: dto.notable_things,
          notable_audio_url: dto.notable_audio_url,
          data_source: dto.data_source,
          data_source_note: dto.data_source_note,
          submission_method:
            dto.submission_method ?? VisitSubmissionMethod.MANUAL,
          voice_recording_url: dto.voice_recording_url,
          voice_transcript: dto.voice_transcript,
          voice_ai_summary: dto.voice_ai_summary,
          idempotency_key: idempotencyKey ?? undefined,
          submitted_at: submit ? new Date() : undefined,
        });

        const saved = await manager.save(Visit, visit);

        if (dto.pic_ids?.length) {
          const pics = await manager.find(Pic, { where: { id: In(dto.pic_ids) } });
          if (pics.length !== dto.pic_ids.length) {
            throw new BadRequestException('Unknown pic_id supplied');
          }
          saved.pics = pics;
          await manager.save(Visit, saved);
        }

        if (dto.context_ids?.length) {
          const ctxs = await manager.find(VisitContext, {
            where: { id: In(dto.context_ids) },
          });
          if (ctxs.length !== dto.context_ids.length) {
            throw new BadRequestException('Unknown context_id supplied');
          }
          saved.contexts = ctxs;
          await manager.save(Visit, saved);
        }

        if (dto.taco_skus?.length) {
          const rows = dto.taco_skus.map((t) =>
            manager.create(VisitTacoSku, { visit_id: saved.id, ...t }),
          );
          await manager.save(VisitTacoSku, rows);
        }

        if (dto.stock_levels?.length) {
          const rows = dto.stock_levels.map((s) =>
            manager.create(VisitStockLevel, { visit_id: saved.id, ...s }),
          );
          await manager.save(VisitStockLevel, rows);
        }

        if (dto.posms?.length) {
          const rows = dto.posms.map((p) =>
            manager.create(VisitPosm, { visit_id: saved.id, ...p }),
          );
          await manager.save(VisitPosm, rows);
        }

        if (dto.competitors?.length) {
          for (const c of dto.competitors) {
            const competitor = manager.create(VisitCompetitor, {
              visit_id: saved.id,
              competitor_brand_id: c.competitor_brand_id,
            });
            const savedComp = await manager.save(VisitCompetitor, competitor);

            if (c.skus?.length) {
              const skuRows = c.skus.map((s) =>
                manager.create(VisitCompetitorSku, {
                  visit_competitor_id: savedComp.id,
                  ...s,
                }),
              );
              await manager.save(VisitCompetitorSku, skuRows);
            }

            if (c.promos?.length) {
              const promoRows = c.promos.map((p) =>
                manager.create(VisitCompetitorPromo, {
                  visit_competitor_id: savedComp.id,
                  ...p,
                }),
              );
              await manager.save(VisitCompetitorPromo, promoRows);
            }

            if (c.posms?.length) {
              const posmRows = c.posms.map((p) =>
                manager.create(VisitCompetitorPosm, {
                  visit_competitor_id: savedComp.id,
                  ...p,
                }),
              );
              await manager.save(VisitCompetitorPosm, posmRows);
            }
          }
        }

        if (dto.burning_questions?.length) {
          const rows = dto.burning_questions.map((bq) =>
            manager.create(VisitBurningQuestion, { visit_id: saved.id, ...bq }),
          );
          await manager.save(VisitBurningQuestion, rows);
        }

        if (dto.sinyal_toko) {
          const sinyal = manager.create(VisitSinyalToko, {
            visit_id: saved.id,
            ...dto.sinyal_toko,
          });
          await manager.save(VisitSinyalToko, sinyal);
        }

        if (submit && lastVisit) {
          saved.changed_sections = this.computeChangedSections(saved.id, lastVisit.id);
        } else if (submit) {
          saved.changed_sections = [
            'info',
            'data_taco',
            'kompetitor',
            'sinyal_pasar',
          ];
        }
        await manager.save(Visit, saved);

        return saved;
      });

      if (submit) {
        await this.digestQueue.add('process-visit', {
          visitId: createdVisit.id,
          storeId: createdVisit.store_id,
          userId: createdVisit.user_id,
          changedSections: createdVisit.changed_sections,
        });
      }

      return this.findOne(createdVisit.id);
    } catch (err: any) {
      // Postgres unique violation on idempotency_key — race condition; return the winner.
      if (err?.code === '23505' && idempotencyKey) {
        const winner = await this.visitsRepo.findOne({
          where: { idempotency_key: idempotencyKey },
        });
        if (winner) return this.findOne(winner.id);
      }
      throw err;
    }
  }

  private computeChangedSections(_visitId: string, _priorVisitId: string): string[] {
    // Section-level delta is implementation-defined for v9 payload shape.
    // For demo, treat every group as changed when prior exists; the dashboard
    // drawer surfaces deltas via per-row comparison anyway.
    return ['info', 'data_taco', 'kompetitor', 'sinyal_pasar'];
  }

  async updateSection(
    visitId: string,
    sectionKey: string,
    dto: UpdateSectionDto,
    userId: string,
  ): Promise<VisitSection> {
    const visit = await this.visitsRepo.findOne({ where: { id: visitId } });

    if (!visit) {
      throw new NotFoundException(`Visit ${visitId} not found`);
    }

    if (visit.user_id !== userId) {
      throw new ForbiddenException('You can only update your own visits');
    }

    if (visit.status === VisitStatus.SUBMITTED) {
      throw new BadRequestException('Cannot update sections of a submitted visit');
    }

    let section = await this.sectionsRepo.findOne({
      where: { visit_id: visitId, section_key: sectionKey },
    });

    if (section) {
      section.data = dto.data;
      return this.sectionsRepo.save(section);
    } else {
      section = this.sectionsRepo.create({
        visit_id: visitId,
        section_key: sectionKey,
        data: dto.data,
        prefilled_from_visit_id: undefined,
      });
      return this.sectionsRepo.save(section);
    }
  }

  /**
   * Submit a previously-drafted visit. Atomic flip + digest enqueue.
   * v9 payload shape relies on POST /api/visits for a single-shot atomic create+submit
   * — this path remains for the draft-then-submit pattern.
   */
  async submit(visitId: string, userId: string): Promise<Visit> {
    return this.dataSource.transaction(async (manager) => {
      const visit = await manager
        .createQueryBuilder(Visit, 'visit')
        .where('visit.id = :id', { id: visitId })
        .setLock('pessimistic_write')
        .getOne();

      if (!visit) {
        throw new NotFoundException(`Visit ${visitId} not found`);
      }

      if (visit.user_id !== userId) {
        throw new ForbiddenException('You can only submit your own visits');
      }

      if (visit.status === VisitStatus.SUBMITTED) {
        throw new ConflictException('Visit is already submitted');
      }

      visit.status = VisitStatus.SUBMITTED;
      visit.submitted_at = new Date();

      const saved = await manager.save(Visit, visit);

      await this.digestQueue.add('process-visit', {
        visitId: saved.id,
        storeId: saved.store_id,
        userId: saved.user_id,
        changedSections: saved.changed_sections,
      });

      return saved;
    });
  }
}
