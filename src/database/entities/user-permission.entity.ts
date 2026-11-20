import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn } from '../../common/database';
import { PermissionActionEntity } from './permission-action.entity';
import { UserEntity } from './user.entity';

export type PermissionEffect = 'ALLOW' | 'DENY';

@Entity('user_permissions')
@Index(['userId', 'permissionActionId'], { unique: true })
export class UserPermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => UserEntity, (u) => u.userPermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'permission_action_id', type: 'uuid' })
  @Index()
  permissionActionId: string;

  @ManyToOne(() => PermissionActionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_action_id' })
  permissionAction: PermissionActionEntity;

  @Column({ type: 'varchar', length: 10, default: 'ALLOW' })
  effect: PermissionEffect; // 'ALLOW' or 'DENY'

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
