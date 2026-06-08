import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum TaroRecommendationType {
  ADD_SYNONYM = 'add_synonym',
  CREATE_SKU = 'create_sku',
  MAPPING_RULE = 'mapping_rule',
}

export enum TaroRecommendationStatus {
  PENDING = 'pending',
  APPLIED = 'applied',
  DISMISSED = 'dismissed',
}

/**
 * AI-generated improvement card for the TACO SKU catalog,
 * derived from admin correction history.
 */
@Entity('taro_invoice_recommendations')
@Index(['status'])
@Index(['generated_at'])
export class TaroInvoiceRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TaroRecommendationType })
  type: TaroRecommendationType;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  suggested_payload: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: TaroRecommendationStatus,
    default: TaroRecommendationStatus.PENDING,
  })
  status: TaroRecommendationStatus;

  @CreateDateColumn({ name: 'generated_at' })
  generated_at: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  applied_at: Date | null;
}
