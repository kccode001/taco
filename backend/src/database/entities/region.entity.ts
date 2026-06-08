import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RegionType {
  REGION = 'region',
  BU = 'bu',
  AREA = 'area',
}

/**
 * KC's territory hierarchy (NEW — does NOT replace `wilayah`).
 *
 *   region (C, E, J, OI, SUM)
 *     └─ bu (C-BU1, E-BU1, ...)
 *          └─ area (C-BU1-ASM-CIREBON, ...)
 *
 * Only `area` rows are valid for tagging Taro invoices and other
 * leaf-level work.
 */
@Entity('regions')
@Index(['type'])
@Index(['parent_id'])
@Index(['code'], { unique: true })
export class Region {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  code: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'enum', enum: RegionType })
  type: RegionType;

  @Column({ type: 'uuid', nullable: true })
  parent_id: string | null;

  @ManyToOne(() => Region, { nullable: true, eager: false })
  @JoinColumn({ name: 'parent_id' })
  parent: Region | null;

  @OneToMany(() => Region, (r) => r.parent)
  children?: Region[];

  /** Denormalised "C - BU1 - ASM Cirebon" path for UI dropdowns. */
  @Column({ type: 'text', default: '' })
  display_path: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
