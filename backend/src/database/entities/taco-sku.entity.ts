import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// Sales survey grouping for D3 stock-level cards. KC's mapping
// from SKU prefix → product_line is pending — leave nullable per SKU.
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

// Real catalog grouping from taco-catalog.xlsx.
export enum CatalogCategory {
  LAMINATES = 'Laminates',
  FLOORING = 'Flooring',
  HARDWARE = 'Hardware',
  FIDECO = 'FIDECO',
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
@Index(['catalog_category'])
@Index(['sku_prefix'])
export class TacoSku {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  // Sales survey grouping (D3 stock-level). Nullable until KC confirms
  // prefix → product_line mapping.
  @Column({ type: 'enum', enum: TacoSkuCategory, nullable: true })
  category: TacoSkuCategory | null;

  // Real catalog grouping (xlsx column 1).
  @Column({ type: 'text', nullable: true })
  catalog_category: string | null;

  // First whitespace token of SKU code (TH, TS, TE, TI, ES, FWP, ...).
  // Used later to back-fill the 9-cat product_line enum.
  @Column({ type: 'text', nullable: true })
  sku_prefix: string | null;

  // Comma-separated synonyms parsed into a string[] for embedding text.
  @Column({ type: 'text', array: true, default: () => "'{}'::text[]" })
  product_name_aliases: string[];

  // Canonical unit from xlsx (e.g. PCS, SET, BTL).
  @Column({ type: 'text', nullable: true })
  unit: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'::text[]" })
  unit_aliases: string[];

  // IDR, integer rupiah.
  @Column({ type: 'int', default: 0 })
  min_price: number;

  @Column({ type: 'int', default: 0 })
  max_price: number;

  @Column({ type: 'int', default: 0 })
  avg_price: number;

  // Legacy single-price (kept for back-compat with existing pricing fields).
  // Equals avg_price by default.
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
