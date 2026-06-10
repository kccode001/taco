import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { AreaV2 } from '../../database/entities/v2/area-v2.entity';
import { StoreV2 } from '../../database/entities/v2/store-v2.entity';
import { InvoiceV2 } from '../../database/entities/v2/invoice-v2.entity';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

/**
 * v2 Areas CRUD — built on Grout's canonical `AreaV2` (`taro_v2_areas`).
 * Priority surface: the PWA upload selector (step 1) reads Areas + Stores.
 */
@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(AreaV2)
    private readonly areas: Repository<AreaV2>,
    @InjectRepository(StoreV2)
    private readonly stores: Repository<StoreV2>,
    @InjectRepository(InvoiceV2)
    private readonly invoices: Repository<InvoiceV2>,
  ) {}

  list(params: { search?: string }): Promise<AreaV2[]> {
    return this.areas.find({
      where: params.search ? { name: ILike(`%${params.search}%`) } : {},
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<AreaV2> {
    const area = await this.areas.findOne({ where: { id } });
    if (!area) throw new NotFoundException(`Area ${id} not found`);
    return area;
  }

  create(dto: CreateAreaDto): Promise<AreaV2> {
    const area = this.areas.create({
      name: dto.name.trim(),
      code: dto.code?.trim() || null,
    });
    return this.areas.save(area);
  }

  async update(id: string, dto: UpdateAreaDto): Promise<AreaV2> {
    const area = await this.findOne(id);
    if (dto.name !== undefined) area.name = dto.name.trim();
    if (dto.code !== undefined) area.code = dto.code?.trim() || null;
    return this.areas.save(area);
  }

  /**
   * Hard delete — guarded. Stores FK-cascade off an area and invoices RESTRICT,
   * so refuse deletion while dependents exist rather than cascade-losing stores
   * or hitting a raw FK error. Caller must reassign/remove dependents first.
   */
  async remove(id: string): Promise<{ id: string; deleted: true }> {
    await this.findOne(id);

    const [storeCount, invoiceCount] = await Promise.all([
      this.stores.count({ where: { area_id: id } }),
      this.invoices.count({ where: { area_id: id } }),
    ]);
    if (storeCount > 0 || invoiceCount > 0) {
      throw new ConflictException(
        `Area ${id} still has ${storeCount} store(s) and ${invoiceCount} invoice(s); reassign or remove them first.`,
      );
    }

    await this.areas.delete(id);
    return { id, deleted: true };
  }
}
