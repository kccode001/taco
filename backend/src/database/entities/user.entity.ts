import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Territory } from './territory.entity';

export enum UserRole {
  REP = 'rep',
  MANAGER = 'manager',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password_hash: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.REP })
  role: UserRole;

  @Column({ nullable: true })
  territory_id: string;

  @ManyToOne(() => Territory, { nullable: true, eager: false })
  @JoinColumn({ name: 'territory_id' })
  territory: Territory;

  /** Indonesian mobile phone, kept as raw user-entered text (e.g. "0812-3456-7890"). */
  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ nullable: true })
  refresh_token_hash: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
