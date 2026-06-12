import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { StoreV2 } from '../../database/entities/v2/store-v2.entity';
import { Region, RegionType } from '../../database/entities/region.entity';
import { InvoiceV2 } from '../../database/entities/v2/invoice-v2.entity';
import { User } from '../../database/entities/user.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

/** Store row enriched with the display name of the user who introduced it. */
export type StoreV2WithCreator = StoreV2 & { created_by_name: string | null };

/**
 * v2 Stores CRUD — built on Grout's canonical `StoreV2` (`taro_v2_stores`).
 * Stores are Area-scoped. The PWA upload "free-type-new-store" flow also lands
 * here (via create) so a new store is selectable next time — `created_by`
 * records the introducing user.
 */
@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(StoreV2)
    private readonly stores: Repository<StoreV2>,
    @InjectRepository(Region)
    private readonly areas: Repository<Region>,
    @InjectRepository(InvoiceV2)
    private readonly invoices: Repository<InvoiceV2>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * List stores, each enriched with `created_by_name` (the display name of the
   * user who introduced the store) so the management UI can render the person's
   * name instead of a raw user id. Names are batch-resolved in one query.
   */
  async list(params: {
    area_id?: string;
    search?: string;
  }): Promise<StoreV2WithCreator[]> {
    const where: Record<string, unknown> = {};
    if (params.area_id) where.area_id = params.area_id;
    if (params.search) where.name = ILike(`%${params.search}%`);
    const stores = await this.stores.find({ where, order: { name: 'ASC' } });

    const creatorIds = [
      ...new Set(stores.map((s) => s.created_by).filter((id): id is string => !!id)),
    ];
    const nameById = new Map<string, string>();
    if (creatorIds.length) {
      const users = await this.users.find({
        where: { id: In(creatorIds) },
        select: { id: true, name: true },
      });
      for (const u of users) nameById.set(u.id, u.name);
    }

    return stores.map((s) => ({
      ...s,
      created_by_name: s.created_by ? nameById.get(s.created_by) ?? null : null,
    }));
  }

  async findOne(id: string): Promise<StoreV2> {
    const store = await this.stores.findOne({
      where: { id },
      relations: { area: true },
    });
    if (!store) throw new NotFoundException(`Store ${id} not found`);
    return store;
  }

  private async assertAreaExists(areaId: string): Promise<void> {
    const count = await this.areas.count({
      where: { id: areaId, type: RegionType.AREA, active: true },
    });
    if (count === 0) throw new NotFoundException(`Area ${areaId} not found`);
  }

  async create(dto: CreateStoreDto, createdBy?: string): Promise<StoreV2> {
    await this.assertAreaExists(dto.area_id);
    const store = this.stores.create({
      area_id: dto.area_id,
      name: dto.name.trim(),
      created_by: createdBy ?? null,
    });
    return this.stores.save(store);
  }

  async update(id: string, dto: UpdateStoreDto): Promise<StoreV2> {
    const store = await this.findOne(id);
    if (dto.area_id !== undefined && dto.area_id !== store.area_id) {
      await this.assertAreaExists(dto.area_id);
      store.area_id = dto.area_id;
    }
    if (dto.name !== undefined) store.name = dto.name.trim();
    return this.stores.save(store);
  }

  /** Hard delete — refused while invoices reference the store (FK RESTRICT). */
  async remove(id: string): Promise<{ id: string; deleted: true }> {
    await this.findOne(id);
    const invoiceCount = await this.invoices.count({ where: { store_id: id } });
    if (invoiceCount > 0) {
      throw new ConflictException(
        `Store ${id} still has ${invoiceCount} invoice(s); cannot delete.`,
      );
    }
    await this.stores.delete(id);
    return { id, deleted: true };
  }
}
