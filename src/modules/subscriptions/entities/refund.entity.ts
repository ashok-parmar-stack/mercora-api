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
import { PaymentEntity } from './payment.entity';
import { SubscriptionEntity } from './subscription.entity';
import { BusinessOrmEntity } from '../../businesses/infrastructure/persistence/entities/business-orm.entity';
import { PaymentGateway, RefundStatus } from '../subscription.constants';

@Entity('refunds')
@Index(['status', 'createdAt'])
export class RefundEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  @Index()
  paymentId: string;

  @ManyToOne(() => PaymentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_id' })
  payment?: PaymentEntity;

  @Column({ name: 'subscription_id', type: 'uuid' })
  @Index()
  subscriptionId: string;

  @ManyToOne(() => SubscriptionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subscription_id' })
  subscription?: SubscriptionEntity;

  @Column({ name: 'business_id', type: 'varchar', length: 64, nullable: true })
  @Index()
  businessId?: string | null;

  @ManyToOne(() => BusinessOrmEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'business_id' })
  business?: BusinessOrmEntity | null;

  @Column({ type: 'varchar', length: 30, default: PaymentGateway.RAZORPAY })
  gateway: string;

  @Column({ name: 'gateway_refund_id', type: 'varchar', length: 120, unique: true, nullable: true })
  gatewayRefundId?: string | null;

  @Column({
    name: 'amount_minor',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  amountMinor: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 30, default: RefundStatus.INITIATED })
  status: RefundStatus | string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, unique: true, nullable: true })
  idempotencyKey?: string | null;

  @Column({ name: 'initiated_by', type: 'uuid', nullable: true })
  initiatedBy?: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string | null;

  @TimestampColumn({ name: 'refunded_at', nullable: true })
  refundedAt?: Date | null;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
