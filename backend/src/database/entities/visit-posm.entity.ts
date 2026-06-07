import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Visit } from './visit.entity';
import { PosmAsset } from './posm-asset.entity';

export enum PosmKondisi {
  BAIK = 'baik',
  RUSAK_RINGAN = 'rusak_ringan',
  PERLU_GANTI = 'perlu_ganti',
  TIDAK_ADA = 'tidak_ada',
}

@Entity('visit_posms')
export class VisitPosm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_id: string;

  @ManyToOne(() => Visit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @Column({ nullable: true })
  posm_asset_id: string;

  @ManyToOne(() => PosmAsset, { nullable: true, eager: false })
  @JoinColumn({ name: 'posm_asset_id' })
  posm_asset: PosmAsset;

  @Column({ nullable: true })
  nama: string;

  @Column({ nullable: true })
  photo_url: string;

  @Column({ type: 'enum', enum: PosmKondisi, default: PosmKondisi.BAIK })
  kondisi: PosmKondisi;

  @CreateDateColumn()
  created_at: Date;
}
