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
  JSON_COLUMN_TYPE,
} from '../../../common/database/date-column.helper';
import { PaymentEntity } from './payment.entity';
import { PaymentGateway } from '../subscription.constants';

@Entity('payment_attempts')
@Index(['paymentId', 'attemptNumber'])
@Index(['gatewayOrderId'])
export class PaymentAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  @Index()
  paymentId: string;

  @ManyToOne(() => PaymentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment?: PaymentEntity;

  @Column({ type: 'varchar', length: 30, default: PaymentGateway.RAZORPAY })
  gateway: string;

  @Column({ name: 'gateway_order_id', type: 'varchar', length: 120, nullable: true })
  gatewayOrderId?: string | null;

  @Column({ name: 'gateway_payment_id', type: 'varchar', length: 120, nullable: true })
  @Index()
  gatewayPaymentId?: string | null;

  @Column({ name: 'attempt_number', type: 'integer', default: 1 })
  attemptNumber: number;

  @Column({ type: 'varchar', length: 30 })
  status: string;

  @Column({ name: 'gateway_response', type: JSON_COLUMN_TYPE, default: () => "'{}'" })
  gatewayResponse: Record<string, unknown>;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string | null;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;
}
