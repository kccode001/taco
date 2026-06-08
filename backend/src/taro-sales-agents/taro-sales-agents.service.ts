import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserRole } from '../database/entities/user.entity';
import { TaroInvoice } from '../database/entities/taro-invoice.entity';
import { Region, RegionType } from '../database/entities/region.entity';
import { TaroAgentRegion } from '../database/entities/taro-agent-region.entity';
import { CreateTaroSalesAgentDto } from './dto/create-taro-sales-agent.dto';
import { UpdateTaroSalesAgentDto } from './dto/update-taro-sales-agent.dto';

export interface TaroAgentRegionDto {
  id: string;
  code: string;
  name: string;
  display_path: string;
  is_primary: boolean;
}

export interface TaroSalesAgentListRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** Primary region (denorm) — kept for back-compat / quick header rendering. */
  region: { id: string; code: string; name: string; display_path: string } | null;
  /** Full m-to-m region set, primary first. */
  regions: TaroAgentRegionDto[];
  invoice_count: number;
  last_upload_at: Date | null;
  active: boolean;
}

export interface TaroSalesAgentDetail extends TaroSalesAgentListRow {
  recent_invoices: Array<{
    id: string;
    uploaded_at: Date;
    file_name: string | null;
    store_name: string | null;
    status: string;
    needs_review_count: number;
    line_count: number;
  }>;
}

