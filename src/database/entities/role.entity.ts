import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn, DeleteTimestampColumn } from '../../common/database';
import { StatusEntity } from './status.entity';
import { RolePermissionEntity } from './role-permission.entity';

@Entity('roles')
export class RoleEntity {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    unsigned: true,
  })
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, unique: true })
  code: string; // e.g., 'SUPER_ADMIN', 'ADMIN', 'DATA_MANAGER', 'SALES', 'CUSTOMER', 'VIEWER'

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'status_id', type: 'bigint', nullable: true })
  statusId: string;

  @ManyToOne(() => StatusEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'status_id' })
  status: StatusEntity;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @OneToMany(() => RolePermissionEntity, (rp) => rp.role)
  rolePermissions: RolePermissionEntity[];

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteTimestampColumn({ name: 'deleted_at' })
  @Index()
  deletedAt: Date;
}
