import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  OneToMany,
} from 'typeorm';
import {
  CreateTimestampColumn,
  UpdateTimestampColumn,
  JSON_COLUMN_TYPE,
  bigintNumberTransformer,
} from '../../../common/database/date-column.helper';
import { BillingInterval, PlanFeatureGroup, PlanLimits } from '../subscription.constants';
import { PlanFeatureEntity } from './plan-feature.entity';

@Entity('subscription_plans')
@Index(['isActive', 'displayOrder'])
export class SubscriptionPlanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  label?: string | null;

  @Column({ name: 'is_popular', type: 'boolean', default: false })
  isPopular: boolean;

  @Column({
    name: 'original_price_minor',
    type: 'bigint',
    nullable: true,
    transformer: bigintNumberTransformer,
  })
  originalPriceMinor?: number | null;

  @Column({
    name: 'price_minor',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  priceMinor: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ name: 'billing_interval', type: 'varchar', length: 20, default: BillingInterval.MONTHLY })
  billingInterval: BillingInterval | string;

  @Column({ name: 'duration_days', type: 'integer' })
  durationDays: number;

  @Column({ name: 'gst_rate_bps', type: 'integer', default: 1800 })
  gstRateBps: number;

  @Column({ type: JSON_COLUMN_TYPE, default: () => "'[]'" })
  features: string[];

  @Column({ name: 'feature_groups', type: JSON_COLUMN_TYPE, default: () => "'[]'" })
  featureGroups: PlanFeatureGroup[];

  @Column({ type: JSON_COLUMN_TYPE, default: () => "'{}'" })
  limits: PlanLimits;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  @Index()
  isActive: boolean;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null;

  @OneToMany(() => PlanFeatureEntity, (pf) => pf.plan, { cascade: false })
  planFeatures?: PlanFeatureEntity[];

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
