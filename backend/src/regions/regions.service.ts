import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Region, RegionType } from '../database/entities/region.entity';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';

export interface RegionTreeNode {
  id: string;
  code: string;
  name: string;
  type: RegionType;
  display_path: string;
  sort_order: number;
  active: boolean;
  children: RegionTreeNode[];
}

@Injectable()
export class RegionsService {
  constructor(
    @InjectRepository(Region)
    private readonly repo: Repository<Region>,
  ) {}

  /**
   * Flat list, optionally filtered by type. Ordered by sort_order then code so
   * the UI dropdowns are stable.
   */
  async findAll(type?: RegionType): Promise<Region[]> {
    const qb = this.repo
      .createQueryBuilder('r')
      .orderBy('r.sort_order', 'ASC')
      .addOrderBy('r.code', 'ASC');
    if (type) qb.andWhere('r.type = :t', { t: type });
    return qb.getMany();
  }

  /** Nested tree (region → bu → area). */
  async tree(): Promise<RegionTreeNode[]> {
    const all = await this.repo.find({
      order: { sort_order: 'ASC', code: 'ASC' },
    });
    const byParent = new Map<string | null, Region[]>();
    for (const r of all) {
      const key = r.parent_id ?? null;
      const list = byParent.get(key) ?? [];
      list.push(r);
      byParent.set(key, list);
    }

    const build = (node: Region): RegionTreeNode => ({
      id: node.id,
      code: node.code,
      name: node.name,
      type: node.type,
      display_path: node.display_path,
      sort_order: node.sort_order,
      active: node.active,
      children: (byParent.get(node.id) ?? []).map(build),
    });

    return (byParent.get(null) ?? []).map(build);
  }

  /** Leaf-level areas only, with display_path — feeds the upload dropdown. */
  areas(): Promise<Region[]> {
    return this.repo.find({
      where: { type: RegionType.AREA },
      order: { sort_order: 'ASC', code: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Region> {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Region ${id} not found`);
    return r;
  }

  async create(dto: CreateRegionDto): Promise<Region> {
    const dup = await this.repo.findOne({ where: { code: dto.code } });
    if (dup) throw new ConflictException(`Region code ${dto.code} already exists`);

    let parent: Region | null = null;
    if (dto.parent_id) {
      parent = await this.findOne(dto.parent_id);
      this.assertHierarchy(parent.type, dto.type);
    } else if (dto.type !== RegionType.REGION) {
      throw new BadRequestException(`parent_id is required for type=${dto.type}`);
    }

    const created = this.repo.create({
      code: dto.code,
      name: dto.name,
      type: dto.type,
      parent_id: dto.parent_id ?? null,
      sort_order: dto.sort_order ?? 0,
      active: dto.active ?? true,
    });
    created.display_path = this.computeDisplayPath(parent, dto.name);
    return this.repo.save(created);
  }

  async update(id: string, dto: UpdateRegionDto): Promise<Region> {
    const r = await this.findOne(id);

    if (dto.code && dto.code !== r.code) {
      const dup = await this.repo.findOne({ where: { code: dto.code } });
      if (dup) throw new ConflictException(`Region code ${dto.code} already exists`);
    }

    if (dto.parent_id !== undefined && dto.parent_id !== r.parent_id) {
      if (dto.parent_id === id) {
        throw new BadRequestException('Region cannot be its own parent');
      }
      if (dto.parent_id) {
        const parent = await this.findOne(dto.parent_id);
        this.assertHierarchy(parent.type, dto.type ?? r.type);
      }
    }

    Object.assign(r, dto);
    // Recompute display path if name or parent changed.
    const parent = r.parent_id
      ? await this.repo.findOne({ where: { id: r.parent_id } })
      : null;
    r.display_path = this.computeDisplayPath(parent, r.name);
    return this.repo.save(r);
  }

  async remove(id: string): Promise<void> {
    const r = await this.findOne(id);
    const kids = await this.repo.count({ where: { parent_id: id } });
    if (kids > 0) {
      throw new ConflictException(
        `Region ${r.code} still has ${kids} child rows — delete children first.`,
      );
    }
    await this.repo.remove(r);
  }

  /** Verify the SKU master invariant: region → bu → area. */
  private assertHierarchy(parentType: RegionType, childType: RegionType): void {
    const ok =
      (parentType === RegionType.REGION && childType === RegionType.BU) ||
      (parentType === RegionType.BU && childType === RegionType.AREA);
    if (!ok) {
      throw new BadRequestException(
        `Invalid hierarchy: ${parentType} cannot have ${childType} children`,
      );
    }
  }

  private computeDisplayPath(parent: Region | null, name: string): string {
    if (!parent) return name;
    return `${parent.display_path} - ${name}`;
  }

  /** Used by Taro invoice upload to verify the user picked an area, not a parent. */
  async assertIsArea(id: string): Promise<Region> {
    const r = await this.findOne(id);
    if (r.type !== RegionType.AREA) {
      throw new BadRequestException(
        `region_id ${id} is type=${r.type}; must be a leaf 'area'`,
      );
    }
    return r;
  }
}
