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
import { DistrictEntity } from '../../districts/entities/district.entity';
import { StatusEntity } from '../../../database/entities/status.entity';

@Entity('sub-districts')
@Index(['code', 'districtId'], { unique: true })
@Index(['source', 'lgdCode'])
export class SubDistrictEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'local_name', type: 'varchar', length: 150, nullable: true })
  localName: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ name: 'lgd_code', type: 'varchar', length: 50, nullable: true })
  lgdCode?: string;

  @Column({ name: 'district_lgd_code', type: 'varchar', length: 50, nullable: true })
  districtLgdCode?: string;

  @Column({ name: 'state_lgd_code', type: 'varchar', length: 50, nullable: true })
  stateLgdCode?: string;

  @Column({ name: 'district_id', type: 'uuid' })
  districtId: string;

  @ManyToOne(() => DistrictEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'district_id' })
  district: DistrictEntity;

  @Column({ type: 'varchar', length: 50, default: 'SUB_DISTRICT' })
  type: string;

  @Column({ name: 'census_code', type: 'varchar', length: 50, nullable: true })
  censusCode: string;

  @Column({ name: 'status_id', type: 'bigint', nullable: true })
  statusId: string;

  @ManyToOne(() => StatusEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'status_id' })
  status: StatusEntity;

  @Column({ type: 'varchar', length: 50, default: 'LGD' })
  source: string;

  @TimestampColumn({ name: 'source_updated_at', nullable: true })
  sourceUpdatedAt?: Date;

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
