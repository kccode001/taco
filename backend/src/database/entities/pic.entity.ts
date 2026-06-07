import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Store } from './store.entity';

export enum PicRole {
  OWNER = 'owner',
  PURCHASER = 'purchaser',
  SALES_STAFF = 'sales_staff',
  WAREHOUSE = 'warehouse',
}

@Entity('pics')
export class Pic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  store_id: string;

  @ManyToOne(() => Store, { nullable: true, eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: PicRole, default: PicRole.OWNER })
  role: PicRole;

  @Column({ nullable: true })
  phone: string;

  @Column({ default: false })
  is_primary: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
