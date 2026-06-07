import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { Visit } from './visit.entity';

@Entity('visit_sections')
export class VisitSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_id: string;

  @ManyToOne(() => Visit, (v) => v.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @Column()
  section_key: string;

  @Column({ type: 'jsonb', default: {} })
  data: Record<string, any>;

  @Column({ nullable: true })
  prefilled_from_visit_id: string;

  @UpdateDateColumn()
  updated_at: Date;
}
