import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';
import {
  CreateTimestampColumn,
  TimestampColumn,
  JSON_COLUMN_TYPE,
} from '../../../common/database/date-column.helper';
import { PaymentGateway, WebhookProcessingStatus } from '../subscription.constants';

@Entity('payment_webhook_events')
@Index(['gateway', 'gatewayEventId'], { unique: true })
@Index(['processingStatus', 'receivedAt'])
export class PaymentWebhookEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, default: PaymentGateway.RAZORPAY })
  gateway: string;

  @Column({ name: 'gateway_event_id', type: 'varchar', length: 255 })
  gatewayEventId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 150 })
  @Index()
  eventType: string;

  @Column({ name: 'processing_status', type: 'varchar', length: 25, default: WebhookProcessingStatus.PENDING })
  processingStatus: WebhookProcessingStatus | string;

  @Column({ name: 'signature_valid', type: 'boolean', default: false })
  signatureValid: boolean;

  @Column({ type: JSON_COLUMN_TYPE, default: () => "'{}'" })
  payload: Record<string, unknown>;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount: number;

  @CreateTimestampColumn({ name: 'received_at' })
  receivedAt: Date;

  @TimestampColumn({ name: 'processed_at', nullable: true })
  processedAt?: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;
}
