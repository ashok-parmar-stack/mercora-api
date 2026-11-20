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
import { StatusEntity } from '../../../database/entities/status.entity';

@Entity('countries')
@Index(['name'], { unique: true })
@Index(['iso2Code'], { unique: true })
@Index(['iso3Code'], { unique: true })
@Index(['statusId'])
@Index(['createdAt'])
@Index(['updatedAt'])
export class CountryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  name: string;

  @Column({ name: 'official_name', length: 150, nullable: true })
  officialName: string;

  @Column({ name: 'iso2_code', length: 2, unique: true })
  iso2Code: string;

  @Column({ name: 'iso3_code', length: 3, unique: true })
  iso3Code: string;

  @Column({ name: 'numeric_code', length: 10, unique: true, nullable: true })
  numericCode: string;

  @Column({ name: 'phone_code', length: 15, nullable: true })
  phoneCode: string;

  @Column({ name: 'currency_code', length: 10, nullable: true })
  currencyCode: string;

  @Column({ name: 'status_id', type: 'bigint', nullable: true })
  statusId: string;

  @ManyToOne(() => StatusEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'status_id' })
  status?: StatusEntity;

  // ── Data Source Tracking (Section 16) ──────────────────────────────────
  @Column({ length: 50, default: 'MANUAL' })
  source: string; // e.g. 'LGD', 'ISO', 'INDIA_POST', 'MANUAL'

  @Column({ name: 'source_code', length: 50, nullable: true })
  sourceCode: string;

  @Column({ name: 'source_record_id', length: 100, nullable: true })
  sourceRecordId: string;

  @TimestampColumn({ name: 'source_updated_at', nullable: true })
  sourceUpdatedAt: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @TimestampColumn({ name: 'last_synced_at', nullable: true })
  lastSyncedAt?: Date;

  // ── Audit Timestamps ───────────────────────────────────────────────────
  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteTimestampColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