@Injectable()
export class TaroSalesAgentsService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(TaroInvoice)
    private readonly invoicesRepo: Repository<TaroInvoice>,
    @InjectRepository(Region)
    private readonly regionsRepo: Repository<Region>,
    @InjectRepository(TaroAgentRegion)
    private readonly agentRegionsRepo: Repository<TaroAgentRegion>,
    private readonly dataSource: DataSource,
  ) {}

  // ---- Internal helpers ----

  /**
   * Resolve + validate a set of region ids — every id must exist and be a
   * leaf 'area'. Returns the loaded Region rows keyed by id.
   */
  private async resolveAreas(regionIds: string[]): Promise<Map<string, Region>> {
    if (regionIds.length === 0) {
      throw new BadRequestException('region_ids must contain at least one id');
    }
    const unique = Array.from(new Set(regionIds));
    const rows = await this.regionsRepo.find({ where: { id: In(unique) } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of unique) {
      const r = byId.get(id);
      if (!r) throw new NotFoundException(`Region ${id} not found`);
      if (r.type !== RegionType.AREA) {
        throw new BadRequestException(
          `region_id ${id} is type=${r.type}; must be leaf 'area'`,
        );
      }
    }
    return byId;
  }

  private async loadAgentRegions(userId: string): Promise<TaroAgentRegionDto[]> {
    const rows = await this.agentRegionsRepo
      .createQueryBuilder('ar')
      .innerJoinAndSelect('ar.region', 'r')
      .where('ar.user_id = :uid', { uid: userId })
      .getMany();
    return rows
      .map((ar) => ({
        id: ar.region!.id,
        code: ar.region!.code,
        name: ar.region!.name,
        display_path: ar.region!.display_path,
        is_primary: ar.is_primary,
      }))
      .sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return a.display_path.localeCompare(b.display_path);
      });
  }

  /**
   * Replace the m-to-m set for an agent. Primary is picked in this order:
   *   1. explicit `primaryRegionId` (must be in set)
   *   2. first id in `regionIds`
   *
   * Also denormalizes the primary into `users.taro_region_id` for
   * back-compat with existing single-region queries.
   */
  private async replaceAgentRegions(
    userId: string,
    regionIds: string[],
    primaryRegionId?: string,
  ): Promise<void> {
    await this.resolveAreas(regionIds);

    if (primaryRegionId && !regionIds.includes(primaryRegionId)) {
      throw new BadRequestException(
        `primary_region_id ${primaryRegionId} must be one of region_ids`,
      );
    }
    const primary = primaryRegionId ?? regionIds[0];

    await this.dataSource.transaction(async (mgr) => {
      // Wipe + recreate to keep the merge logic dead simple.
      await mgr.delete(TaroAgentRegion, { user_id: userId });
      const rows = regionIds.map((rid) =>
        mgr.create(TaroAgentRegion, {
          user_id: userId,
          region_id: rid,
          is_primary: rid === primary,
        }),
      );
      await mgr.save(rows);
      // Denormalize primary onto users row.
      await mgr.update(User, { id: userId }, { taro_region_id: primary });
    });
  }

  private regionDto(r: Region | null) {
    if (!r) return null;
    return { id: r.id, code: r.code, name: r.name, display_path: r.display_path };
  }

  /**
   * Return the set of region IDs an agent is permitted to upload from.
   * Used by upload validation.
   */
  async regionIdsForAgent(userId: string): Promise<string[]> {
    const rows = await this.agentRegionsRepo.find({ where: { user_id: userId } });
    return rows.map((r) => r.region_id);
  }

  // ---- Listing ----

  async list(params: { region_id?: string; search?: string }): Promise<TaroSalesAgentListRow[]> {
    // Pull all agents (with primary region eager-loaded) + per-agent
    // aggregates in one go. region_id filter is applied via the m-to-m table.
    const qb = this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.taro_region', 'region')
      .where('u.role = :role', { role: UserRole.TARO_AGENT });

    if (params.region_id) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM taro_agent_regions ar WHERE ar.user_id = u.id AND ar.region_id = :rid)`,
        { rid: params.region_id },
      );
    }
    if (params.search && params.search.trim()) {
      const s = `%${params.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(u.name) LIKE :s OR LOWER(u.email) LIKE :s OR LOWER(u.phone) LIKE :s)',
        { s },
      );
    }

    const agents = await qb.orderBy('u.created_at', 'DESC').getMany();
    if (agents.length === 0) return [];

    const agentIds = agents.map((a) => a.id);
    const aggRows = await this.invoicesRepo
      .createQueryBuilder('inv')
      .select('inv.uploaded_by', 'agent_id')
      .addSelect('COUNT(*)::int', 'invoice_count')
      .addSelect('MAX(inv.uploaded_at)', 'last_upload_at')
      .where('inv.uploaded_by IN (:...ids)', { ids: agentIds })
      .groupBy('inv.uploaded_by')
      .getRawMany();

    const aggByAgent = new Map<string, { invoice_count: number; last_upload_at: Date | null }>();
    for (const r of aggRows as Array<{ agent_id: string; invoice_count: number; last_upload_at: Date | null }>) {
      aggByAgent.set(r.agent_id, {
        invoice_count: Number(r.invoice_count ?? 0),
        last_upload_at: r.last_upload_at,
      });
    }

    // Batch-load region sets so we don't N+1 the list endpoint.
    const regionRows = await this.agentRegionsRepo
      .createQueryBuilder('ar')
      .innerJoinAndSelect('ar.region', 'r')
      .where('ar.user_id IN (:...ids)', { ids: agentIds })
      .getMany();
    const regionsByAgent = new Map<string, TaroAgentRegionDto[]>();
    for (const ar of regionRows) {
      const list = regionsByAgent.get(ar.user_id) ?? [];
      list.push({
        id: ar.region!.id,
        code: ar.region!.code,
        name: ar.region!.name,
        display_path: ar.region!.display_path,
        is_primary: ar.is_primary,
      });
      regionsByAgent.set(ar.user_id, list);
    }
    for (const [, list] of regionsByAgent) {
      list.sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return a.display_path.localeCompare(b.display_path);
      });
    }

    return agents.map((a) => {
      const agg = aggByAgent.get(a.id) ?? { invoice_count: 0, last_upload_at: null };
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        phone: a.phone ?? null,
        region: this.regionDto(a.taro_region ?? null),
        regions: regionsByAgent.get(a.id) ?? [],
        invoice_count: agg.invoice_count,
        last_upload_at: agg.last_upload_at,
        active: a.is_active,
      };
    });
  }

  // ---- Detail ----

  async findOne(id: string): Promise<TaroSalesAgentDetail> {
    const agent = await this.usersRepo.findOne({
      where: { id },
      relations: { taro_region: true },
    });
    if (!agent || agent.role !== UserRole.TARO_AGENT) {
      throw new NotFoundException(`TaroSalesAgent ${id} not found`);
    }

    const recentRaw = await this.invoicesRepo
      .createQueryBuilder('inv')
      .leftJoin('inv.line_items', 'li')
      .select('inv.id', 'id')
      .addSelect('inv.uploaded_at', 'uploaded_at')
      .addSelect('inv.file_name', 'file_name')
      .addSelect('inv.store_name', 'store_name')
      .addSelect('inv.status', 'status')
      .addSelect('COUNT(li.id)::int', 'line_count')
      .addSelect(
        'COUNT(li.id) FILTER (WHERE li.needs_review = true)::int',
        'needs_review_count',
      )
      .where('inv.uploaded_by = :uid', { uid: agent.id })
      .groupBy('inv.id')
      .orderBy('inv.uploaded_at', 'DESC')
      .limit(10)
      .getRawMany();

    const agg = await this.invoicesRepo
      .createQueryBuilder('inv')
      .select('COUNT(*)::int', 'invoice_count')
      .addSelect('MAX(inv.uploaded_at)', 'last_upload_at')
      .where('inv.uploaded_by = :uid', { uid: agent.id })
      .getRawOne<{ invoice_count: number; last_upload_at: Date | null }>();

    const regions = await this.loadAgentRegions(agent.id);

    return {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone ?? null,
      region: this.regionDto(agent.taro_region ?? null),
      regions,
      invoice_count: Number(agg?.invoice_count ?? 0),
      last_upload_at: agg?.last_upload_at ?? null,
      active: agent.is_active,
      recent_invoices: recentRaw.map((r) => ({
        id: r.id,
        uploaded_at: r.uploaded_at,
        file_name: r.file_name,
        store_name: r.store_name,
        status: r.status,
        needs_review_count: r.needs_review_count ?? 0,
        line_count: r.line_count ?? 0,
      })),
    };
  }

  // ---- Create ----

  async create(dto: CreateTaroSalesAgentDto): Promise<TaroSalesAgentDetail> {
    // Resolve region_ids — accept multi (region_ids) or legacy single (region_id).
    const regionIds =
      dto.region_ids && dto.region_ids.length > 0
        ? dto.region_ids
        : dto.region_id
          ? [dto.region_id]
          : [];
    if (regionIds.length === 0) {
      throw new BadRequestException('region_ids (or legacy region_id) is required');
    }
    await this.resolveAreas(regionIds);

    const primary = dto.primary_region_id ?? regionIds[0];
    if (!regionIds.includes(primary)) {
      throw new BadRequestException(
        `primary_region_id ${primary} must be one of region_ids`,
      );
    }

    const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException(`Email ${dto.email} is already in use`);
    }

    const password_hash = await bcrypt.hash(dto.password, 10);
    const agent = await this.usersRepo.save(
      this.usersRepo.create({
        email: dto.email,
        password_hash,
        name: dto.name,
        role: UserRole.TARO_AGENT,
        taro_region_id: primary,
        phone: dto.phone ?? null,
        is_active: true,
      }),
    );

    await this.replaceAgentRegions(agent.id, regionIds, primary);

    return this.findOne(agent.id);
  }

  // ---- Update ----

  async update(id: string, dto: UpdateTaroSalesAgentDto): Promise<TaroSalesAgentDetail> {
    const agent = await this.usersRepo.findOne({ where: { id } });
    if (!agent || agent.role !== UserRole.TARO_AGENT) {
      throw new NotFoundException(`TaroSalesAgent ${id} not found`);
    }

    if (dto.email && dto.email !== agent.email) {
      const dup = await this.usersRepo.findOne({ where: { email: dto.email } });
      if (dup) throw new ConflictException(`Email ${dto.email} is already in use`);
    }

    // Resolve new region set — fully replaces if region_ids passed.
    const regionIds =
      dto.region_ids && dto.region_ids.length > 0
        ? dto.region_ids
        : dto.region_id
          ? [dto.region_id]
          : null;

    if (regionIds) {
      // Pick primary: explicit > existing primary if still in set > first.
      let primary = dto.primary_region_id;
      if (!primary) {
        if (agent.taro_region_id && regionIds.includes(agent.taro_region_id)) {
          primary = agent.taro_region_id;
        } else {
          primary = regionIds[0];
        }
      }
      await this.replaceAgentRegions(id, regionIds, primary);
    } else if (dto.primary_region_id) {
      // Just flip the primary flag without changing the set.
      const current = await this.regionIdsForAgent(id);
      if (!current.includes(dto.primary_region_id)) {
        throw new BadRequestException(
          `primary_region_id ${dto.primary_region_id} is not in this agent's region set`,
        );
      }
      await this.replaceAgentRegions(id, current, dto.primary_region_id);
    }

    const patch: Partial<User> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.email !== undefined) patch.email = dto.email;
    if (dto.phone !== undefined) patch.phone = dto.phone;
    if (dto.active !== undefined) patch.is_active = dto.active;
    if (Object.keys(patch).length > 0) {
      await this.usersRepo.update(id, patch);
    }

    return this.findOne(id);
  }

  // ---- Soft delete (deactivate) ----

  async deactivate(id: string): Promise<{ id: string; active: boolean }> {
    const agent = await this.usersRepo.findOne({ where: { id } });
    if (!agent || agent.role !== UserRole.TARO_AGENT) {
      throw new NotFoundException(`TaroSalesAgent ${id} not found`);
    }
    await this.usersRepo.update(id, { is_active: false });
    return { id, active: false };
  }

  // ---- Password reset ----

  async resetPassword(
    id: string,
    newPassword?: string,
  ): Promise<{ id: string; password: string }> {
    const agent = await this.usersRepo.findOne({ where: { id } });
    if (!agent || agent.role !== UserRole.TARO_AGENT) {
      throw new NotFoundException(`TaroSalesAgent ${id} not found`);
    }
    const password =
      newPassword && newPassword.trim().length >= 6
        ? newPassword.trim()
        : crypto.randomBytes(8).toString('base64url').slice(0, 12);

    const password_hash = await bcrypt.hash(password, 10);
    await this.usersRepo.update(id, {
      password_hash,
      refresh_token_hash: undefined,
    });

    return { id, password };
  }
}
