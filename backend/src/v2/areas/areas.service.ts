import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Region, RegionType } from '../../database/entities/region.entity';
import { StoreV2 } from '../../database/entities/v2/store-v2.entity';
import { InvoiceV2 } from '../../database/entities/v2/invoice-v2.entity';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

/**
 * v2 Areas CRUD — backed by the authoritative `public.regions` table
 * (type='area' rows: ASM Cirebon, ASM Bandung, ASM JKT1, …).
 *
 * The old parallel `taro_v2_areas` table is retired; stores, sales agents, and
 * invoices now FK to `regions.id` directly. This service manages that single
 * source of truth.
 *
 * Delete is a SOFT delete (active=false) guarded by a dependent-stores /
 * dependent-invoices check — preserves FK history and is reversible.
 */
@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Region)
    private readonly regions: Repository<Region>,
    @InjectRepository(StoreV2)
    private readonly stores: Repository<StoreV2>,
    @InjectRepository(InvoiceV2)
    private readonly invoices: Repository<InvoiceV2>,
  ) {}

  list(params: { search?: string }): Promise<Region[]> {
    const qb = this.regions
      .createQueryBuilder('r')
      .where('r.type = :type', { type: RegionType.AREA })
      .andWhere('r.active = true')
      .orderBy('r.name', 'ASC');
    if (params.search) {
      qb.andWhere(
        '(LOWER(r.name) LIKE LOWER(:q) OR LOWER(r.code) LIKE LOWER(:q))',
        { q: `%${params.search}%` },
      );
    }
    return qb.getMany();
  }

  async findOne(id: string): Promise<Region> {
    const area = await this.regions.findOne({
      where: { id, type: RegionType.AREA },
    });
    if (!area) throw new NotFoundException(`Area ${id} not found`);
    return area;
  }

  async create(dto: CreateAreaDto): Promise<Region> {
    let parent: Region | null = null;
    if (dto.parent_id) {
      parent = await this.regions.findOne({ where: { id: dto.parent_id } });
      if (!parent)
        throw new BadRequestException(`Parent BU ${dto.parent_id} not found`);
      if (parent.type !== RegionType.BU) {
        throw new BadRequestException(
          `parent_id must be a BU (type='bu'); got type='${parent.type}'`,
        );
      }
    }

    const name = dto.name.trim();
    const code = await this.resolveCode(dto.code?.trim(), parent, name);

    const area = this.regions.create({
      code,
      name,
      type: RegionType.AREA,
      parent_id: parent?.id ?? null,
      sort_order: 0,
      active: true,
      display_path: parent ? `${parent.display_path} - ${name}` : name,
    });
    return this.regions.save(area);
  }

  async update(id: string, dto: UpdateAreaDto): Promise<Region> {
    const area = await this.findOne(id);

    if (dto.code !== undefined) {
      const code = dto.code?.trim() || null;
      if (code && code !== area.code) {
        const dup = await this.regions.findOne({ where: { code } });
        if (dup && dup.id !== id)
          throw new ConflictException(`Region code "${code}" already exists`);
        area.code = code;
      }
    }
    if (dto.name !== undefined) area.name = dto.name.trim();
    return this.regions.save(area);
  }

  async remove(
    id: string,
  ): Promise<{ id: string; active: false; soft_deleted: true }> {
    const area = await this.findOne(id);

    const [storeCount, invoiceCount] = await Promise.all([
      this.stores.count({ where: { area_id: id } }),
      this.invoices.count({ where: { area_id: id } }),
    ]);
    if (storeCount > 0 || invoiceCount > 0) {
      throw new ConflictException(
        `Area ${id} still has ${storeCount} store(s) and ${invoiceCount} invoice(s); reassign or remove them first.`,
      );
    }

    area.active = false;
    await this.regions.save(area);
    return { id, active: false, soft_deleted: true };
  }

  private async resolveCode(
    supplied: string | undefined,
    parent: Region | null,
    name: string,
  ): Promise<string> {
    if (supplied) {
      const dup = await this.regions.findOne({ where: { code: supplied } });
      if (dup)
        throw new ConflictException(
          `Region code "${supplied}" already exists`,
        );
      return supplied;
    }
    const slug = name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const base = parent ? `${parent.code}-${slug}` : slug;
    let candidate = base;
    let n = 2;
    while (await this.regions.findOne({ where: { code: candidate } })) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    return candidate;
  }
}
