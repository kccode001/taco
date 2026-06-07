import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompetitorBrand } from '../database/entities/competitor-brand.entity';
import { CreateCompetitorBrandDto } from './dto/create-competitor-brand.dto';
import { UpdateCompetitorBrandDto } from './dto/update-competitor-brand.dto';

@Injectable()
export class CompetitorBrandsService {
  constructor(
    @InjectRepository(CompetitorBrand)
    private readonly repo: Repository<CompetitorBrand>,
  ) {}

  findAll(): Promise<CompetitorBrand[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<CompetitorBrand> {
    const brand = await this.repo.findOne({ where: { id } });
    if (!brand) throw new NotFoundException(`CompetitorBrand ${id} not found`);
    return brand;
  }

  create(dto: CreateCompetitorBrandDto): Promise<CompetitorBrand> {
    const brand = this.repo.create(dto);
    return this.repo.save(brand);
  }

  async update(id: string, dto: UpdateCompetitorBrandDto): Promise<CompetitorBrand> {
    const brand = await this.findOne(id);
    Object.assign(brand, dto);
    return this.repo.save(brand);
  }

  async remove(id: string): Promise<void> {
    const brand = await this.findOne(id);
    await this.repo.remove(brand);
  }
}
