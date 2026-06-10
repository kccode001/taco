import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { SalesAgentV2 } from '../../database/entities/v2/sales-agent-v2.entity';
import { AreaV2 } from '../../database/entities/v2/area-v2.entity';
import { CreateSalesDto } from './dto/create-sales.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';

/**
 * v2 Sales CRUD — built on Grout's canonical `SalesAgentV2`
 * (`taro_v2_sales_agents`): an admin-managed roster, separate from auth users.
 * Delete is a soft deactivate (sets `is_active=false`), mirroring v1.
 */
@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(SalesAgentV2)
    private readonly agents: Repository<SalesAgentV2>,
    @InjectRepository(AreaV2)
    private readonly areas: Repository<AreaV2>,
  ) {}

  list(params: { area_id?: string; search?: string }): Promise<SalesAgentV2[]> {
    const where: Record<string, unknown> = {};
    if (params.area_id) where.area_id = params.area_id;
    if (params.search) where.name = ILike(`%${params.search}%`);
    return this.agents.find({
      where,
      order: { is_active: 'DESC', name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<SalesAgentV2> {
    const agent = await this.agents.findOne({
      where: { id },
      relations: { area: true },
    });
    if (!agent) throw new NotFoundException(`Sales agent ${id} not found`);
    return agent;
  }

  private async assertAreaExists(areaId: string): Promise<void> {
    const count = await this.areas.count({ where: { id: areaId } });
    if (count === 0) throw new NotFoundException(`Area ${areaId} not found`);
  }

  async create(dto: CreateSalesDto): Promise<SalesAgentV2> {
    if (dto.area_id) await this.assertAreaExists(dto.area_id);
    const agent = this.agents.create({
      name: dto.name.trim(),
      phone: dto.phone?.trim() || null,
      email: dto.email?.trim() || null,
      area_id: dto.area_id ?? null,
      user_id: dto.user_id ?? null,
      is_active: true,
    });
    return this.agents.save(agent);
  }

  async update(id: string, dto: UpdateSalesDto): Promise<SalesAgentV2> {
    const agent = await this.findOne(id);
    if (dto.area_id !== undefined) {
      if (dto.area_id) await this.assertAreaExists(dto.area_id);
      agent.area_id = dto.area_id ?? null;
    }
    if (dto.name !== undefined) agent.name = dto.name.trim();
    if (dto.phone !== undefined) agent.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined) agent.email = dto.email?.trim() || null;
    if (dto.user_id !== undefined) agent.user_id = dto.user_id ?? null;
    if (dto.active !== undefined) agent.is_active = dto.active;
    return this.agents.save(agent);
  }

  /** Soft delete — deactivate the roster row (keeps history intact). */
  async remove(id: string): Promise<{ id: string; is_active: boolean }> {
    const agent = await this.findOne(id);
    agent.is_active = false;
    await this.agents.save(agent);
    return { id, is_active: false };
  }
}
