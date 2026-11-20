import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
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
import { HsnCodeCategoryEntity } from '../../mappings/entities/hsn-code-category.entity';

export type HsnLevelType = 'CHAPTER_2' | 'HEADING_4' | 'SUBHEADING_6' | 'TARIFF_8';

@Entity('hsn_codes')
@Index(['code'], { unique: true })
@Index(['parentId'])
@Index(['level'])
@Index(['statusId'])
@Index(['createdAt'])
export class HsnCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20, unique: true })
  code: string; // e.g. '69', '6907', '690721', '69072100'

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string;

  @ManyToOne(() => HsnCodeEntity, (hsn) => hsn.children, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'parent_id' })
  parent?: HsnCodeEntity;

  @OneToMany(() => HsnCodeEntity, (hsn) => hsn.parent)
  children?: HsnCodeEntity[];

  @Column({ length: 30, default: 'TARIFF_8' })
  level: HsnLevelType;

  @Column({ length: 20, nullable: true })
  unit: string; // Standard UQC: 'SQM', 'KGS', 'NOS', 'THD'

  @Column({ name: 'is_leaf', type: 'boolean', default: false })
  isLeaf: boolean;

  @Column({ name: 'status_id', type: 'bigint', nullable: true })
  statusId: string;

  @ManyToOne(() => StatusEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'status_id' })
  status?: StatusEntity;

  // ── Data Source Tracking (Section 16) ──────────────────────────────────
  @Column({ length: 50, default: 'ICEGATE' })
  source: string; // 'ICEGATE', 'CBIC', 'GST', 'MANUAL'

  @Column({ name: 'source_code', length: 50, nullable: true })
  sourceCode: string;

  @Column({ name: 'source_record_id', length: 100, nullable: true })
  sourceRecordId: string;

  @TimestampColumn({ name: 'source_updated_at', nullable: true })
  sourceUpdatedAt: Date;

  @TimestampColumn({ name: 'last_synced_at', nullable: true })
  lastSyncedAt: Date;

  // ── Category Mappings ───────────────────────────────────────────────────
  @OneToMany(() => HsnCodeCategoryEntity, (mapping) => mapping.hsnCode)
  categoryMappings?: HsnCodeCategoryEntity[];

  // ── Audit Timestamps ───────────────────────────────────────────────────
  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteTimestampColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
