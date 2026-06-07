import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { VisitCompetitor } from './visit-competitor.entity';
import { PosmKondisi } from './visit-posm.entity';

@Entity('visit_competitor_posms')
export class VisitCompetitorPosm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_competitor_id: string;

  @ManyToOne(() => VisitCompetitor, (vc) => vc.posms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_competitor_id' })
  visit_competitor: VisitCompetitor;

  @Column()
  nama: string;

  @Column({ nullable: true })
  photo_url: string;

  @Column({ type: 'enum', enum: PosmKondisi, default: PosmKondisi.BAIK })
  kondisi: PosmKondisi;

  @CreateDateColumn()
  created_at: Date;
}
