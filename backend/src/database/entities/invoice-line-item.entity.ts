import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Invoice } from './invoice.entity';
import { TacoSku } from './taco-sku.entity';
import { CompetitorSku } from './competitor-sku.entity';

@Entity('invoice_line_items')
export class InvoiceLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  invoice_id: string;

  @ManyToOne(() => Invoice, (inv) => inv.line_items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ type: 'text' })
  raw_text: string;

  @Column({ nullable: true })
  product_name: string;

  @Column({ type: 'float', nullable: true })
  qty: number;

  @Column({ nullable: true })
  unit: string;

  @Column({ type: 'float', nullable: true })
  unit_price: number;

  @Column({ nullable: true })
  taco_sku_id: string;

  @ManyToOne(() => TacoSku, { nullable: true, eager: false })
  @JoinColumn({ name: 'taco_sku_id' })
  taco_sku: TacoSku;

  @Column({ nullable: true })
  competitor_sku_id: string;

  @ManyToOne(() => CompetitorSku, { nullable: true, eager: false })
  @JoinColumn({ name: 'competitor_sku_id' })
  competitor_sku: CompetitorSku;

  @Column({ type: 'float', nullable: true })
  confidence: number;

  @Column({ default: false })
  is_unclear: boolean;

  @Column({ default: false })
  is_unknown: boolean;

  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn()
  created_at: Date;
}
