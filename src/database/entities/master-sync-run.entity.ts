import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Index,
} from 'typeorm';
import {
  CreateTimestampColumn,
  TimestampColumn,
} from '../../common/database';
import { MasterSyncErrorEntity } from './master-sync-error.entity';

@Entity('master_sync_runs')
@Index(['masterType'])
@Index(['source'])
@Index(['status'])
@Index(['createdAt'])
export class MasterSyncRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'master_type', length: 50 })
  masterType: string; // 'LOCATION_STATE', 'LOCATION_DISTRICT', 'LOCATION_SUBDISTRICT', 'LOCATION_POSTAL', 'HSN', 'SAC'

  @Column({ length: 50 })
  source: string; // 'LGD', 'INDIA_POST', 'ICEGATE', 'CBIC', 'GST'

  @Column({ length: 30, default: 'PENDING' })
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';

  @Column({ name: 'total_records', type: 'integer', default: 0 })
  totalRecords: number;

  @Column({ name: 'inserted_records', type: 'integer', default: 0 })
  insertedRecords: number;

  @Column({ name: 'updated_records', type: 'integer', default: 0 })
  updatedRecords: number;

  @Column({ name: 'unchanged_records', type: 'integer', default: 0 })
  unchangedRecords: number;

  @Column({ name: 'deactivated_records', type: 'integer', default: 0 })
  deactivatedRecords: number;

  @Column({ name: 'failed_records', type: 'integer', default: 0 })
  failedRecords: number;

  @TimestampColumn({ name: 'started_at', nullable: true })
  startedAt: Date;

  @TimestampColumn({ name: 'completed_at', nullable: true })
  completedAt: Date;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @OneToMany(() => MasterSyncErrorEntity, (err) => err.syncRun, { cascade: true })
  errors?: MasterSyncErrorEntity[];

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;
}
