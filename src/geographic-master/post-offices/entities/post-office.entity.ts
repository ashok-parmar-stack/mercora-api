import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import {
  CreateTimestampColumn,
  UpdateTimestampColumn,
  DeleteTimestampColumn,
  TimestampColumn,
} from '../../../common/database';
import { PostalCodeEntity } from '../../postal-codes/entities/postal-code.entity';
import { StatusEntity } from '../../../database/entities/status.entity';

@Entity('post-offices')
@Index(['postalCodeId'])
@Index(['name', 'postalCodeId'])
export class PostOfficeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'local_name', type: 'varchar', length: 150, nullable: true })
  localName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  code: string;

  @Column({ name: 'postal_code_id', type: 'uuid' })
  postalCodeId: string;

  @ManyToOne(() => PostalCodeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postal_code_id' })
  postalCode: PostalCodeEntity;

  @Column({ name: 'office_type', type: 'varchar', length: 50, default: 'POST_OFFICE' })
  officeType: string;

  @Column({ name: 'delivery_status', type: 'varchar', length: 50, default: 'Delivery' })
  deliveryStatus: string;

  @Column({ name: 'circle_name', type: 'varchar', length: 100, nullable: true })
  circleName?: string;

  @Column({ name: 'region_name', type: 'varchar', length: 100, nullable: true })
  regionName?: string;

  @Column({ name: 'division_name', type: 'varchar', length: 100, nullable: true })
  divisionName?: string;

  @Column({ type: 'varchar', length: 50, default: 'POST_OFFICE' })
  type: string;

  @Column({ name: 'census_code', type: 'varchar', length: 50, nullable: true })
  censusCode: string;

  @Column({ name: 'status_id', type: 'uuid', nullable: true })
  statusId: string;

  @ManyToOne(() => StatusEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'status_id' })
  status: StatusEntity;

  @Column({ type: 'varchar', length: 50, default: 'POSTAL_PINCODE' })
  source: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @TimestampColumn({ name: 'last_synced_at', nullable: true })
  lastSyncedAt?: Date;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteTimestampColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
