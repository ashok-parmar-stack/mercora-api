import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn } from '../../common/database';
import { RoleEntity } from './role.entity';
import { PermissionActionEntity } from './permission-action.entity';

@Entity('role_permissions')
@Index(['roleId', 'permissionActionId'], { unique: true })
export class RolePermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'role_id', type: 'bigint' })
  @Index()
  roleId: string;

  @ManyToOne(() => RoleEntity, (r) => r.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: RoleEntity;

  @Column({ name: 'permission_action_id', type: 'uuid' })
  @Index()
  permissionActionId: string;

  @ManyToOne(() => PermissionActionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_action_id' })
  permissionAction: PermissionActionEntity;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
