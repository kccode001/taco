import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Territory } from '../database/entities/territory.entity';
import { CreateTerritoryDto } from './dto/create-territory.dto';
import { UpdateTerritoryDto } from './dto/update-territory.dto';

@Injectable()
export class TerritoriesService {
  constructor(
    @InjectRepository(Territory)
    private territoriesRepository: Repository<Territory>,
  ) {}

  async findAll(): Promise<Territory[]> {
    return this.territoriesRepository.find({
      relations: { parent: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Territory> {
    const territory = await this.territoriesRepository.findOne({
      where: { id },
      relations: { parent: true },
    });
    if (!territory) {
      throw new NotFoundException(`Territory with ID ${id} not found`);
    }
    return territory;
  }

  async create(createTerritoryDto: CreateTerritoryDto): Promise<Territory> {
    const existing = await this.territoriesRepository.findOne({
      where: { code: createTerritoryDto.code },
    });
    if (existing) {
      throw new ConflictException(`Territory code ${createTerritoryDto.code} is already in use`);
    }

    if (createTerritoryDto.parent_id) {
      await this.findOne(createTerritoryDto.parent_id);
    }

    const territory = this.territoriesRepository.create(createTerritoryDto);
    return this.territoriesRepository.save(territory);
  }

  async update(id: string, updateTerritoryDto: UpdateTerritoryDto): Promise<Territory> {
    const territory = await this.findOne(id);

    if (updateTerritoryDto.code && updateTerritoryDto.code !== territory.code) {
      const existing = await this.territoriesRepository.findOne({
        where: { code: updateTerritoryDto.code },
      });
      if (existing) {
        throw new ConflictException(`Territory code ${updateTerritoryDto.code} is already in use`);
      }
    }

    if (updateTerritoryDto.parent_id && updateTerritoryDto.parent_id !== territory.parent_id) {
      if (updateTerritoryDto.parent_id === id) {
        throw new ConflictException('Territory cannot be its own parent');
      }
      await this.findOne(updateTerritoryDto.parent_id);
    }

    await this.territoriesRepository.update(id, updateTerritoryDto);
    return this.findOne(id);
  }
}
