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
import { SubDistrictEntity } from '../../sub-districts/entities/sub-district.entity';
import { StatusEntity } from '../../../database/entities/status.entity';

@Entity('cities')
@Index(['code', 'subDistrictId'], { unique: true })
@Index(['source', 'lgdCode'])
export class CityEntity {
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

  @Column({ name: 'sub_district_id', type: 'uuid', nullable: true })
  subDistrictId?: string;

  @ManyToOne(() => SubDistrictEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'sub_district_id' })
  subDistrict?: SubDistrictEntity;

  @Column({ name: 'location_type', type: 'varchar', length: 50, default: 'CITY' })
  locationType: string; // 'CITY' | 'TOWN' | 'VILLAGE'

  @Column({ type: 'varchar', length: 50, default: 'CITY' })
  type: string;

  @Column({ name: 'census_code', type: 'varchar', length: 50, nullable: true })
  censusCode: string;

  @Column({ name: 'status_id', type: 'uuid', nullable: true })
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
