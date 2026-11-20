import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import {
  CreateTimestampColumn,
  UpdateTimestampColumn,
  DeleteTimestampColumn,
  TimestampColumn,
} from '../../common/database/date-column.helper';
import * as bcrypt from 'bcrypt';
import { StatusEntity } from './status.entity';
import { RoleEntity } from './role.entity';
import { CompanyEntity } from './company.entity';
import { UserPermissionEntity } from './user-permission.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 255, unique: true })
  @Index()
  email: string;

  @Column({ length: 180, unique: true, nullable: true })
  @Index()
  slug: string;

  @Column({ length: 50, nullable: true })
  phone: string;

  @Column({ length: 255, select: false, nullable: true }) // hidden by default in queries
  password?: string;

  @Column({ name: 'role_id', type: 'bigint', nullable: true })
  @Index()
  roleId: string;

  @ManyToOne(() => RoleEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'role_id' })
  role: RoleEntity;

  @Column({ name: 'status_id', type: 'bigint', nullable: true })
  @Index()
  statusId: string;

  @ManyToOne(() => StatusEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'status_id' })
  status: StatusEntity;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  @Index()
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: CompanyEntity;

  @Column({ name: 'is_email_verified', type: 'boolean', default: false })
  isEmailVerified: boolean;

  @TimestampColumn({ name: 'last_login_at', nullable: true })
  lastLoginAt: Date;

  @OneToMany(() => UserPermissionEntity, (up) => up.user)
  userPermissions: UserPermissionEntity[];

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteTimestampColumn({ name: 'deleted_at' })
  @Index()
  deletedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    if (
      this.password &&
      !this.password.startsWith('$2b$') &&
      !this.password.startsWith('$2a$') &&
      !this.password.startsWith('$2y$')
    ) {
      this.password = await bcrypt.hash(this.password, 12);
    }
  }
}
