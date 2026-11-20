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
import { CountryEntity } from '../../countries/entities/country.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import { StateEntity } from '../../states/entities/state.entity';
import { DistrictEntity } from '../../districts/entities/district.entity';

@Entity('postal-codes')
@Index(['code'])
@Index(['pincode'])
@Index(['stateId'])
@Index(['districtId'])
export class PostalCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'local_name', type: 'varchar', length: 150, nullable: true })
  localName: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ name: 'pincode', type: 'varchar', length: 10, nullable: true })
  pincode?: string;

  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId: string;

  @ManyToOne(() => CountryEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'country_id' })
  country: CountryEntity;

  @Column({ name: 'state_id', type: 'uuid', nullable: true })
  stateId?: string;

  @ManyToOne(() => StateEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'state_id' })
  state?: StateEntity;

  @Column({ name: 'district_id', type: 'uuid', nullable: true })
  districtId?: string;

  @ManyToOne(() => DistrictEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'district_id' })
  district?: DistrictEntity;

  @Column({ type: 'varchar', length: 50, default: 'POSTAL_CODE' })
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
