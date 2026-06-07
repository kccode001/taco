import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VisitContext } from '../database/entities/visit-context.entity';
import { CreateVisitContextDto } from './dto/create-visit-context.dto';
import { UpdateVisitContextDto } from './dto/update-visit-context.dto';

@Injectable()
export class VisitContextsService {
  constructor(
    @InjectRepository(VisitContext)
    private readonly repo: Repository<VisitContext>,
  ) {}

  findAll(): Promise<VisitContext[]> {
    return this.repo.find({ order: { sort_order: 'ASC', name: 'ASC' } });
  }

  async findOne(id: string): Promise<VisitContext> {
    const ctx = await this.repo.findOne({ where: { id } });
    if (!ctx) throw new NotFoundException(`VisitContext ${id} not found`);
    return ctx;
  }

  create(dto: CreateVisitContextDto): Promise<VisitContext> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateVisitContextDto): Promise<VisitContext> {
    const ctx = await this.findOne(id);
    Object.assign(ctx, dto);
    return this.repo.save(ctx);
  }

  async remove(id: string): Promise<void> {
    const ctx = await this.findOne(id);
    await this.repo.remove(ctx);
  }
}
