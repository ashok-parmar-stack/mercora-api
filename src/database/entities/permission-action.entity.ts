import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn, DeleteTimestampColumn } from '../../common/database';
import { PermissionEntity } from './permission.entity';
import { StatusEntity } from './status.entity';

@Entity('permission_actions')
@Index(['permissionId', 'code'], { unique: true })
export class PermissionActionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'permission_id', type: 'uuid' })
  @Index()
  permissionId: string;

  @ManyToOne(() => PermissionEntity, (p) => p.actions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission: PermissionEntity;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50 })
  code: string; // e.g., 'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT', 'VERIFY'

  @Column({ type: 'text', nullable: true })
  description: string;

  @Index()
  @Column({ name: 'status_id', type: 'bigint', nullable: true })
  statusId: string;

  @ManyToOne(() => StatusEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'status_id' })
  status: StatusEntity;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteTimestampColumn({ name: 'deleted_at' })
  @Index()
  deletedAt: Date;
}
