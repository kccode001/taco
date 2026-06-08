import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Region } from './region.entity';

/**
 * Many-to-many: each Taro Sales Agent can cover multiple ASM areas.
 *
 * Exactly one row per (user_id, region_id) — composite PK.
 * `is_primary` marks the default region for PWA UI (and is denormalized
 * to `users.taro_region_id` for back-compat / fast lookup).
 *
 * Source of truth = this table. `users.taro_region_id` mirrors the
 * primary row.
 */
@Entity('taro_agent_regions')
@Index(['user_id'])
@Index(['region_id'])
export class TaroAgentRegion {
  @PrimaryColumn({ type: 'uuid' })
  user_id: string;

  @PrimaryColumn({ type: 'uuid' })
  region_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @ManyToOne(() => Region, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'region_id' })
  region?: Region;

  @Column({ type: 'boolean', default: false })
  is_primary: boolean;

  @CreateDateColumn()
  created_at: Date;
}
