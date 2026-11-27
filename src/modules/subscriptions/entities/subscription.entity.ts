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
  TimestampColumn,
  JSON_COLUMN_TYPE,
  bigintNumberTransformer,
} from '../../../common/database/date-column.helper';
import { SubscriptionPlanEntity } from './subscription-plan.entity';
import { BusinessOrmEntity } from '../../businesses/infrastructure/persistence/entities/business-orm.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import { PlanSnapshot, SubscriptionStatus } from '../subscription.constants';

@Entity('subscriptions')
@Index(['businessId', 'status'])
@Index(['userId', 'status'])
@Index(['status', 'expiresAt'])
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'business_id', type: 'varchar', length: 64, nullable: true })
  @Index()
  businessId?: string | null;

  @ManyToOne(() => BusinessOrmEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'business_id' })
  business?: BusinessOrmEntity | null;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'plan_id', type: 'uuid' })
  @Index()
  planId: string;

  @ManyToOne(() => SubscriptionPlanEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan?: SubscriptionPlanEntity;

  @Column({ name: 'plan_snapshot', type: JSON_COLUMN_TYPE })
  planSnapshot: PlanSnapshot;

  @Column({ name: 'billing_details', type: JSON_COLUMN_TYPE, nullable: true })
  billingDetails?: {
    billingName?: string | null;
    gstin?: string | null;
    state?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;

  @Column({ type: 'varchar', length: 25, default: SubscriptionStatus.PENDING })
  @Index()
  status: SubscriptionStatus | string;

  @Column({
    name: 'subtotal_minor',
    type: 'bigint',
    default: 0,
    transformer: bigintNumberTransformer,
  })
  subtotalMinor: number;

  @Column({
    name: 'tax_minor',
    type: 'bigint',
    default: 0,
    transformer: bigintNumberTransformer,
  })
  taxMinor: number;

  @Column({
    name: 'amount_minor',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  amountMinor: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @TimestampColumn({ name: 'starts_at', nullable: true })
  startsAt?: Date | null;

  @TimestampColumn({ name: 'expires_at', nullable: true })
  expiresAt?: Date | null;

  @TimestampColumn({ name: 'grace_until', nullable: true })
  graceUntil?: Date | null;

  @Column({ name: 'cancel_at_period_end', type: 'boolean', default: false })
  cancelAtPeriodEnd: boolean;

  @TimestampColumn({ name: 'cancelled_at', nullable: true })
  cancelledAt?: Date | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason?: string | null;

  @Column({ name: 'scheduled_plan_id', type: 'uuid', nullable: true })
  scheduledPlanId?: string | null;

  @Column({ name: 'scheduled_plan_snapshot', type: JSON_COLUMN_TYPE, nullable: true })
  scheduledPlanSnapshot?: PlanSnapshot | null;

  @TimestampColumn({ name: 'scheduled_change_at', nullable: true })
  scheduledChangeAt?: Date | null;

  @TimestampColumn({ name: 'renewal_reminder_sent_at', nullable: true })
  renewalReminderSentAt?: Date | null;

  @TimestampColumn({ name: 'expired_notified_at', nullable: true })
  expiredNotifiedAt?: Date | null;

  @Column({ name: 'previous_subscription_id', type: 'uuid', nullable: true })
  previousSubscriptionId?: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
