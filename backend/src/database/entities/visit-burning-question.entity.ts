import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Visit } from './visit.entity';
import { BurningQuestion } from './burning-question.entity';

@Entity('visit_burning_questions')
export class VisitBurningQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_id: string;

  @ManyToOne(() => Visit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @Column()
  burning_question_id: string;

  @ManyToOne(() => BurningQuestion, { eager: false })
  @JoinColumn({ name: 'burning_question_id' })
  burning_question: BurningQuestion;

  @Column({ type: 'text' })
  answer_text: string;

  @Column({ nullable: true })
  answer_audio_url: string;

  @CreateDateColumn()
  created_at: Date;
}
