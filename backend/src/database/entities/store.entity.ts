import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Territory } from './territory.entity';
import { User } from './user.entity';
import { Pic } from './pic.entity';

export enum StoreType {
  DISTRIBUTOR = 'distributor',
  STORE = 'store',
  WORKSHOP = 'workshop',
}

@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: StoreType, default: StoreType.STORE })
  type: StoreType;

  @Column({ nullable: true })
  region: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  territory_id: string;

  @ManyToOne(() => Territory, { nullable: true, eager: false })
  @JoinColumn({ name: 'territory_id' })
  territory: Territory;

  @Column({ nullable: true })
  assigned_user_id: string;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'assigned_user_id' })
  assigned_user: User;

  @Column({ type: 'int', default: 0 })
  assigned_pic_count: number;

  @Column({ default: true })
  is_active: boolean;

  @OneToMany(() => Pic, (p) => p.store, { cascade: false, eager: false })
  pics: Pic[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
