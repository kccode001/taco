import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Visit, VisitStatus } from '../database/entities/visit.entity';
import { VisitSection } from '../database/entities/visit-section.entity';
import { UserRole } from '../database/entities/user.entity';
import type { User } from '../database/entities/user.entity';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { VisitQueryDto } from './dto/visit-query.dto';

const REQUIRED_SECTIONS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'];

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
      .orderBy('visit.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    // Role-based filtering
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
    const visit = await this.visitsRepo
      .createQueryBuilder('visit')
      .leftJoinAndSelect('visit.store', 'store')
      .leftJoinAndSelect('visit.user', 'user')
      .leftJoinAndSelect('visit.sections', 'sections')
      .where('visit.id = :id', { id })
      .getOne();

    if (!visit) {
      throw new NotFoundException(`Visit ${id} not found`);
    }

    return visit;
  }

  async create(dto: CreateVisitDto, userId: string): Promise<Visit> {
    const visitDate = dto.visit_date || new Date().toISOString().split('T')[0];

    // Find last submitted visit for same store to pre-fill sections
    const lastVisit = await this.visitsRepo
      .createQueryBuilder('visit')
      .leftJoinAndSelect('visit.sections', 'sections')
      .where('visit.store_id = :storeId', { storeId: dto.store_id })
      .andWhere('visit.status = :status', { status: VisitStatus.SUBMITTED })
      .orderBy('visit.submitted_at', 'DESC')
      .getOne();

    // Create visit
    const visit = this.visitsRepo.create({
      store_id: dto.store_id,
      user_id: userId,
      visit_date: visitDate,
      status: VisitStatus.DRAFT,
      prior_visit_id: lastVisit?.id ?? undefined,
      changed_sections: [],
    });

    const savedVisit = await this.visitsRepo.save(visit);

    // Pre-fill sections from last submitted visit if available
    if (lastVisit && lastVisit.sections && lastVisit.sections.length > 0) {
      const prefillSections = lastVisit.sections.map((prevSection) =>
        this.sectionsRepo.create({
          visit_id: savedVisit.id,
          section_key: prevSection.section_key,
          data: { ...prevSection.data },
          prefilled_from_visit_id: lastVisit.id,
        }),
      );
      await this.sectionsRepo.save(prefillSections);
    }

    return this.findOne(savedVisit.id);
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

    // Upsert section
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

  async submit(visitId: string, userId: string): Promise<Visit> {
    return this.dataSource.transaction(async (manager) => {
      const visit = await manager
        .createQueryBuilder(Visit, 'visit')
        .leftJoinAndSelect('visit.sections', 'sections')
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
        throw new BadRequestException('Visit is already submitted');
      }

      // Validate all 10 sections are present and non-empty
      const presentSections = new Set(visit.sections.map((s) => s.section_key));
      const missingSections = REQUIRED_SECTIONS.filter((key) => !presentSections.has(key));

      if (missingSections.length > 0) {
        throw new BadRequestException(
          `Missing required sections: ${missingSections.join(', ')}`,
        );
      }

      // Compute changed_sections by comparing against prior visit data
      const changedSections: string[] = [];

      if (visit.prior_visit_id) {
        const priorSections = await manager
          .createQueryBuilder(VisitSection, 'vs')
          .where('vs.visit_id = :visitId', { visitId: visit.prior_visit_id })
          .getMany();

        const priorMap = new Map(priorSections.map((s) => [s.section_key, s.data]));

        for (const section of visit.sections) {
          const priorData = priorMap.get(section.section_key);
          if (!priorData) {
            changedSections.push(section.section_key);
          } else {
            if (JSON.stringify(section.data) !== JSON.stringify(priorData)) {
              changedSections.push(section.section_key);
            }
          }
        }
      } else {
        changedSections.push(...REQUIRED_SECTIONS);
      }

      // Atomic submit
      visit.status = VisitStatus.SUBMITTED;
      visit.submitted_at = new Date();
      visit.changed_sections = changedSections;

      const savedVisit = await manager.save(Visit, visit);

      // Trigger digest queue
      await this.digestQueue.add('process-visit', {
        visitId: savedVisit.id,
        storeId: savedVisit.store_id,
        userId: savedVisit.user_id,
        changedSections,
      });

      return savedVisit;
    });
  }
}
