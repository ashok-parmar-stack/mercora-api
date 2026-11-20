import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CreateTimestampColumn } from '../../common/database';
import { MasterSyncRunEntity } from './master-sync-run.entity';

@Entity('master_sync_errors')
@Index(['syncRunId'])
export class MasterSyncErrorEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sync_run_id', type: 'uuid' })
  syncRunId: string;

  @ManyToOne(() => MasterSyncRunEntity, (run) => run.errors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sync_run_id' })
  syncRun?: MasterSyncRunEntity;

  @Column({ name: 'source', length: 50, nullable: true })
  source?: string;

  @Column({ name: 'record_identifier', length: 150, nullable: true })
  recordIdentifier?: string;

  @Column({ name: 'row_number', type: 'integer', nullable: true })
  rowNumber: number;

  @Column({ name: 'source_code', length: 100, nullable: true })
  sourceCode: string;

  @Column({ name: 'error_type', length: 50, default: 'SYNC_ERROR' })
  errorType: string;

  @Column({ name: 'error_message', type: 'text' })
  errorMessage: string;

  @Column({ name: 'raw_data', type: 'json', nullable: true })
  rawData: Record<string, any>;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;
}
