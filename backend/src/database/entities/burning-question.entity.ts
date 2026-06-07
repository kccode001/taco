import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum BurningQuestionScope {
  COMPANY = 'company',
  REGION = 'region',
  STORE = 'store',
}

@Entity('burning_questions')
export class BurningQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'enum', enum: BurningQuestionScope, default: BurningQuestionScope.COMPANY })
  scope: BurningQuestionScope;

  @Column({ nullable: true })
  territory_id: string;

  @Column({ nullable: true })
  store_id: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
