import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum TacoSkuCategory {
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

const CATEGORY_ALIASES: Record<string, TacoSkuCategory> = {
  laminate: TacoSkuCategory.LAMINATE,
  hpl: TacoSkuCategory.HPL,
  'eco hpl': TacoSkuCategory.ECO_HPL,
  eco_hpl: TacoSkuCategory.ECO_HPL,
  'eco-hpl': TacoSkuCategory.ECO_HPL,
  sheet: TacoSkuCategory.SHEET,
  edging: TacoSkuCategory.EDGING,
  hardware: TacoSkuCategory.HARDWARE,
  vinyl: TacoSkuCategory.VINYL,
  plywood: TacoSkuCategory.PLYWOOD,
  lainnya: TacoSkuCategory.LAINNYA,
};

export function normalizeTacoSkuCategory(input: string): TacoSkuCategory | null {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? null;
}

@Entity('taco_skus')
export class TacoSku {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: TacoSkuCategory, default: TacoSkuCategory.LAINNYA })
  category: TacoSkuCategory;

  @Column({ type: 'float', default: 0 })
  standard_price: number;

  @Column({ default: 'pcs' })
  uom: string;

  @Column({ type: 'text', nullable: true })
  embedding: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
