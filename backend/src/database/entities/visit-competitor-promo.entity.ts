import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { VisitCompetitor } from './visit-competitor.entity';

export enum PromoTipe {
  FREE_GIFT = 'free_gift',
  DIRECT_DISCOUNT = 'direct_discount',
  BUNDLING = 'bundling',
  OTHER = 'other',
}

@Entity('visit_competitor_promos')
export class VisitCompetitorPromo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_competitor_id: string;

  @ManyToOne(() => VisitCompetitor, (vc) => vc.promos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_competitor_id' })
  visit_competitor: VisitCompetitor;

  @Column({ type: 'enum', enum: PromoTipe, default: PromoTipe.OTHER })
  tipe: PromoTipe;

  @Column({ type: 'text' })
  deskripsi: string;

  @Column({ type: 'date', nullable: true })
  tanggal_mulai: string;

  @Column({ type: 'date', nullable: true })
  tanggal_selesai: string;

  @CreateDateColumn()
  created_at: Date;
}
