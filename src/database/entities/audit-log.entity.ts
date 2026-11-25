import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { CreateTimestampColumn } from '../../common/database';
import { UserEntity } from './user.entity';

@Entity('audit_logs')
@Index(['module', 'createdAt'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index()
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ length: 100 })
  @Index()
  action: string; // e.g. 'CREATE_USER', 'UPDATE_ROLE_PERMISSIONS', 'SOFT_DELETE_USER', 'EXPORT_COMPANIES'

  @Column({ length: 100 })
  @Index()
  module: string; // e.g. 'USER_MANAGEMENT', 'ROLE_MANAGEMENT', 'COMPANY_MANAGEMENT'

  @Column({ length: 100, nullable: true })
  entityType: string; // e.g. 'UserEntity', 'RoleEntity'

  @Column({ length: 255, nullable: true })
  entityId: string;

  @Column({ type: 'simple-json', nullable: true })
  oldData: Record<string, any>;

  @Column({ type: 'simple-json', nullable: true })
  newData: Record<string, any>;

  @Column({ length: 100, nullable: true })
  ipAddress: string;

  @Column({ length: 255, nullable: true })
  userAgent: string;

  @CreateTimestampColumn({ name: 'created_at' })
  @Index()
  createdAt: Date;
}
