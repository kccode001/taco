import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosmAsset } from '../database/entities/posm-asset.entity';
import { VisitObjective } from '../database/entities/visit-objective.entity';
import { VisitContext } from '../database/entities/visit-context.entity';
import { CreatePosmAssetDto } from './dto/create-posm-asset.dto';
import { UpdatePosmAssetDto } from './dto/update-posm-asset.dto';
import { CreateVisitObjectiveDto } from './dto/create-visit-objective.dto';
import { UpdateVisitObjectiveDto } from './dto/update-visit-objective.dto';
import { CreateVisitContextDto } from './dto/create-visit-context.dto';
import { UpdateVisitContextDto } from './dto/update-visit-context.dto';

@Injectable()
export class PosmService {
  constructor(
    @InjectRepository(PosmAsset)
    private readonly posmAssetRepo: Repository<PosmAsset>,
    @InjectRepository(VisitObjective)
    private readonly visitObjectiveRepo: Repository<VisitObjective>,
    @InjectRepository(VisitContext)
    private readonly visitContextRepo: Repository<VisitContext>,
  ) {}

  // ---- POSM Assets ----

  findAllPosmAssets(): Promise<PosmAsset[]> {
    return this.posmAssetRepo.find({ order: { name: 'ASC' } });
  }

  async findOnePosmAsset(id: string): Promise<PosmAsset> {
    const asset = await this.posmAssetRepo.findOne({ where: { id } });
    if (!asset) throw new NotFoundException(`PosmAsset ${id} not found`);
    return asset;
  }

  createPosmAsset(dto: CreatePosmAssetDto): Promise<PosmAsset> {
    const asset = this.posmAssetRepo.create(dto);
    return this.posmAssetRepo.save(asset);
  }

  async updatePosmAsset(id: string, dto: UpdatePosmAssetDto): Promise<PosmAsset> {
    const asset = await this.findOnePosmAsset(id);
    Object.assign(asset, dto);
    return this.posmAssetRepo.save(asset);
  }

  async removePosmAsset(id: string): Promise<void> {
    const asset = await this.findOnePosmAsset(id);
    await this.posmAssetRepo.remove(asset);
  }

  // ---- Visit Objectives ----

  findAllVisitObjectives(): Promise<VisitObjective[]> {
    return this.visitObjectiveRepo.find({ order: { name: 'ASC' } });
  }

  async findOneVisitObjective(id: string): Promise<VisitObjective> {
    const obj = await this.visitObjectiveRepo.findOne({ where: { id } });
    if (!obj) throw new NotFoundException(`VisitObjective ${id} not found`);
    return obj;
  }

  createVisitObjective(dto: CreateVisitObjectiveDto): Promise<VisitObjective> {
    const obj = this.visitObjectiveRepo.create(dto);
    return this.visitObjectiveRepo.save(obj);
  }

  async updateVisitObjective(id: string, dto: UpdateVisitObjectiveDto): Promise<VisitObjective> {
    const obj = await this.findOneVisitObjective(id);
    Object.assign(obj, dto);
    return this.visitObjectiveRepo.save(obj);
  }

  async removeVisitObjective(id: string): Promise<void> {
    const obj = await this.findOneVisitObjective(id);
    await this.visitObjectiveRepo.remove(obj);
  }

  // ---- Visit Contexts ----

  findAllVisitContexts(): Promise<VisitContext[]> {
    return this.visitContextRepo.find({ order: { name: 'ASC' } });
  }

  async findOneVisitContext(id: string): Promise<VisitContext> {
    const ctx = await this.visitContextRepo.findOne({ where: { id } });
    if (!ctx) throw new NotFoundException(`VisitContext ${id} not found`);
    return ctx;
  }

  createVisitContext(dto: CreateVisitContextDto): Promise<VisitContext> {
    const ctx = this.visitContextRepo.create(dto);
    return this.visitContextRepo.save(ctx);
  }

  async updateVisitContext(id: string, dto: UpdateVisitContextDto): Promise<VisitContext> {
    const ctx = await this.findOneVisitContext(id);
    Object.assign(ctx, dto);
    return this.visitContextRepo.save(ctx);
  }

  async removeVisitContext(id: string): Promise<void> {
    const ctx = await this.findOneVisitContext(id);
    await this.visitContextRepo.remove(ctx);
  }
}
