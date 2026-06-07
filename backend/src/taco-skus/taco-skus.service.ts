import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import OpenAI from 'openai';
import { TacoSku } from '../database/entities/taco-sku.entity';
import { CreateTacoSkuDto } from './dto/create-taco-sku.dto';
import { UpdateTacoSkuDto } from './dto/update-taco-sku.dto';
import { SkuQueryDto } from './dto/sku-query.dto';

interface CsvRow {
  code: string;
  name: string;
  category: string;
  standard_price: string;
  uom: string;
}

@Injectable()
export class TacoSkusService {
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(TacoSku)
    private readonly tacoSkusRepo: Repository<TacoSku>,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async findAll(query: SkuQueryDto): Promise<TacoSku[]> {
    const where: any = { is_active: true };

    if (query.category) {
      where.category = ILike(`%${query.category}%`);
    }

    if (query.search) {
      // Use query builder for OR search across name and code
      return this.tacoSkusRepo
        .createQueryBuilder('sku')
        .where('sku.is_active = :active', { active: true })
        .andWhere(
          '(sku.name ILIKE :search OR sku.code ILIKE :search OR sku.category ILIKE :search)',
          { search: `%${query.search}%` },
        )
        .andWhere(query.category ? 'sku.category ILIKE :category' : '1=1', {
          category: query.category ? `%${query.category}%` : '',
        })
        .orderBy('sku.name', 'ASC')
        .getMany();
    }

    return this.tacoSkusRepo.find({
      where,
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<TacoSku> {
    const sku = await this.tacoSkusRepo.findOne({ where: { id } });
    if (!sku) {
      throw new NotFoundException(`TacoSku ${id} not found`);
    }
    return sku;
  }

  async create(dto: CreateTacoSkuDto): Promise<TacoSku> {
    const sku = this.tacoSkusRepo.create({
      code: dto.code,
      name: dto.name,
      category: dto.category,
      standard_price: dto.standard_price,
      uom: dto.uom || 'pcs',
    });

    const saved = await this.tacoSkusRepo.save(sku);

    // Generate embedding in background (non-blocking)
    this.generateEmbedding(saved).catch((err) =>
      console.error(`Failed to generate embedding for SKU ${saved.id}:`, err),
    );

    return saved;
  }

  async bulkImport(csvContent: string): Promise<{ created: number; errors: string[] }> {
    const lines = csvContent.split('\n').filter((l) => l.trim());
    if (lines.length < 2) {
      return { created: 0, errors: ['CSV must have header row and at least one data row'] };
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const requiredColumns = ['code', 'name', 'category', 'standard_price'];
    const missingColumns = requiredColumns.filter((col) => !header.includes(col));

    if (missingColumns.length > 0) {
      return { created: 0, errors: [`Missing required columns: ${missingColumns.join(', ')}`] };
    }

    const errors: string[] = [];
    const skus: TacoSku[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      if (values.length < requiredColumns.length) {
        errors.push(`Row ${i + 1}: insufficient columns`);
        continue;
      }

      const row: CsvRow = {
        code: values[header.indexOf('code')] || '',
        name: values[header.indexOf('name')] || '',
        category: values[header.indexOf('category')] || '',
        standard_price: values[header.indexOf('standard_price')] || '0',
        uom: header.includes('uom') ? values[header.indexOf('uom')] || 'pcs' : 'pcs',
      };

      if (!row.code || !row.name || !row.category) {
        errors.push(`Row ${i + 1}: code, name, and category are required`);
        continue;
      }

      const price = parseFloat(row.standard_price);
      if (isNaN(price)) {
        errors.push(`Row ${i + 1}: invalid standard_price "${row.standard_price}"`);
        continue;
      }

      try {
        const sku = this.tacoSkusRepo.create({
          code: row.code,
          name: row.name,
          category: row.category,
          standard_price: price,
          uom: row.uom,
        });
        const saved = await this.tacoSkusRepo.save(sku);
        skus.push(saved);
      } catch (err) {
        errors.push(
          `Row ${i + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
      }
    }

    // Generate embeddings for all created SKUs in background
    Promise.allSettled(skus.map((sku) => this.generateEmbedding(sku))).catch((err) =>
      console.error('Bulk embedding generation error:', err),
    );

    return { created: skus.length, errors };
  }

  async update(id: string, dto: UpdateTacoSkuDto): Promise<TacoSku> {
    const sku = await this.findOne(id);

    const nameChanged = dto.name !== undefined && dto.name !== sku.name;
    const categoryChanged = dto.category !== undefined && dto.category !== sku.category;

    Object.assign(sku, dto);
    const saved = await this.tacoSkusRepo.save(sku);

    // Regenerate embedding if name or category changed
    if (nameChanged || categoryChanged) {
      this.generateEmbedding(saved).catch((err) =>
        console.error(`Failed to regenerate embedding for SKU ${saved.id}:`, err),
      );
    }

    return saved;
  }

  async remove(id: string): Promise<void> {
    const sku = await this.findOne(id);
    await this.tacoSkusRepo.remove(sku);
  }

  async generateEmbedding(sku: TacoSku): Promise<void> {
    const text = `${sku.code} ${sku.name} ${sku.category}`;

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
    });

    const embedding = response.data[0].embedding;
    await this.tacoSkusRepo.update(sku.id, {
      embedding: JSON.stringify(embedding),
    });
  }
}
