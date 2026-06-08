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
  UPDATE_SKU_KNOWLEDGE = 'update_sku_knowledge',
  INVESTIGATE_COMPETITOR = 'investigate_competitor',
}

export enum TaroRecommendationStatus {
  PENDING = 'pending',
  APPLIED = 'applied',
  DISMISSED = 'dismissed',
}

export enum TaroRecommendationSource {
  CORRECTION = 'correction',
  FAILED_OCR = 'failed_ocr',
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

  /**
   * Which dataset triggered this card — admin corrections vs. failed OCR.
   * Allows FE to badge cards from the new failed-OCR pipeline differently.
   */
  @Column({
    type: 'enum',
    enum: TaroRecommendationSource,
    default: TaroRecommendationSource.CORRECTION,
  })
  source: TaroRecommendationSource;

  @CreateDateColumn({ name: 'generated_at' })
  generated_at: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  applied_at: Date | null;
}
