import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * TACO v2 — Area master (management surface, CRUD).
 *
 * A sales/distribution area an invoice is uploaded against. Owned by Grout as
 * canonical schema; Mortar builds the CRUD API on top. New v2 table — v1 stays
 * frozen, do NOT cross-reference the v1 `regions`/`territories` tables here.
 */
@Entity('taro_v2_areas')
@Index(['name'])
export class AreaV2 {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  /** Optional short code (e.g. "JKT-S"). Nullable — free-form areas allowed. */
  @Column({ type: 'text', nullable: true })
  code: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
