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
  bigintNumberTransformer,
} from '../../../common/database/date-column.helper';
import { SubscriptionEntity } from './subscription.entity';
import {
  SubscriptionChangeEffectiveWhen,
  SubscriptionChangeStatus,
  SubscriptionChangeType,
} from '../subscription.constants';

@Entity('subscription_changes')
@Index(['subscriptionId', 'createdAt'])
export class SubscriptionChangeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  @Index()
  subscriptionId: string;

  @ManyToOne(() => SubscriptionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription?: SubscriptionEntity;

  @Column({ name: 'business_id', type: 'varchar', length: 64, nullable: true })
  @Index()
  businessId?: string | null;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'current_plan_id', type: 'uuid', nullable: true })
  currentPlanId?: string | null;

  @Column({ name: 'requested_plan_id', type: 'uuid', nullable: true })
  requestedPlanId?: string | null;

  @Column({ name: 'change_type', type: 'varchar', length: 30 })
  changeType: SubscriptionChangeType | string;

  @Column({ name: 'effective_when', type: 'varchar', length: 20 })
  effectiveWhen: SubscriptionChangeEffectiveWhen | string;

  @Column({ type: 'varchar', length: 25, default: SubscriptionChangeStatus.PENDING })
  status: SubscriptionChangeStatus | string;

  @Column({
    name: 'amount_due_minor',
    type: 'bigint',
    default: 0,
    transformer: bigintNumberTransformer,
  })
  amountDueMinor: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @TimestampColumn({ name: 'effective_at', nullable: true })
  effectiveAt?: Date | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string | null;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
