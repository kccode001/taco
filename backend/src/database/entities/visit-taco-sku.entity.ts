import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Visit } from './visit.entity';
import { TacoSku } from './taco-sku.entity';

export enum VisitTacoSkuUom {
  BOX = 'box',
  LEMBAR = 'lembar',
  M2 = 'm2',
  PCS = 'pcs',
  M = 'm',
  GULUNGAN = 'gulungan',
  PASANG = 'pasang',
}

export enum VisitDataSource {
  FOTO_KATALOG = 'foto_katalog',
  REKAM_SUARA = 'rekam_suara',
  ISI_MANUAL = 'isi_manual',
}

@Entity('visit_taco_skus')
export class VisitTacoSku {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_id: string;

  @ManyToOne(() => Visit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @Column()
  taco_sku_id: string;

  @ManyToOne(() => TacoSku, { eager: false })
  @JoinColumn({ name: 'taco_sku_id' })
  taco_sku: TacoSku;

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

  @Column({ type: 'enum', enum: VisitDataSource, default: VisitDataSource.ISI_MANUAL })
  source: VisitDataSource;

  @CreateDateColumn()
  created_at: Date;
}
