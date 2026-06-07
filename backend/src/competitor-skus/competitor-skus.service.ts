import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompetitorSku } from '../database/entities/competitor-sku.entity';
import { CreateCompetitorSkuDto } from './dto/create-competitor-sku.dto';
import { UpdateCompetitorSkuDto } from './dto/update-competitor-sku.dto';
import { CompetitorSkuQueryDto } from './dto/competitor-sku-query.dto';

@Injectable()
export class CompetitorSkusService {
  constructor(
    @InjectRepository(CompetitorSku)
    private readonly repo: Repository<CompetitorSku>,
  ) {}

  findAll(query: CompetitorSkuQueryDto): Promise<CompetitorSku[]> {
    const qb = this.repo
      .createQueryBuilder('sku')
      .leftJoinAndSelect('sku.brand', 'brand')
      .leftJoinAndSelect('sku.mapped_taco_sku', 'mapped_taco_sku')
      .orderBy('sku.created_at', 'DESC');

    if (query.brand_id) {
      qb.andWhere('sku.brand_id = :brand_id', { brand_id: query.brand_id });
    }

    if (query.category) {
      qb.andWhere('sku.category ILIKE :category', { category: `%${query.category}%` });
    }

    return qb.getMany();
  }

  /** Returns SKUs flagged for review: unknown mappings (is_unknown via line items) + explicitly flagged */
  findPendingReview(): Promise<CompetitorSku[]> {
    return this.repo
      .createQueryBuilder('sku')
      .leftJoinAndSelect('sku.brand', 'brand')
      .leftJoinAndSelect('sku.mapped_taco_sku', 'mapped_taco_sku')
      .where('sku.flagged_for_review = true OR sku.confirmed_at IS NULL')
      .orderBy('sku.created_at', 'DESC')
      .getMany();
  }

  async findOne(id: string): Promise<CompetitorSku> {
    const sku = await this.repo.findOne({
      where: { id },
      relations: { brand: true, mapped_taco_sku: true },
    });
    if (!sku) throw new NotFoundException(`CompetitorSku ${id} not found`);
    return sku;
  }

  create(dto: CreateCompetitorSkuDto): Promise<CompetitorSku> {
    const sku = this.repo.create(dto);
    return this.repo.save(sku);
  }

  async update(id: string, dto: UpdateCompetitorSkuDto): Promise<CompetitorSku> {
    const sku = await this.findOne(id);
    Object.assign(sku, dto);
    return this.repo.save(sku);
  }

  async remove(id: string): Promise<void> {
    const sku = await this.findOne(id);
    await this.repo.remove(sku);
  }
}
