import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('taco_skus')
export class TacoSku {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column({ type: 'float', default: 0 })
  standard_price: number;

  @Column({ default: 'pcs' })
  uom: string;

  @Column({ type: 'text', nullable: true })
  embedding: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
