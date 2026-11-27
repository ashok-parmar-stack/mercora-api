import { Entity, PrimaryColumn, Column } from 'typeorm';
import {
  CreateTimestampColumn,
  UpdateTimestampColumn,
} from '../../../common/database/date-column.helper';

@Entity('payment_settings')
export class PaymentSettingsEntity {
  @PrimaryColumn({ type: 'varchar', length: 32, default: 'DEFAULT' })
  id: string;

  @Column({ name: 'active_gateway', type: 'varchar', length: 30, default: 'RAZORPAY' })
  activeGateway: string;

  @Column({ name: 'razorpay_enabled', type: 'boolean', default: true })
  razorpayEnabled: boolean;

  @Column({ name: 'default_currency', type: 'varchar', length: 3, default: 'INR' })
  defaultCurrency: string;

  @Column({ name: 'default_gst_rate_bps', type: 'integer', default: 1800 })
  defaultGstRateBps: number;

  @Column({ name: 'grace_period_days', type: 'integer', default: 3 })
  gracePeriodDays: number;

  @Column({ name: 'expiring_reminder_days', type: 'integer', default: 7 })
  expiringReminderDays: number;

  @Column({ name: 'upgrade_policy', type: 'varchar', length: 20, default: 'IMMEDIATE' })
  upgradePolicy: 'IMMEDIATE' | 'END_OF_PERIOD';

  @Column({ name: 'downgrade_policy', type: 'varchar', length: 20, default: 'END_OF_PERIOD' })
  downgradePolicy: 'END_OF_PERIOD' | 'IMMEDIATE';

  @Column({ name: 'refund_revokes_access', type: 'boolean', default: true })
  refundRevokesAccess: boolean;

  @Column({ name: 'scheduler_enabled', type: 'boolean', default: true })
  schedulerEnabled: boolean;

  @Column({ name: 'scheduler_interval_ms', type: 'integer', default: 300000 })
  schedulerIntervalMs: number;

  @Column({ name: 'reconcile_pending_minutes', type: 'integer', default: 2 })
  reconcilePendingMinutes: number;

  @Column({ name: 'invoice_prefix', type: 'varchar', length: 24, default: 'MERC' })
  invoicePrefix: string;

  @Column({ name: 'company_legal_name', type: 'varchar', length: 200, default: 'Mercora Technologies Pvt Ltd' })
  companyLegalName: string;

  @Column({ name: 'company_gstin', type: 'varchar', length: 30, default: '' })
  companyGstin: string;

  @Column({ name: 'company_state', type: 'varchar', length: 100, default: 'Gujarat' })
  companyState: string;

  @Column({ name: 'company_address', type: 'text', default: 'Ahmedabad, Gujarat, India' })
  companyAddress: string;

  @Column({ name: 'sac_code', type: 'varchar', length: 20, default: '998314' })
  sacCode: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
