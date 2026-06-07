import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BurningQuestion,
  BurningQuestionScope,
} from '../database/entities/burning-question.entity';
import { User, UserRole } from '../database/entities/user.entity';
import { CreateBurningQuestionDto } from './dto/create-burning-question.dto';
import { UpdateBurningQuestionDto } from './dto/update-burning-question.dto';

@Injectable()
export class BurningQuestionsService {
  constructor(
    @InjectRepository(BurningQuestion)
    private readonly repo: Repository<BurningQuestion>,
  ) {}

  /**
   * Reps see company-wide questions + questions scoped to their territory/stores.
   * Admins and managers see all active questions.
   */
  findAll(user: User): Promise<BurningQuestion[]> {
    const qb = this.repo
      .createQueryBuilder('bq')
      .where('bq.is_active = true')
      .orderBy('bq.created_at', 'DESC');

    if (user.role === UserRole.REP) {
      qb.andWhere(
        '(bq.scope = :company OR (bq.scope = :region AND bq.territory_id = :territory_id) OR (bq.scope = :store AND bq.territory_id = :territory_id))',
        {
          company: BurningQuestionScope.COMPANY,
          region: BurningQuestionScope.REGION,
          store: BurningQuestionScope.STORE,
          territory_id: user.territory_id ?? null,
        },
      );
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<BurningQuestion> {
    const bq = await this.repo.findOne({ where: { id } });
    if (!bq) throw new NotFoundException(`BurningQuestion ${id} not found`);
    return bq;
  }

  create(dto: CreateBurningQuestionDto): Promise<BurningQuestion> {
    const bq = this.repo.create(dto);
    return this.repo.save(bq);
  }

  async update(id: string, dto: UpdateBurningQuestionDto): Promise<BurningQuestion> {
    const bq = await this.findOne(id);
    Object.assign(bq, dto);
    return this.repo.save(bq);
  }

  async remove(id: string): Promise<void> {
    const bq = await this.findOne(id);
    await this.repo.remove(bq);
  }
}
