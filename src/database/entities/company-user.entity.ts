import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn } from '../../common/database';
import { CompanyEntity } from './company.entity';
import { UserEntity } from './user.entity';

@Entity('company_users')
@Index(['companyId', 'userId'], { unique: true })
export class CompanyUserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  @Index()
  companyId: string;

  @ManyToOne(() => CompanyEntity, (c) => c.companyUsers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: CompanyEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ length: 100, nullable: true })
  jobTitle: string; // e.g., 'Owner', 'Managing Director', 'Sales Lead', 'Procurement Officer'

  @Column({ name: 'is_primary_contact', type: 'boolean', default: false })
  isPrimaryContact: boolean;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
