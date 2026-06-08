import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TaroInvoiceLineItem } from './taro-invoice-line-item.entity';
import { TacoSku } from './taco-sku.entity';

/**
 * Audit log of admin SKU re-mappings on Taro invoice line items.
 * Used as training signal for the recommendation generator.
 */
@Entity('taro_invoice_sku_corrections')
@Index(['line_item_id'])
@Index(['corrected_at'])
export class TaroInvoiceSkuCorrection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  line_item_id: string;

  @ManyToOne(() => TaroInvoiceLineItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'line_item_id' })
  line_item?: TaroInvoiceLineItem;

  @Column({ type: 'uuid', nullable: true })
  original_sku_id: string | null;

  @ManyToOne(() => TacoSku, { nullable: true })
  @JoinColumn({ name: 'original_sku_id' })
  original_sku?: TacoSku | null;

  @Column({ type: 'uuid' })
  corrected_sku_id: string;

  @ManyToOne(() => TacoSku)
  @JoinColumn({ name: 'corrected_sku_id' })
  corrected_sku?: TacoSku;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'uuid', nullable: true })
  corrected_by: string | null;

  @CreateDateColumn({ name: 'corrected_at' })
  corrected_at: Date;
}
