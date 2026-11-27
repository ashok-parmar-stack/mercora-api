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
import { SubscriptionEntity } from './subscription.entity';
import { BusinessOrmEntity } from '../../businesses/infrastructure/persistence/entities/business-orm.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import {
  PaymentGateway,
  PaymentStatus,
  PaymentType,
} from '../subscription.constants';

@Entity('payments')
@Index(['businessId', 'createdAt'])
@Index(['paymentStatus', 'createdAt'])
@Index(['gateway', 'gatewayOrderId'])
export class PaymentEntity {
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

  @Column({ name: 'subscription_id', type: 'uuid' })
  @Index()
  subscriptionId: string;

  @ManyToOne(() => SubscriptionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subscription_id' })
  subscription?: SubscriptionEntity;

  @Column({ type: 'varchar', length: 30, default: PaymentGateway.RAZORPAY })
  gateway: PaymentGateway | string;

  @Column({ name: 'payment_type', type: 'varchar', length: 30, default: PaymentType.PURCHASE })
  paymentType: PaymentType | string;

  @Column({ name: 'gateway_order_id', type: 'varchar', length: 120, unique: true, nullable: true })
  gatewayOrderId?: string | null;

  @Column({ name: 'gateway_payment_id', type: 'varchar', length: 120, unique: true, nullable: true })
  gatewayPaymentId?: string | null;

  @Column({ name: 'signature_verified', type: 'boolean', default: false })
  signatureVerified: boolean;

  @TimestampColumn({ name: 'verified_at', nullable: true })
  verifiedAt?: Date | null;

  @Column({
    name: 'amount_minor',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  amountMinor: number;

  @Column({
    name: 'refunded_amount_minor',
    type: 'bigint',
    default: 0,
    transformer: bigintNumberTransformer,
  })
  refundedAmountMinor: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ name: 'payment_status', type: 'varchar', length: 30, default: PaymentStatus.CREATED })
  @Index()
  paymentStatus: PaymentStatus | string;

  @Column({ name: 'payment_method', type: 'varchar', length: 40, nullable: true })
  paymentMethod?: string | null;

  @Column({ name: 'payment_method_details', type: JSON_COLUMN_TYPE, nullable: true })
  paymentMethodDetails?: Record<string, unknown> | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 100, nullable: true })
  failureCode?: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, unique: true, nullable: true })
  idempotencyKey?: string | null;

  @TimestampColumn({ name: 'confirmation_notified_at', nullable: true })
  confirmationNotifiedAt?: Date | null;

  @TimestampColumn({ name: 'paid_at', nullable: true })
  paidAt?: Date | null;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
