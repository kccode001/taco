import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Store } from './store.entity';
import { User } from './user.entity';
import { VisitSection } from './visit-section.entity';
import { VisitObjective } from './visit-objective.entity';
import { VisitContext } from './visit-context.entity';
import { Pic } from './pic.entity';
import { VisitTacoSku } from './visit-taco-sku.entity';
import { VisitStockLevel } from './visit-stock-level.entity';
import { VisitPosm } from './visit-posm.entity';
import { VisitCompetitor } from './visit-competitor.entity';
import { VisitBurningQuestion } from './visit-burning-question.entity';
import { VisitSinyalToko } from './visit-sinyal-toko.entity';

export enum VisitStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
}

export enum VisitDataSourceKind {
  OWNER_PIC = 'owner_pic',
  SELF_ESTIMATION = 'self_estimation',
  TIDAK_TAHU = 'tidak_tahu',
  LAINNYA = 'lainnya',
}

export enum VisitSubmissionMethod {
  VOICE_FIRST = 'voice_first',
  MANUAL = 'manual',
}

@Entity('visits')
export class Visit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  store_id: string;

  @ManyToOne(() => Store, { eager: false })
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column()
  user_id: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'date', nullable: true })
  visit_date: string;

  @Column({ type: 'enum', enum: VisitStatus, default: VisitStatus.DRAFT })
  status: VisitStatus;

  @Column({ nullable: true })
  prior_visit_id: string;

  @Column({ type: 'text', array: true, default: [] })
  changed_sections: string[];

  @Column({ nullable: true })
  submitted_at: Date;

  @Column({ nullable: true })
  visit_objective_id: string;

  @ManyToOne(() => VisitObjective, { nullable: true, eager: false })
  @JoinColumn({ name: 'visit_objective_id' })
  visit_objective: VisitObjective;

  @ManyToMany(() => Pic, { eager: false })
  @JoinTable({
    name: 'visit_pics',
    joinColumn: { name: 'visit_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'pic_id', referencedColumnName: 'id' },
  })
  pics: Pic[];

  @ManyToMany(() => VisitContext, { eager: false })
  @JoinTable({
    name: 'visit_visit_contexts',
    joinColumn: { name: 'visit_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'visit_context_id', referencedColumnName: 'id' },
  })
  contexts: VisitContext[];

  @Column({ type: 'text', nullable: true })
  notable_things: string;

  @Column({ type: 'text', nullable: true })
  notable_audio_url: string;

  @Column({
    type: 'enum',
    enum: VisitDataSourceKind,
    nullable: true,
  })
  data_source: VisitDataSourceKind;

  @Column({ type: 'text', nullable: true })
  data_source_note: string;

  @Column({
    type: 'enum',
    enum: VisitSubmissionMethod,
    default: VisitSubmissionMethod.MANUAL,
  })
  submission_method: VisitSubmissionMethod;

  @Column({ type: 'text', nullable: true })
  voice_recording_url: string;

  @Column({ type: 'text', nullable: true })
  voice_transcript: string;

  @Column({ type: 'jsonb', nullable: true })
  voice_ai_summary: Record<string, any>;

  @Index({ unique: true, where: '"idempotency_key" IS NOT NULL' })
  @Column({ nullable: true })
  idempotency_key: string;

  @OneToMany(() => VisitSection, (vs) => vs.visit, { cascade: true, eager: false })
  sections: VisitSection[];

  @OneToMany(() => VisitTacoSku, (vts) => vts.visit, { cascade: true, eager: false })
  taco_skus: VisitTacoSku[];

  @OneToMany(() => VisitStockLevel, (vsl) => vsl.visit, { cascade: true, eager: false })
  stock_levels: VisitStockLevel[];

  @OneToMany(() => VisitPosm, (vp) => vp.visit, { cascade: true, eager: false })
  posms: VisitPosm[];

  @OneToMany(() => VisitCompetitor, (vc) => vc.visit, { cascade: true, eager: false })
  competitors: VisitCompetitor[];

  @OneToMany(() => VisitBurningQuestion, (vbq) => vbq.visit, { cascade: true, eager: false })
  burning_question_answers: VisitBurningQuestion[];

  @OneToMany(() => VisitSinyalToko, (vst) => vst.visit, { cascade: true, eager: false })
  sinyal_tokos: VisitSinyalToko[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
