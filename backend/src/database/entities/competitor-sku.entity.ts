import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TacoSku } from './taco-sku.entity';
import { CompetitorBrand } from './competitor-brand.entity';

@Entity('competitor_skus')
export class CompetitorSku {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  brand_id: string;

  @ManyToOne(() => CompetitorBrand, { nullable: true, eager: false })
  @JoinColumn({ name: 'brand_id' })
  brand: CompetitorBrand;

  @Column()
  name: string;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  mapped_taco_sku_id: string;

  @ManyToOne(() => TacoSku, { nullable: true, eager: false })
  @JoinColumn({ name: 'mapped_taco_sku_id' })
  mapped_taco_sku: TacoSku;

  @Column({ type: 'text', nullable: true })
  embedding: string;

  @Column({ default: false })
  is_new: boolean;

  @Column({ default: false })
  is_popular: boolean;

  @Column({ default: false })
  is_top_sku: boolean;

  @Column({ default: false })
  flagged_for_review: boolean;

  @Column({ nullable: true })
  confirmed_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
