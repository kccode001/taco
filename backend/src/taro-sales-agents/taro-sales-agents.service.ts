import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserRole } from '../database/entities/user.entity';
import { TaroInvoice } from '../database/entities/taro-invoice.entity';
import { Region, RegionType } from '../database/entities/region.entity';
import { CreateTaroSalesAgentDto } from './dto/create-taro-sales-agent.dto';
import { UpdateTaroSalesAgentDto } from './dto/update-taro-sales-agent.dto';

export interface TaroSalesAgentListRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  region: { id: string; code: string; name: string; display_path: string } | null;
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
  ) {}

  // ---- Internal helpers ----

  private async assertRegionIsArea(regionId: string): Promise<Region> {
    const r = await this.regionsRepo.findOne({ where: { id: regionId } });
    if (!r) throw new NotFoundException(`Region ${regionId} not found`);
    if (r.type !== RegionType.AREA) {
      throw new BadRequestException(
        `region_id ${regionId} is type=${r.type}; must be leaf 'area'`,
      );
    }
    return r;
  }

  private regionDto(r: Region | null) {
    if (!r) return null;
    return { id: r.id, code: r.code, name: r.name, display_path: r.display_path };
  }

  // ---- Listing ----

  async list(params: { region_id?: string; search?: string }): Promise<TaroSalesAgentListRow[]> {
    // Pull all agents (with region eager-loaded) + per-agent aggregates in one go.
    const qb = this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.taro_region', 'region')
      .where('u.role = :role', { role: UserRole.TARO_AGENT });

    if (params.region_id) {
      qb.andWhere('u.taro_region_id = :rid', { rid: params.region_id });
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

    return agents.map((a) => {
      const agg = aggByAgent.get(a.id) ?? { invoice_count: 0, last_upload_at: null };
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        phone: a.phone ?? null,
        region: this.regionDto(a.taro_region ?? null),
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

    return {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone ?? null,
      region: this.regionDto(agent.taro_region ?? null),
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
    await this.assertRegionIsArea(dto.region_id);

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
        taro_region_id: dto.region_id,
        phone: dto.phone ?? null,
        is_active: true,
      }),
    );

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
    if (dto.region_id) {
      await this.assertRegionIsArea(dto.region_id);
    }

    const patch: Partial<User> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.email !== undefined) patch.email = dto.email;
    if (dto.region_id !== undefined) patch.taro_region_id = dto.region_id;
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
