import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AreaV2 } from './area-v2.entity';

/**
 * TACO v2 — Store master (management surface, CRUD).
 *
 * A store belongs to one Area. The PWA upload step-1 lets the sales team pick
 * an existing store OR free-type a new one — a free-typed store is persisted
 * here (via the invoice-create path) so it's selectable next time. `created_by`
 * records the user id that first introduced it (nullable for seed/admin rows).
 */
@Entity('taro_v2_stores')
@Index(['area_id'])
@Index(['name'])
export class StoreV2 {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  area_id: string;

  @ManyToOne(() => AreaV2, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'area_id' })
  area?: AreaV2;

  @Column({ type: 'text' })
  name: string;

  /** User id that first created this store (e.g. via free-type on upload). */
  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
