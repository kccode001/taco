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
import { TaroInvoice } from './taro-invoice.entity';
import { TacoSku } from './taco-sku.entity';

/**
 * One row per OCR-extracted line from a Taro invoice page.
 * `needs_review` is computed on persist (confidence < 0.85 OR no matched_sku_id).
 */
@Entity('taro_invoice_line_items')
@Index(['invoice_id'])
@Index(['matched_sku_id'])
@Index(['needs_review'])
export class TaroInvoiceLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  invoice_id: string;

  @ManyToOne(() => TaroInvoice, (inv) => inv.line_items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: TaroInvoice;

  @Column({ type: 'int' })
  line_no: number;

  @Column({ type: 'text' })
  raw_text: string;

  /**
   * The original handwritten line as Claude saw it BEFORE ditto-mark expansion
   * (e.g. "20 -- 1/2 16.000 320.000"). Populated only when `raw_text` was
   * expanded from a ditto mark ("--", "—", "do.", "sda", "''") against the
   * previous line's product — otherwise null.
   *
   * Used by the FE detail page to show admins both "Asli" (handwritten form)
   * and the interpreted product, so they can spot a bad expansion.
   */
  @Column({ type: 'text', nullable: true })
  original_text: string | null;

  @Column({ type: 'uuid', nullable: true })
  matched_sku_id: string | null;

  @ManyToOne(() => TacoSku, { nullable: true })
  @JoinColumn({ name: 'matched_sku_id' })
  matched_sku?: TacoSku | null;

  @Column({ type: 'numeric', precision: 4, scale: 3, default: 0 })
  confidence_score: string;

  @Column({ type: 'boolean', default: true })
  needs_review: boolean;

  @Column({ type: 'numeric', precision: 18, scale: 3, default: 0 })
  quantity: string;

  @Column({ type: 'text', nullable: true })
  unit: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  unit_price: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  total_price: string;

  @Column({ type: 'boolean', default: false })
  edited: boolean;

  /**
   * Best-effort tag for *why* a line wasn't mapped — surfaced in the OCR Gagal
   * page + recommendations so KC can prioritise catalog gaps.
   *
   * Values today:
   *   - 'likely_taco_unmapped' — raw_text references "Taco" / a TACO product
   *     family (engsel, rel, lem, skrup, router) but no catalog SKU matched.
   *   - null — no special reason (either matched, or generic non-TACO row).
   */
  @Column({ type: 'text', nullable: true })
  failure_reason: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
