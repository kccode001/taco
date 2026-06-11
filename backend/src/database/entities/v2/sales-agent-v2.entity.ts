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
import { Region } from '../region.entity';

/**
 * TACO v2 — Sales agent master (management surface, "Sales list" CRUD).
 *
 * A directory entry for the Taro sales team. Distinct from the auth `users`
 * table — this is an admin-managed roster row (name/phone/area), optionally
 * linked to a login user via `user_id`. Area FK points to `regions` (type='area').
 */
@Entity('taro_v2_sales_agents')
@Index(['area_id'])
@Index(['is_active'])
export class SalesAgentV2 {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  /** Optional home area (a `regions` row with type='area'). */
  @Column({ type: 'uuid', nullable: true })
  area_id: string | null;

  @ManyToOne(() => Region, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'area_id' })
  area?: Region | null;

  /** Optional link to the auth `users` row this agent logs in as. */
  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
