import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn } from '../../common/database';

@Entity('statuses')
export class StatusEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ length: 50 })
  @Index()
  type: string; // e.g., 'USER', 'ROLE', 'PERMISSION', 'COMPANY', 'EMAIL_TEMPLATE', 'LEAD'

  @Column({ length: 50 })
  @Index()
  code: string; // e.g., 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
