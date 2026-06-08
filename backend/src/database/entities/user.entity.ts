import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Territory } from './territory.entity';
import { Region } from './region.entity';
import { TaroAgentRegion } from './taro-agent-region.entity';

export enum UserRole {
  REP = 'rep',
  MANAGER = 'manager',
  ADMIN = 'admin',
  TARO_AGENT = 'taro_agent',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password_hash: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.REP })
  role: UserRole;

  @Column({ nullable: true })
  territory_id: string;

  @ManyToOne(() => Territory, { nullable: true, eager: false })
  @JoinColumn({ name: 'territory_id' })
  territory: Territory;

  /**
   * Taro Sales Agent's primary region (ASM area) — only used when role=taro_agent.
   * Nullable so other roles don't need to populate it.
   */
  @Column({ type: 'uuid', nullable: true })
  taro_region_id: string | null;

  @ManyToOne(() => Region, { nullable: true, eager: false })
  @JoinColumn({ name: 'taro_region_id' })
  taro_region: Region | null;

  /**
   * Many-to-many region coverage for taro_agent role. Source of truth.
   * `taro_region_id` above is a denormalized copy of the primary row here.
   */
  @OneToMany(() => TaroAgentRegion, (ar) => ar.user)
  taro_agent_regions?: TaroAgentRegion[];

  /** Indonesian mobile phone, kept as raw user-entered text (e.g. "0812-3456-7890"). */
  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ nullable: true })
  refresh_token_hash: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
