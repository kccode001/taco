import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pic } from '../database/entities/pic.entity';
import { Store } from '../database/entities/store.entity';
import { CreatePicDto } from './dto/create-pic.dto';
import { UpdatePicDto } from './dto/update-pic.dto';

@Injectable()
export class PicsService {
  constructor(
    @InjectRepository(Pic) private readonly picsRepo: Repository<Pic>,
    @InjectRepository(Store) private readonly storesRepo: Repository<Store>,
  ) {}

  findAll(storeId?: string): Promise<Pic[]> {
    return this.picsRepo.find({
      where: storeId ? { store_id: storeId } : {},
      order: { is_primary: 'DESC', name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Pic> {
    const pic = await this.picsRepo.findOne({ where: { id } });
    if (!pic) throw new NotFoundException(`Pic ${id} not found`);
    return pic;
  }

  async create(dto: CreatePicDto): Promise<Pic> {
    const pic = this.picsRepo.create(dto);
    const saved = await this.picsRepo.save(pic);
    if (saved.store_id) await this.recountStore(saved.store_id);
    return saved;
  }

  async update(id: string, dto: UpdatePicDto): Promise<Pic> {
    const pic = await this.findOne(id);
    const prevStoreId = pic.store_id;
    Object.assign(pic, dto);
    const saved = await this.picsRepo.save(pic);
    if (prevStoreId && prevStoreId !== saved.store_id) await this.recountStore(prevStoreId);
    if (saved.store_id) await this.recountStore(saved.store_id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const pic = await this.findOne(id);
    await this.picsRepo.remove(pic);
    if (pic.store_id) await this.recountStore(pic.store_id);
  }

  private async recountStore(storeId: string): Promise<void> {
    const count = await this.picsRepo.count({ where: { store_id: storeId } });
    await this.storesRepo.update(storeId, { assigned_pic_count: count });
  }
}
