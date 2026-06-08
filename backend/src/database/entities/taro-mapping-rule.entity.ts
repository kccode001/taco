import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * Heuristic rules surfaced from admin corrections (via recommendations) and
 * applied by future OCR runs as additional context. Free-form text — Claude
 * reads them as instructions, not parsed.
 */
@Entity('taro_mapping_rules')
export class TaroMappingRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  rule_text: string;

  @Column({ type: 'uuid', nullable: true })
  source_recommendation_id: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;
}
