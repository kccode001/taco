import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Store } from './store.entity';
import { User } from './user.entity';
import { VisitSection } from './visit-section.entity';

export enum VisitStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
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

  @OneToMany(() => VisitSection, (vs) => vs.visit, { cascade: true, eager: false })
  sections: VisitSection[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
