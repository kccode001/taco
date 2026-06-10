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
import { InvoiceImageV2ValidationStatus } from './invoice-v2.enums';

/**
 * TACO v2 — one uploaded image attached to an invoice (multi-photo / gallery).
 *
 * Each image is validated independently: clear enough for OCR? actually an
 * invoice/receipt (handwritten OR digital)? On failure `validation_status` =
 * invalid and `invalid_reason` carries a short Bahasa-Indonesia explanation the
 * PWA shows the sales rep. Re-validation only re-checks `pending` images.
 */
@Entity('taro_v2_invoice_images')
@Index(['invoice_id'])
@Index(['validation_status'])
export class InvoiceImageV2 {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  invoice_id: string;

  @ManyToOne(() => InvoiceV2, (inv) => inv.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: InvoiceV2;

  /** Disk path (under UPLOAD_DIR/taro-v2) of the stored original. */
  @Column({ type: 'text' })
  file_path: string;

  @Column({ type: 'text', nullable: true })
  file_name: string | null;

  @Column({
    type: 'enum',
    enum: InvoiceImageV2ValidationStatus,
    default: InvoiceImageV2ValidationStatus.PENDING,
  })
  validation_status: InvoiceImageV2ValidationStatus;

  /** Bahasa-Indonesia reason, set only when validation_status = invalid. */
  @Column({ type: 'text', nullable: true })
  invalid_reason: string | null;

  /** Sub-signals captured from the validator for audit/debug (nullable). */
  @Column({ type: 'boolean', nullable: true })
  clarity_ok: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  is_invoice: boolean | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
