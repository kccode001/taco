import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Visit } from './visit.entity';

export enum SentimenPemilik {
  SANGAT_POSITIF = 'sangat_positif',
  POSITIF = 'positif',
  NETRAL = 'netral',
  KURANG_PUAS = 'kurang_puas',
  NEGATIF = 'negatif',
}

export enum ProyekSkala {
  KECIL = 'kecil',
  SEDANG = 'sedang',
  BESAR = 'besar',
}

@Entity('visit_sinyal_tokos')
@Unique(['visit_id'])
export class VisitSinyalToko {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_id: string;

  @ManyToOne(() => Visit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @Column({ type: 'enum', enum: SentimenPemilik, default: SentimenPemilik.NETRAL })
  sentimen_pemilik: SentimenPemilik;

  @Column({ type: 'text', nullable: true })
  sentimen_note: string;

  @Column({ type: 'text', array: true, default: [] })
  demand_categories: string[];

  @Column({ type: 'text', nullable: true })
  demand_detail: string;

  @Column({ default: false })
  ada_proyek: boolean;

  @Column({ type: 'text', array: true, nullable: true })
  proyek_tipe: string[];

  @Column({ type: 'enum', enum: ProyekSkala, nullable: true })
  proyek_skala: ProyekSkala;

  @Column({ type: 'text', nullable: true })
  proyek_note: string;

  @Column({ type: 'text', nullable: true })
  peluang_catatan_lain: string;

  @CreateDateColumn()
  created_at: Date;
}
