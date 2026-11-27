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
  bigintNumberTransformer,
} from '../../../common/database/date-column.helper';
import { SubscriptionPlanEntity } from './subscription-plan.entity';

@Entity('plan_features')
@Index(['planId', 'featureKey'], { unique: true })
export class PlanFeatureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  @Index()
  planId: string;

  @ManyToOne(() => SubscriptionPlanEntity, (p) => p.planFeatures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan?: SubscriptionPlanEntity;

  @Column({ name: 'feature_key', type: 'varchar', length: 100 })
  featureKey: string;

  @Column({ name: 'feature_name', type: 'varchar', length: 150 })
  featureName: string;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @Column({
    name: 'quota_limit',
    type: 'bigint',
    nullable: true,
    transformer: bigintNumberTransformer,
  })
  quotaLimit?: number | null;

  @Column({ name: 'quota_period', type: 'varchar', length: 30, nullable: true })
  quotaPeriod?: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
