import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { StoreV2 } from '../../database/entities/v2/store-v2.entity';
import { AreaV2 } from '../../database/entities/v2/area-v2.entity';
import { InvoiceV2 } from '../../database/entities/v2/invoice-v2.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

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
    @InjectRepository(AreaV2)
    private readonly areas: Repository<AreaV2>,
    @InjectRepository(InvoiceV2)
    private readonly invoices: Repository<InvoiceV2>,
  ) {}

  list(params: { area_id?: string; search?: string }): Promise<StoreV2[]> {
    const where: Record<string, unknown> = {};
    if (params.area_id) where.area_id = params.area_id;
    if (params.search) where.name = ILike(`%${params.search}%`);
    return this.stores.find({ where, order: { name: 'ASC' } });
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
    const count = await this.areas.count({ where: { id: areaId } });
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
