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
import { InvoiceLineItemV2 } from './invoice-line-item-v2.entity';

/**
 * TACO v2 — reason-derived recommendation (MANAGEMENT surface, Mortar-owned).
 *
 * Each row is mined from a line item's `mismatch_reason` — the free-text note an
 * admin captured on the v2 resolve flow when the system's TACO/not-TACO call was
 * wrong. The engine turns that reason into a sensible suggested action and tags
 * it `auto_actionable`:
 *   true  → the system can mechanically apply it (add a SKU synonym / create a
 *           catalog SKU) → FE shows the "Terapkan" button.
 *   false → no safe auto-action → FE shows acknowledge-only ("Akui").
 *
 * New v2 table; does NOT fork v1's `taro_invoice_recommendations`. Belongs to
 * Pair B's management surface — Grout's canonical spine is untouched.
 */
export enum RecommendationV2Status {
  PENDING = 'pending',
  APPLIED = 'applied',
  ACKNOWLEDGED = 'acknowledged',
  DISMISSED = 'dismissed',
}

/**
 * The mechanical action a recommendation can perform on apply. Only the
 * actions the system can safely execute end-to-end live here; anything else is
 * acknowledge-only (auto_actionable=false, action_type=null).
 */
export enum RecommendationV2ActionType {
  ADD_SYNONYM = 'add_synonym', // append raw text as an alias of a matched TacoSku
  CREATE_SKU = 'create_sku', // create a minimal TacoSku in the catalog
}

@Entity('taro_v2_recommendations')
@Index(['status'])
@Index(['auto_actionable'])
@Index(['source_line_item_id'], { unique: true })
export class RecommendationV2 {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The line item whose mismatch_reason seeded this recommendation. Unique so
   * the generator is idempotent (one rec per resolved-mismatch line). Nullable
   * for any future non-line-derived recs.
   */
  @Column({ type: 'uuid', nullable: true })
  source_line_item_id: string | null;

  @ManyToOne(() => InvoiceLineItemV2, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_line_item_id' })
  source_line_item?: InvoiceLineItemV2 | null;

  /** Area the source invoice belongs to — lets the FE filter recs by area. */
  @Column({ type: 'uuid', nullable: true })
  area_id: string | null;

  /** The raw mismatch_reason text this rec was derived from. */
  @Column({ type: 'text' })
  source_reason: string;

  /** Coarse category of the suggestion (add_synonym, create_sku, train, ...). */
  @Column({ type: 'text' })
  kind: string;

  /** Short Bahasa-Indonesia headline shown on the recommendation card. */
  @Column({ type: 'text' })
  title: string;

  /** Longer Bahasa-Indonesia explanation / rationale. */
  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @Column({ type: 'boolean', default: false })
  auto_actionable: boolean;

  @Column({
    type: 'enum',
    enum: RecommendationV2ActionType,
    nullable: true,
  })
  action_type: RecommendationV2ActionType | null;

  /** Structured args for the auto-action (e.g. { sku_id, synonym } / { code, name }). */
  @Column({ type: 'jsonb', nullable: true })
  action_payload: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: RecommendationV2Status,
    default: RecommendationV2Status.PENDING,
  })
  status: RecommendationV2Status;

  /** Human-readable outcome recorded when applied (what actually changed). */
  @Column({ type: 'text', nullable: true })
  applied_result: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
