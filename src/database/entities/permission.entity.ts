import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn, DeleteTimestampColumn } from '../../common/database';
import { StatusEntity } from './status.entity';
import { PermissionActionEntity } from './permission-action.entity';

@Entity('permissions')
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, unique: true })
  code: string; // e.g., 'USERS', 'ROLES', 'COMPANIES', 'PRODUCTS', 'TRADE_DATA', 'LEADS', 'EMAIL_TEMPLATES'

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'status_id', type: 'bigint', nullable: true })
  statusId: string;

  @ManyToOne(() => StatusEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'status_id' })
  status: StatusEntity;

  @OneToMany(() => PermissionActionEntity, (pa) => pa.permission)
  actions: PermissionActionEntity[];

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteTimestampColumn({ name: 'deleted_at' })
  @Index()
  deletedAt: Date;
}
