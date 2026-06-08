import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Store } from './store.entity';
import { User } from './user.entity';

export enum VisitScheduleFrequency {
  ONCE = 'once',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

/**
 * Visit Plans / Schedules.
 *
 * Admin assigns recurring visit schedules to sales reps. Staff app pulls
 * today/weekly/upcoming. `sales_staff_id` is an FK to `users` (where
 * role='rep'). A store can only ever be on ONE schedule globally — the
 * unique constraint on `store_id` enforces that even for inactive rows;
 * admin must delete or reassign to move a store.
 */
@Entity('visit_schedules')
export class VisitSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  sales_staff_id: string;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_staff_id' })
  sales_staff: User;

  @Column({ unique: true })
  store_id: string;

  @ManyToOne(() => Store, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column({ type: 'enum', enum: VisitScheduleFrequency })
  frequency: VisitScheduleFrequency;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date', nullable: true })
  end_date: string | null;

  @Column({ type: 'date', nullable: true })
  one_time_date: string | null;

  // 0=Sun..6=Sat — required when frequency='weekly'
  @Column({ type: 'int', array: true, nullable: true })
  weekly_days: number[] | null;

  // 1..31 or -1 for "last day of month" — required when frequency='monthly'
  @Column({ type: 'int', nullable: true })
  monthly_day: number | null;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
