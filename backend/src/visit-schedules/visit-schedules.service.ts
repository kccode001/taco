import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import {
  VisitSchedule,
  VisitScheduleFrequency,
} from '../database/entities/visit-schedule.entity';
import { User, UserRole } from '../database/entities/user.entity';
import { Visit, VisitStatus } from '../database/entities/visit.entity';
import { Territory } from '../database/entities/territory.entity';
import { CreateVisitScheduleDto } from './dto/create-visit-schedule.dto';
import { UpdateVisitScheduleDto } from './dto/update-visit-schedule.dto';
import { VisitScheduleQueryDto } from './dto/visit-schedule-query.dto';
import {
  PlannedVisit,
  formatLocalDate,
  resolveSchedulesForRange,
  weekRange,
} from './recurrence';

export type PlannedVisitStatus = 'planned' | 'visited' | 'missed';

export interface ResolvedPlannedVisit {
  schedule_id: string;
  store: {
    id: string;
    code: string;
    name: string;
    address: string | null;
  };
  frequency: VisitScheduleFrequency;
  scheduled_for: string;
  status: PlannedVisitStatus;
  visit_id: string | null;
}

@Injectable()
export class VisitSchedulesService {
  constructor(
    @InjectRepository(VisitSchedule)
    private readonly schedulesRepo: Repository<VisitSchedule>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Visit)
    private readonly visitsRepo: Repository<Visit>,
    @InjectRepository(Territory)
    private readonly territoriesRepo: Repository<Territory>,
  ) {}

  // ---------- Admin CRUD ----------

  async findAll(query: VisitScheduleQueryDto): Promise<VisitSchedule[]> {
    const qb = this.schedulesRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.sales_staff', 'sales_staff')
      .leftJoinAndSelect('s.store', 'store')
      .orderBy('s.created_at', 'DESC');

    if (query.sales_staff_id) {
      qb.andWhere('s.sales_staff_id = :ssid', { ssid: query.sales_staff_id });
    }
    if (query.store_id) {
      qb.andWhere('s.store_id = :sid', { sid: query.store_id });
    }
    if (query.frequency) {
      qb.andWhere('s.frequency = :f', { f: query.frequency });
    }
    if (query.active !== undefined) {
      qb.andWhere('s.active = :a', { a: query.active });
    }

    const rows = await qb.getMany();
    return rows.map((r) => this.sanitize(r));
  }

  async findOne(id: string): Promise<VisitSchedule> {
    const schedule = await this.schedulesRepo.findOne({
      where: { id },
      relations: { sales_staff: true, store: true },
    });
    if (!schedule) {
      throw new NotFoundException(`Visit schedule ${id} not found`);
    }
    return this.sanitize(schedule);
  }

  /**
   * Drop password hash + refresh token from the nested sales_staff payload.
   * Belt-and-braces — the entity doesn't use class-transformer @Exclude.
   */
  private sanitize(s: VisitSchedule): VisitSchedule {
    if (s.sales_staff) {
      const { password_hash, refresh_token_hash, ...safe } = s.sales_staff as any;
      s.sales_staff = safe;
    }
    return s;
  }

  async create(dto: CreateVisitScheduleDto): Promise<VisitSchedule> {
    await this.assertRepExists(dto.sales_staff_id);

    const frequency = dto.frequency;
    const payload: Partial<VisitSchedule> = {
      sales_staff_id: dto.sales_staff_id,
      store_id: dto.store_id,
      frequency,
      start_date: dto.start_date ?? formatLocalDate(new Date()),
      end_date: dto.end_date ?? null,
      one_time_date: dto.one_time_date ?? null,
      weekly_days: dto.weekly_days ?? null,
      monthly_day: dto.monthly_day ?? null,
      active: dto.active ?? true,
      notes: dto.notes ?? null,
    };

    this.assertFrequencyShape(payload as VisitSchedule);

    const existing = await this.schedulesRepo.findOne({
      where: { store_id: dto.store_id },
    });
    if (existing) {
      throw new ConflictException(
        `Store ${dto.store_id} already has a visit schedule (id=${existing.id}). Delete or reassign first.`,
      );
    }

    const created = this.schedulesRepo.create(payload);
    const saved = await this.schedulesRepo.save(created);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateVisitScheduleDto): Promise<VisitSchedule> {
    const current = await this.findOne(id);

    if (dto.sales_staff_id && dto.sales_staff_id !== current.sales_staff_id) {
      await this.assertRepExists(dto.sales_staff_id);
    }

    if (dto.store_id && dto.store_id !== current.store_id) {
      const clash = await this.schedulesRepo.findOne({
        where: { store_id: dto.store_id },
      });
      if (clash) {
        throw new ConflictException(
          `Store ${dto.store_id} already has a visit schedule (id=${clash.id}).`,
        );
      }
    }

    // Merge then re-validate shape.
    const merged: VisitSchedule = {
      ...current,
      ...dto,
    } as VisitSchedule;

    // If frequency changed, null out fields that don't belong on the new freq
    // unless the caller explicitly set them in this request.
    if (dto.frequency && dto.frequency !== current.frequency) {
      if (!('one_time_date' in dto)) merged.one_time_date = null;
      if (!('weekly_days' in dto)) merged.weekly_days = null;
      if (!('monthly_day' in dto)) merged.monthly_day = null;
    }

    this.assertFrequencyShape(merged);

    await this.schedulesRepo.update(id, {
      sales_staff_id: merged.sales_staff_id,
      store_id: merged.store_id,
      frequency: merged.frequency,
      start_date: merged.start_date,
      end_date: merged.end_date,
      one_time_date: merged.one_time_date,
      weekly_days: merged.weekly_days,
      monthly_day: merged.monthly_day,
      active: merged.active,
      notes: merged.notes,
    });

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const schedule = await this.findOne(id);
    await this.schedulesRepo.delete(schedule.id);
  }

  /**
   * Admin UI "list of sales then create/edit" — every rep with their nested
   * schedules + store_count. Reps with zero schedules still appear so admin
   * can assign them.
   */
  async bySalesStaff(): Promise<
    Array<{
      sales_staff: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        territory_id: string | null;
        territory_name: string | null;
      };
      schedules: VisitSchedule[];
      store_count: number;
    }>
  > {
    const reps = await this.usersRepo.find({
      where: { role: UserRole.REP, is_active: true },
      order: { name: 'ASC' },
    });

    const schedules = await this.schedulesRepo.find({
      where: { sales_staff_id: In(reps.map((r) => r.id)) },
      relations: { store: true },
      order: { created_at: 'DESC' },
    });

    // Resolve every territory_id → name in a single query.
    const territoryIds = Array.from(
      new Set(reps.map((r) => r.territory_id).filter((t): t is string => !!t)),
    );
    const territories = territoryIds.length
      ? await this.territoriesRepo.find({ where: { id: In(territoryIds) } })
      : [];
    const territoryName = new Map<string, string>(territories.map((t) => [t.id, t.name]));

    const byRep = new Map<string, VisitSchedule[]>();
    for (const s of schedules) {
      const list = byRep.get(s.sales_staff_id) ?? [];
      list.push(this.sanitize(s));
      byRep.set(s.sales_staff_id, list);
    }

    return reps.map((r) => {
      const list = byRep.get(r.id) ?? [];
      return {
        sales_staff: {
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone ?? null,
          territory_id: r.territory_id ?? null,
          territory_name: r.territory_id ? territoryName.get(r.territory_id) ?? null : null,
        },
        schedules: list,
        store_count: list.length,
      };
    });
  }

  // ---------- Staff (rep) views ----------

  async todayForRep(repId: string): Promise<ResolvedPlannedVisit[]> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return this.resolveForRep(repId, start, start);
  }

  async thisWeekForRep(repId: string): Promise<
    Array<{ date: string; weekday: number; weekday_short: string; items: ResolvedPlannedVisit[] }>
  > {
    const { start, end } = weekRange(new Date());
    const items = await this.resolveForRep(repId, start, end);

    // Indonesian short weekday labels keyed by JS getDay() (0=Sun..6=Sat).
    const SHORT_ID: Record<number, string> = {
      0: 'Min', // Minggu
      1: 'Sen', // Senin
      2: 'Sel', // Selasa
      3: 'Rab', // Rabu
      4: 'Kam', // Kamis
      5: 'Jum', // Jumat
      6: 'Sab', // Sabtu
    };

    // Build 7 day buckets Mon..Sun.
    const days: Array<{ date: string; weekday: number; weekday_short: string; items: ResolvedPlannedVisit[] }> = [];
    const cursor = new Date(start);
    for (let i = 0; i < 7; i++) {
      const dStr = formatLocalDate(cursor);
      const dow = cursor.getDay();
      days.push({
        date: dStr,
        weekday: dow,
        weekday_short: SHORT_ID[dow],
        items: items.filter((it) => it.scheduled_for === dStr),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  async upcomingForRep(repId: string): Promise<ResolvedPlannedVisit[]> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(start.getDate() + 30);
    return this.resolveForRep(repId, start, end);
  }

  // ---------- Internals ----------

  private async resolveForRep(
    repId: string,
    from: Date,
    to: Date,
  ): Promise<ResolvedPlannedVisit[]> {
    const schedules = await this.schedulesRepo.find({
      where: { sales_staff_id: repId, active: true },
      relations: { store: true },
    });

    const planned = resolveSchedulesForRange(schedules, from, to);
    if (planned.length === 0) return [];

    const fromStr = formatLocalDate(from);
    const toStr = formatLocalDate(to);

    // Pull every visit for this rep within the window in one shot.
    const visits = await this.visitsRepo.find({
      where: {
        user_id: repId,
        visit_date: Between(fromStr, toStr),
      },
    });

    // Index: store_id + visit_date → visit (prefer submitted, else any draft).
    const visitIdx = new Map<string, Visit>();
    for (const v of visits) {
      if (!v.visit_date) continue;
      const key = `${v.store_id}|${v.visit_date.slice(0, 10)}`;
      const existing = visitIdx.get(key);
      if (!existing) {
        visitIdx.set(key, v);
      } else if (
        existing.status !== VisitStatus.SUBMITTED &&
        v.status === VisitStatus.SUBMITTED
      ) {
        visitIdx.set(key, v);
      }
    }

    const storeById = new Map(schedules.map((s) => [s.store_id, s.store]));
    const now = new Date();
    const todayStr = formatLocalDate(now);
    const endOfBusinessHour = 18; // 6pm cutoff for "missed"

    return planned.map<ResolvedPlannedVisit>((p) => {
      const store = storeById.get(p.store_id)!;
      const visit = visitIdx.get(`${p.store_id}|${p.scheduled_for}`) ?? null;

      let status: PlannedVisitStatus;
      if (visit) {
        status = 'visited';
      } else if (
        p.scheduled_for < todayStr ||
        (p.scheduled_for === todayStr && now.getHours() >= endOfBusinessHour)
      ) {
        status = 'missed';
      } else {
        status = 'planned';
      }

      return {
        schedule_id: p.schedule_id,
        store: {
          id: store.id,
          code: store.code,
          name: store.name,
          address: store.address ?? null,
        },
        frequency: p.frequency,
        scheduled_for: p.scheduled_for,
        status,
        visit_id: visit?.id ?? null,
      };
    });
  }

  private async assertRepExists(userId: string): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (user.role !== UserRole.REP) {
      throw new BadRequestException(
        `User ${userId} is role=${user.role}, must be 'rep' to be assigned a visit schedule`,
      );
    }
    if (!user.is_active) {
      throw new BadRequestException(`User ${userId} is inactive`);
    }
  }

  /**
   * Enforce: each frequency requires exactly its companion field(s) and no
   * stray fields from other frequencies.
   */
  private assertFrequencyShape(s: Pick<
    VisitSchedule,
    'frequency' | 'one_time_date' | 'weekly_days' | 'monthly_day'
  >): void {
    const { frequency, one_time_date, weekly_days, monthly_day } = s;

    switch (frequency) {
      case VisitScheduleFrequency.ONCE:
        if (!one_time_date) {
          throw new BadRequestException(`frequency='once' requires one_time_date`);
        }
        if (weekly_days || monthly_day != null) {
          throw new BadRequestException(
            `frequency='once' must not set weekly_days or monthly_day`,
          );
        }
        break;
      case VisitScheduleFrequency.DAILY:
        if (one_time_date || weekly_days || monthly_day != null) {
          throw new BadRequestException(
            `frequency='daily' must not set one_time_date, weekly_days, or monthly_day`,
          );
        }
        break;
      case VisitScheduleFrequency.WEEKLY:
        if (!Array.isArray(weekly_days) || weekly_days.length === 0) {
          throw new BadRequestException(
            `frequency='weekly' requires non-empty weekly_days`,
          );
        }
        if (one_time_date || monthly_day != null) {
          throw new BadRequestException(
            `frequency='weekly' must not set one_time_date or monthly_day`,
          );
        }
        break;
      case VisitScheduleFrequency.MONTHLY:
        if (monthly_day == null) {
          throw new BadRequestException(
            `frequency='monthly' requires monthly_day (1-31 or -1 for last day)`,
          );
        }
        if (one_time_date || weekly_days) {
          throw new BadRequestException(
            `frequency='monthly' must not set one_time_date or weekly_days`,
          );
        }
        break;
    }
  }
}
