import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Territory } from '../database/entities/territory.entity';
import { CreateWilayahDto } from './dto/create-wilayah.dto';
import { UpdateWilayahDto } from './dto/update-wilayah.dto';

/**
 * Wilayah is the v9 admin-facing name for Territory.
 * Same entity, exposed under /api/wilayah for the admin panel.
 */
@Injectable()
export class WilayahService {
  constructor(
    @InjectRepository(Territory)
    private readonly repo: Repository<Territory>,
  ) {}

  findAll(): Promise<Territory[]> {
    return this.repo.find({ relations: { parent: true }, order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Territory> {
    const w = await this.repo.findOne({ where: { id }, relations: { parent: true } });
    if (!w) throw new NotFoundException(`Wilayah ${id} not found`);
    return w;
  }

  async create(dto: CreateWilayahDto): Promise<Territory> {
    const existing = await this.repo.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Wilayah code ${dto.code} already in use`);
    if (dto.parent_id) await this.findOne(dto.parent_id);
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateWilayahDto): Promise<Territory> {
    const w = await this.findOne(id);
    if (dto.code && dto.code !== w.code) {
      const existing = await this.repo.findOne({ where: { code: dto.code } });
      if (existing) throw new ConflictException(`Wilayah code ${dto.code} already in use`);
    }
    if (dto.parent_id && dto.parent_id === id) {
      throw new ConflictException('Wilayah cannot be its own parent');
    }
    Object.assign(w, dto);
    return this.repo.save(w);
  }

  async remove(id: string): Promise<void> {
    const w = await this.findOne(id);
    await this.repo.remove(w);
  }
}
