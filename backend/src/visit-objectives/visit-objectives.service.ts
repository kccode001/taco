import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VisitObjective } from '../database/entities/visit-objective.entity';
import { CreateVisitObjectiveDto } from './dto/create-visit-objective.dto';
import { UpdateVisitObjectiveDto } from './dto/update-visit-objective.dto';

@Injectable()
export class VisitObjectivesService {
  constructor(
    @InjectRepository(VisitObjective)
    private readonly repo: Repository<VisitObjective>,
  ) {}

  findAll(): Promise<VisitObjective[]> {
    return this.repo.find({ order: { sort_order: 'ASC', name: 'ASC' } });
  }

  async findOne(id: string): Promise<VisitObjective> {
    const obj = await this.repo.findOne({ where: { id } });
    if (!obj) throw new NotFoundException(`VisitObjective ${id} not found`);
    return obj;
  }

  create(dto: CreateVisitObjectiveDto): Promise<VisitObjective> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateVisitObjectiveDto): Promise<VisitObjective> {
    const obj = await this.findOne(id);
    Object.assign(obj, dto);
    return this.repo.save(obj);
  }

  async remove(id: string): Promise<void> {
    const obj = await this.findOne(id);
    await this.repo.remove(obj);
  }
}
