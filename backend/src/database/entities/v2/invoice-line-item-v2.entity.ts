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
import { InvoiceV2 } from './invoice-v2.entity';
import { InvoiceImageV2 } from './invoice-image-v2.entity';
import { TacoSku } from '../taco-sku.entity';
import { CompetitorBrand } from '../competitor-brand.entity';
import {
  LineItemV2Classification,
  LineItemV2ConfidenceBand,
} from './invoice-v2.enums';

/**
 * TACO v2 — one OCR-extracted invoice line.
 *
 * Classified into one of the 9 locked buckets (see LineItemV2Classification).
 * Admin resolve (`PATCH /api/v2/invoice-line-items/:id`) lets a human map a
 * TACO SKU, mark it a competitor product, and — when the system's TACO/not-TACO
 * call was wrong — capture a `mismatch_reason` the recommendation engine mines.
 */
@Entity('taro_v2_invoice_line_items')
@Index(['invoice_id'])
@Index(['classification'])
@Index(['needs_review'])
@Index(['matched_sku_id'])
export class InvoiceLineItemV2 {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  invoice_id: string;

  @ManyToOne(() => InvoiceV2, (inv) => inv.line_items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: InvoiceV2;

  /** The image this line was read from (nullable for back-compat). */
  @Column({ type: 'uuid', nullable: true })
  image_id: string | null;

  @ManyToOne(() => InvoiceImageV2, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'image_id' })
  image?: InvoiceImageV2 | null;

  @Column({ type: 'int' })
  line_no: number;

  @Column({ type: 'text' })
  raw_text: string;

  /** Handwritten form before ditto-mark expansion — null when not expanded. */
  @Column({ type: 'text', nullable: true })
  original_text: string | null;

  @Column({
    type: 'enum',
    enum: LineItemV2Classification,
    default: LineItemV2Classification.UNKNOWN_NEEDS_HUMAN,
  })
  classification: LineItemV2Classification;

  @Column({
    type: 'enum',
    enum: LineItemV2ConfidenceBand,
    default: LineItemV2ConfidenceBand.UNKNOWN,
  })
  confidence_band: LineItemV2ConfidenceBand;

  @Column({ type: 'numeric', precision: 4, scale: 3, default: 0 })
  confidence_score: string;

  /** TACO catalog match (mutually exclusive with the competitor path). */
  @Column({ type: 'uuid', nullable: true })
  matched_sku_id: string | null;

  @ManyToOne(() => TacoSku, { nullable: true })
  @JoinColumn({ name: 'matched_sku_id' })
  matched_sku?: TacoSku | null;

  /** Competitor brand match (mutually exclusive with the TACO match). */
  @Column({ type: 'uuid', nullable: true })
  brand_id: string | null;

  @ManyToOne(() => CompetitorBrand, { nullable: true })
  @JoinColumn({ name: 'brand_id' })
  brand?: CompetitorBrand | null;

  @Column({ type: 'text', nullable: true })
  brand_name: string | null;

  /** True when admin marked this a competitor product (known brand or not). */
  @Column({ type: 'boolean', default: false })
  is_competitor: boolean;

  /**
   * Free-text reason captured when the system's TACO/not-TACO call was wrong
   * (admin overrode it). Fuel for the v2 recommendation engine. Null otherwise.
   */
  @Column({ type: 'text', nullable: true })
  mismatch_reason: string | null;

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

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
