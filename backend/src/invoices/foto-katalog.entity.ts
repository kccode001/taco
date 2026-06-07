import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Visit } from '../database/entities/visit.entity';
import { Store } from '../database/entities/store.entity';

export enum FotoKatalogStatus {
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
}

/**
 * TACO Foto Katalog OCR result — the rep photographs the store's posted price
 * board / catalog and we extract TACO product prices for the demo's voice-first
 * data entry path. Separate table from `invoices` (competitor invoices) per
 * AUDIT-009 §03 — two distinct OCR branches.
 *
 * `result_skus` is a JSONB array of suggested TacoSku mappings:
 *   [{ taco_sku_id, taco_sku_code, taco_sku_name, harga_jual_tukang_suggested,
 *      raw_name, raw_price, confidence }]
 */
@Entity('foto_katalogs')
export class FotoKatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_id: string;

  @ManyToOne(() => Visit, { eager: false })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @Column()
  store_id: string;

  @ManyToOne(() => Store, { eager: false })
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column()
  image_path: string;

  @Column({ type: 'enum', enum: FotoKatalogStatus, default: FotoKatalogStatus.PROCESSING })
  status: FotoKatalogStatus;

  @Column({ type: 'jsonb', nullable: true })
  result_skus: Array<{
    taco_sku_id?: string;
    taco_sku_code?: string;
    taco_sku_name?: string;
    harga_jual_tukang_suggested: number;
    raw_name: string;
    raw_price: number;
    confidence: number;
    is_unclear?: boolean;
    is_unknown?: boolean;
  }>;

  @Column({ nullable: true })
  processed_at: Date;

  @Column({ type: 'text', nullable: true })
  error_message: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
