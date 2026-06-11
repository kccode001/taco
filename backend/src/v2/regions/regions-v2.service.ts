import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Region, RegionType } from '../../database/entities/region.entity';
import { TaroAgentRegion } from '../../database/entities/taro-agent-region.entity';
import { CreateRegionV2Dto } from './dto/create-region-v2.dto';
import { UpdateRegionV2Dto } from './dto/update-region-v2.dto';

/** Region row + the dependent agent-assignment count (for display + delete UX). */
export type RegionWithDeps = Region & { agent_count: number };

/**
 * v2 dashboard Area management, backed by the AUTHORITATIVE `public.regions`
 * table (the seeded territory master — region → bu → area). This surface manages
 * the leaf `area` rows ("Central - BU1 - ASM Cirebon", …); it does NOT touch the
 * `taro_v2_areas` table the invoice/upload spine FK-references (separate concern,
 * owned by Grout/Tile).
 *
 * Delete is a SOFT delete (`active=false`): `taro_agent_regions` FK-cascades on
 * region delete, so a hard delete would silently drop agent↔area assignments.
 * Soft-deactivate preserves that history and is reversible via update {active:true}.
 */
@Injectable()
export class RegionsV2Service {
  constructor(
    @InjectRepository(Region)
    private readonly regions: Repository<Region>,
    @InjectRepository(TaroAgentRegion)
    private readonly agentRegions: Repository<TaroAgentRegion>,
  ) {}

  /**
   * List region rows of a given type (default `area`), newest-stable order.
   * Inactive (soft-deleted) rows are excluded unless `includeInactive`. Each row
   * is decorated with `agent_count` so the FE can show dependents + warn on delete.
   */
  async list(params: {
    type?: RegionType;
    search?: string;
    includeInactive?: boolean;
  }): Promise<RegionWithDeps[]> {
    const type = params.type ?? RegionType.AREA;
    const qb = this.regions
      .createQueryBuilder('r')
      .where('r.type = :type', { type })
      .orderBy('r.sort_order', 'ASC')
      .addOrderBy('r.code', 'ASC');
    if (!params.includeInactive) qb.andWhere('r.active = true');
    if (params.search) {
      qb.andWhere(
        '(LOWER(r.name) LIKE LOWER(:q) OR LOWER(r.code) LIKE LOWER(:q) OR LOWER(r.display_path) LIKE LOWER(:q))',
        { q: `%${params.search}%` },
      );
    }
    const rows = await qb.getMany();
    return this.decorateWithAgentCounts(rows);
  }

  async findOne(id: string): Promise<RegionWithDeps> {
    const row = await this.regions.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Region ${id} not found`);
    const [decorated] = await this.decorateWithAgentCounts([row]);
    return decorated;
  }

  /** Create a new leaf AREA under a BU parent. */
  async create(dto: CreateRegionV2Dto): Promise<RegionWithDeps> {
    const parent = await this.regions.findOne({ where: { id: dto.parent_id } });
    if (!parent)
      throw new BadRequestException(`Parent ${dto.parent_id} not found`);
    if (parent.type !== RegionType.BU) {
      throw new BadRequestException(
        `parent_id must be a BU (type='bu'); got type='${parent.type}'`,
      );
    }

    const name = dto.name.trim();
    const code = await this.resolveCode(dto.code?.trim(), parent, name);

    const created = this.regions.create({
      code,
      name,
      type: RegionType.AREA,
      parent_id: parent.id,
      sort_order: dto.sort_order ?? 0,
      active: true,
      display_path: `${parent.display_path} - ${name}`,
    });
    const saved = await this.regions.save(created);
    return { ...saved, agent_count: 0 };
  }

  async update(id: string, dto: UpdateRegionV2Dto): Promise<RegionWithDeps> {
    const row = await this.regions.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Region ${id} not found`);

    // Re-parent (must stay under a BU).
    let parent: Region | null = row.parent_id
      ? await this.regions.findOne({ where: { id: row.parent_id } })
      : null;
    if (dto.parent_id !== undefined && dto.parent_id !== row.parent_id) {
      const next = await this.regions.findOne({ where: { id: dto.parent_id } });
      if (!next)
        throw new BadRequestException(`Parent ${dto.parent_id} not found`);
      if (next.type !== RegionType.BU) {
        throw new BadRequestException(
          `parent_id must be a BU (type='bu'); got type='${next.type}'`,
        );
      }
      row.parent_id = next.id;
      parent = next;
    }

    if (dto.code !== undefined) {
      const code = dto.code.trim();
      if (code && code !== row.code) {
        const dup = await this.regions.findOne({ where: { code } });
        if (dup && dup.id !== id) {
          throw new ConflictException(`Region code "${code}" already exists`);
        }
        row.code = code;
      }
    }
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.sort_order !== undefined) row.sort_order = dto.sort_order;
    if (dto.active !== undefined) row.active = dto.active;

    // Keep the denormalized path in sync with name/parent.
    row.display_path = parent
      ? `${parent.display_path} - ${row.name}`
      : row.name;

    const saved = await this.regions.save(row);
    return this.findOne(saved.id);
  }

  /**
   * SOFT delete — deactivate (`active=false`) rather than drop the row, because
   * `taro_agent_regions` cascades on hard delete and would lose agent↔area
   * history. Idempotent; reversible via update {active:true}.
   */
  async remove(id: string): Promise<{
    id: string;
    active: false;
    soft_deleted: true;
    agent_count: number;
  }> {
    const row = await this.regions.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Region ${id} not found`);
    if (row.active) {
      row.active = false;
      await this.regions.save(row);
    }
    const agent_count = await this.agentRegions.count({
      where: { region_id: id },
    });
    return { id, active: false, soft_deleted: true, agent_count };
  }

  // ------------------------------------------------------------- internals

  private async decorateWithAgentCounts(
    rows: Region[],
  ): Promise<RegionWithDeps[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const counts = await this.agentRegions
      .createQueryBuilder('ar')
      .select('ar.region_id', 'region_id')
      .addSelect('COUNT(*)', 'count')
      .where('ar.region_id IN (:...ids)', { ids })
      .groupBy('ar.region_id')
      .getRawMany<{ region_id: string; count: string }>();
    const byRegion = new Map(
      counts.map((c) => [c.region_id, parseInt(c.count, 10) || 0]),
    );
    return rows.map((r) => ({ ...r, agent_count: byRegion.get(r.id) ?? 0 }));
  }

  /** Use the supplied code (enforcing uniqueness) or derive a unique one. */
  private async resolveCode(
    supplied: string | undefined,
    parent: Region,
    name: string,
  ): Promise<string> {
    if (supplied) {
      const dup = await this.regions.findOne({ where: { code: supplied } });
      if (dup)
        throw new ConflictException(`Region code "${supplied}" already exists`);
      return supplied;
    }
    const slug = name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const base = slug ? `${parent.code}-${slug}` : parent.code;
    let candidate = base;
    let n = 2;
    while (await this.regions.findOne({ where: { code: candidate } })) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    return candidate;
  }
}
