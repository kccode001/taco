import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TaroInvoiceLineItem } from './taro-invoice-line-item.entity';
import { Region } from './region.entity';
import { User } from './user.entity';

export enum TaroInvoiceStatus {
  QUEUED = 'queued',
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

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'uploaded_by' })
  uploaded_by_user: User | null;

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

  /**
   * Store name where this Taro invoice was uploaded from — captured at upload
   * time by the sales agent. Nullable for back-compat with pre-split rows.
   */
  @Column({ type: 'text', nullable: true })
  store_name: string | null;

  /** Region area tagged at upload time — nullable for back-compat. */
  @Column({ type: 'uuid', nullable: true })
  region_id: string | null;

  @ManyToOne(() => Region, { nullable: true, eager: false })
  @JoinColumn({ name: 'region_id' })
  region: Region | null;

  /**
   * Best-effort 0..100 progress so the upload page can recover after refresh.
   *   queued       = 0
   *   processing   = 10
   *   ocr_started  = 20
   *   ocr_done     = 70
   *   mapping_done = 90
   *   done         = 100
   */
  @Column({ type: 'int', default: 0 })
  progress_percent: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => TaroInvoiceLineItem, (li) => li.invoice)
  line_items?: TaroInvoiceLineItem[];
}
