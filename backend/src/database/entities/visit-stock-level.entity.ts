import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Visit } from './visit.entity';

export enum StockCategory {
  LAMINATE = 'LAMINATE',
  HPL = 'HPL',
  ECO_HPL = 'ECO_HPL',
  SHEET = 'SHEET',
  EDGING = 'EDGING',
  HARDWARE = 'HARDWARE',
  VINYL = 'VINYL',
  PLYWOOD = 'PLYWOOD',
  LAINNYA = 'LAINNYA',
}

export enum StockLevel {
  SANGAT_MINIMUM = 'sangat_minimum',
  STOCK_CUKUP = 'stock_cukup',
  SANGAT_BESAR = 'sangat_besar',
}

@Entity('visit_stock_levels')
@Unique(['visit_id', 'category'])
export class VisitStockLevel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_id: string;

  @ManyToOne(() => Visit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @Column({ type: 'enum', enum: StockCategory })
  category: StockCategory;

  @Column({ type: 'enum', enum: StockLevel })
  level: StockLevel;

  @CreateDateColumn()
  created_at: Date;
}
