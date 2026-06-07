import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Visit } from './visit.entity';
import { Store } from './store.entity';
import { InvoiceLineItem } from './invoice-line-item.entity';

export enum InvoiceStatus {
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
}

@Entity('invoices')
export class Invoice {
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

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.PROCESSING })
  status: InvoiceStatus;

  @Column({ nullable: true })
  processed_at: Date;

  @Column({ nullable: true, type: 'text' })
  error_message: string;

  @OneToMany(() => InvoiceLineItem, (li) => li.invoice, { cascade: true, eager: false })
  line_items: InvoiceLineItem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
