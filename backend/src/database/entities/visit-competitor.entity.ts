import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { Visit } from './visit.entity';
import { CompetitorBrand } from './competitor-brand.entity';
import { VisitCompetitorSku } from './visit-competitor-sku.entity';
import { VisitCompetitorPromo } from './visit-competitor-promo.entity';
import { VisitCompetitorPosm } from './visit-competitor-posm.entity';

@Entity('visit_competitors')
export class VisitCompetitor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_id: string;

  @ManyToOne(() => Visit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @Column()
  competitor_brand_id: string;

  @ManyToOne(() => CompetitorBrand, { eager: false })
  @JoinColumn({ name: 'competitor_brand_id' })
  competitor_brand: CompetitorBrand;

  @OneToMany(() => VisitCompetitorSku, (s) => s.visit_competitor, {
    cascade: true,
    eager: false,
  })
  skus: VisitCompetitorSku[];

  @OneToMany(() => VisitCompetitorPromo, (p) => p.visit_competitor, {
    cascade: true,
    eager: false,
  })
  promos: VisitCompetitorPromo[];

  @OneToMany(() => VisitCompetitorPosm, (p) => p.visit_competitor, {
    cascade: true,
    eager: false,
  })
  posms: VisitCompetitorPosm[];

  @CreateDateColumn()
  created_at: Date;
}
