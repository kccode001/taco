import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Store } from '../database/entities/store.entity';
import { Visit, VisitStatus } from '../database/entities/visit.entity';
import { User, UserRole } from '../database/entities/user.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoreQueryDto } from './dto/store-query.dto';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private storesRepository: Repository<Store>,
    @InjectRepository(Visit)
    private visitsRepository: Repository<Visit>,
  ) {}

  async findAll(
    query: StoreQueryDto,
    user: { id: string; role: UserRole },
  ): Promise<{ data: Store[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb: SelectQueryBuilder<Store> = this.storesRepository
      .createQueryBuilder('store')
      .leftJoinAndSelect('store.territory', 'territory')
      .leftJoinAndSelect('store.assigned_user', 'assigned_user')
      .where('store.is_active = :isActive', { isActive: true });

    // Reps only see stores in their own territory
    if (user.role === UserRole.REP) {
      qb.andWhere('store.assigned_user_id = :userId', { userId: user.id });
    }

    if (query.territory_id) {
      qb.andWhere('store.territory_id = :territoryId', {
        territoryId: query.territory_id,
      });
    }

    if (query.type) {
      qb.andWhere('store.type = :type', { type: query.type });
    }

    if (query.search) {
      qb.andWhere(
        '(store.name ILIKE :search OR store.code ILIKE :search OR store.address ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('store.name', 'ASC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Store> {
    const store = await this.storesRepository.findOne({
      where: { id },
      relations: { territory: true, assigned_user: true },
    });
    if (!store) {
      throw new NotFoundException(`Store with ID ${id} not found`);
    }
    return store;
  }

  async create(createStoreDto: CreateStoreDto): Promise<Store> {
    const existing = await this.storesRepository.findOne({
      where: { code: createStoreDto.code },
    });
    if (existing) {
      throw new ConflictException(`Store code ${createStoreDto.code} is already in use`);
    }

    const store = this.storesRepository.create(createStoreDto);
    return this.storesRepository.save(store);
  }

  async update(id: string, updateStoreDto: UpdateStoreDto): Promise<Store> {
    const store = await this.findOne(id);

    if (updateStoreDto.code && updateStoreDto.code !== store.code) {
      const existing = await this.storesRepository.findOne({
        where: { code: updateStoreDto.code },
      });
      if (existing) {
        throw new ConflictException(`Store code ${updateStoreDto.code} is already in use`);
      }
    }

    await this.storesRepository.update(id, updateStoreDto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.storesRepository.update(id, { is_active: false });
  }

  async getVisitHistory(storeId: string): Promise<Visit[]> {
    await this.findOne(storeId);

    return this.visitsRepository.find({
      where: { store_id: storeId },
      relations: { user: true },
      order: { visit_date: 'DESC', created_at: 'DESC' },
    });
  }

  async getLastVisit(storeId: string): Promise<Visit | null> {
    await this.findOne(storeId);

    return this.visitsRepository.findOne({
      where: { store_id: storeId, status: VisitStatus.SUBMITTED },
      relations: { user: true, sections: true },
      order: { visit_date: 'DESC', submitted_at: 'DESC' },
    });
  }
}
