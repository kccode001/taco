import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosmAsset } from '../database/entities/posm-asset.entity';
import { CreatePosmAssetDto } from './dto/create-posm-asset.dto';
import { UpdatePosmAssetDto } from './dto/update-posm-asset.dto';

@Injectable()
export class PosmService {
  constructor(
    @InjectRepository(PosmAsset)
    private readonly posmAssetRepo: Repository<PosmAsset>,
  ) {}

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
}
