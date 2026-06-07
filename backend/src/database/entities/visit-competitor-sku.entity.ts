import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { VisitCompetitor } from './visit-competitor.entity';
import { CompetitorSku } from './competitor-sku.entity';
import { VisitTacoSkuUom } from './visit-taco-sku.entity';

@Entity('visit_competitor_skus')
export class VisitCompetitorSku {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_competitor_id: string;

  @ManyToOne(() => VisitCompetitor, (vc) => vc.skus, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_competitor_id' })
  visit_competitor: VisitCompetitor;

  @Column({ nullable: true })
  competitor_sku_id: string;

  @ManyToOne(() => CompetitorSku, { nullable: true, eager: false })
  @JoinColumn({ name: 'competitor_sku_id' })
  competitor_sku: CompetitorSku;

  @Column()
  name: string;

  @Column({ nullable: true })
  kode_sku: string;

  @Column({ nullable: true })
  category: string;

  @Column({ type: 'int', default: 0 })
  harga_beli: number;

  @Column({ type: 'int', default: 0 })
  harga_jual_tukang: number;

  @Column({ type: 'int', default: 0 })
  terjual_qty: number;

  @Column({ type: 'enum', enum: VisitTacoSkuUom, default: VisitTacoSkuUom.PCS })
  uom: VisitTacoSkuUom;

  @Column({ type: 'int', default: 0 })
  stok_on_hand: number;

  @Column({ type: 'text', array: true, default: [] })
  promo: string[];

  @Column({ type: 'text', array: true, default: [] })
  flags: string[];

  @Column({ type: 'text', array: true, default: [] })
  photo_urls: string[];

  @Column({ type: 'text', nullable: true })
  deskripsi: string;

  @CreateDateColumn()
  created_at: Date;
}
