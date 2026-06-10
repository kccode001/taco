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
 * TACO v2 — Sales agent master (management surface, "Sales list" CRUD).
 *
 * A directory entry for the Taro sales team. Distinct from the auth `users`
 * table — this is an admin-managed roster row (name/phone/area), optionally
 * linked to a login user via `user_id`. New v2 table.
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

  /** Optional home area for this agent. */
  @Column({ type: 'uuid', nullable: true })
  area_id: string | null;

  @ManyToOne(() => AreaV2, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'area_id' })
  area?: AreaV2 | null;

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
