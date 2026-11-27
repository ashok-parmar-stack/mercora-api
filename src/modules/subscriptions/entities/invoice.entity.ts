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
import { BusinessOrmEntity } from '../../businesses/infrastructure/persistence/entities/business-orm.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import { SubscriptionEntity } from './subscription.entity';
import { PaymentEntity } from './payment.entity';

@Entity('invoices')
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_number', type: 'varchar', length: 64, unique: true })
  invoiceNumber: string;

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

  @Column({ name: 'payment_id', type: 'uuid', unique: true })
  paymentId: string;

  @ManyToOne(() => PaymentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_id' })
  payment?: PaymentEntity;

  @Column({
    name: 'subtotal_minor',
    type: 'bigint',
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
    name: 'cgst_minor',
    type: 'bigint',
    default: 0,
    transformer: bigintNumberTransformer,
  })
  cgstMinor: number;

  @Column({
    name: 'sgst_minor',
    type: 'bigint',
    default: 0,
    transformer: bigintNumberTransformer,
  })
  sgstMinor: number;

  @Column({
    name: 'igst_minor',
    type: 'bigint',
    default: 0,
    transformer: bigintNumberTransformer,
  })
  igstMinor: number;

  @Column({
    name: 'total_minor',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  totalMinor: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 30, default: 'ISSUED' })
  status: string;

  @Column({ name: 'seller_details', type: JSON_COLUMN_TYPE })
  sellerDetails: Record<string, unknown>;

  @Column({ name: 'billing_details', type: JSON_COLUMN_TYPE })
  billingDetails: Record<string, unknown>;

  @Column({ name: 'line_items', type: JSON_COLUMN_TYPE })
  lineItems: Array<Record<string, unknown>>;

  @TimestampColumn({ name: 'invoice_date' })
  @Index()
  invoiceDate: Date;

  @Column({ name: 'document_reference', type: 'text', nullable: true })
  documentReference?: string | null;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
