import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { TaroInvoiceLineItem } from './taro-invoice-line-item.entity';

export enum TaroInvoiceStatus {
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
}

/**
 * Taro Invoices — admin-only bulk invoice upload + OCR feature.
 * Distinct from the rep-flow `invoices` table; do NOT cross-reference.
 */
@Entity('taro_invoices')
@Index(['status'])
@Index(['uploaded_at'])
export class TaroInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  uploaded_at: Date;

  @Column({ type: 'uuid', nullable: true })
  uploaded_by: string | null;

  @Column({ type: 'enum', enum: TaroInvoiceStatus, default: TaroInvoiceStatus.PROCESSING })
  status: TaroInvoiceStatus;

  @Column({ type: 'text', nullable: true })
  supplier_name: string | null;

  @Column({ type: 'date', nullable: true })
  invoice_date: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  total_amount: string | null;

  @Column({ type: 'text' })
  raw_image_url: string;

  @Column({ type: 'int', default: 1 })
  pages: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @Column({ type: 'text', nullable: true })
  file_name: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => TaroInvoiceLineItem, (li) => li.invoice)
  line_items?: TaroInvoiceLineItem[];
}
