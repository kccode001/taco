import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { AreaV2 } from './area-v2.entity';
import { StoreV2 } from './store-v2.entity';
import { User } from '../user.entity';
import { InvoiceImageV2 } from './invoice-image-v2.entity';
import { InvoiceLineItemV2 } from './invoice-line-item-v2.entity';
import { InvoiceV2Status } from './invoice-v2.enums';

/**
 * TACO v2 — invoice header (PWA upload → admin resolve spine).
 *
 * Created at upload step-1 with an Area + Store. Carries N images (multi-photo
 * / gallery), each validated independently; once all images pass, OCR runs and
 * produces line items. New v2 table — fully independent of v1 `taro_invoices`.
 */
@Entity('taro_v2_invoices')
@Index(['status'])
@Index(['area_id'])
@Index(['store_id'])
@Index(['uploaded_by'])
export class InvoiceV2 {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  area_id: string;

  @ManyToOne(() => AreaV2, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'area_id' })
  area?: AreaV2;

  @Column({ type: 'uuid' })
  store_id: string;

  @ManyToOne(() => StoreV2, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'store_id' })
  store?: StoreV2;

  @Column({ type: 'uuid', nullable: true })
  uploaded_by: string | null;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'uploaded_by' })
  uploaded_by_user?: User | null;

  @Column({
    type: 'enum',
    enum: InvoiceV2Status,
    default: InvoiceV2Status.VALIDATING,
  })
  status: InvoiceV2Status;

  @Column({ type: 'text', nullable: true })
  supplier_name: string | null;

  @Column({ type: 'date', nullable: true })
  invoice_date: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  total_amount: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  /** 0..100 best-effort progress for the refresh-resilient upload view. */
  @Column({ type: 'int', default: 0 })
  progress_percent: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => InvoiceImageV2, (img) => img.invoice)
  images?: InvoiceImageV2[];

  @OneToMany(() => InvoiceLineItemV2, (li) => li.invoice)
  line_items?: InvoiceLineItemV2[];
}
