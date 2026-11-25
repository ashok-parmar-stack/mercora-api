import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn, DeleteTimestampColumn } from '../../common/database';
import { StatusEntity } from './status.entity';
import { CompanyUserEntity } from './company-user.entity';

@Entity('companies')
export class CompanyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  @Index()
  name: string;

  @Column({ length: 100, unique: true, nullable: true })
  code: string;

  @Column({ length: 255, nullable: true })
  website: string;

  @Index()
  @Column({ name: 'status_id', type: 'bigint', nullable: true })
  statusId: string;

  @ManyToOne(() => StatusEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'status_id' })
  status: StatusEntity;

  @OneToMany(() => CompanyUserEntity, (cu) => cu.company)
  companyUsers: CompanyUserEntity[];

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteTimestampColumn({ name: 'deleted_at' })
  deletedAt: Date;
}
