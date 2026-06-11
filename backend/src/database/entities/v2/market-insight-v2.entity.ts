import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * TACO v2 — Persisted AI market-insight (Permintaan Pasar).
 *
 * One row per generate call. The dashboard reads the LATEST row matching
 * (period, area_id) without recomputing — avoids an LLM call on every page
 * load. The Generate button writes a fresh row and the FE shows its timestamp.
 */
@Entity('taro_v2_market_insights')
@Index(['period', 'area_id', 'generated_at'])
export class MarketInsightV2 {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  insight_text: string;

  @Column({ type: 'text', nullable: true })
  model: string | null;

  @Column({ type: 'text' })
  period: string;

  /** NULL = insight was computed over all areas (no area filter). */
  @Column({ type: 'uuid', nullable: true })
  area_id: string | null;

  @CreateDateColumn()
  generated_at: Date;
}
