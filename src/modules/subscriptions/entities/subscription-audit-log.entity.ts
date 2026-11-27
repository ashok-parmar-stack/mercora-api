import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';
import {
  CreateTimestampColumn,
  JSON_COLUMN_TYPE,
} from '../../../common/database/date-column.helper';
import { SubscriptionAuditActorType } from '../subscription.constants';

@Entity('subscription_audit_logs')
@Index(['subscriptionId', 'createdAt'])
@Index(['businessId', 'createdAt'])
export class SubscriptionAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  @Index()
  subscriptionId?: string | null;

  @Column({ name: 'business_id', type: 'varchar', length: 64, nullable: true })
  @Index()
  businessId?: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 20, default: SubscriptionAuditActorType.SYSTEM })
  actorType: SubscriptionAuditActorType | string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId?: string | null;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  action: string;

  @Column({ name: 'old_values', type: JSON_COLUMN_TYPE, nullable: true })
  oldValues?: Record<string, unknown> | null;

  @Column({ name: 'new_values', type: JSON_COLUMN_TYPE, nullable: true })
  newValues?: Record<string, unknown> | null;

  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy?: string | null;

  @Column({ name: 'correlation_id', type: 'varchar', length: 120, nullable: true })
  correlationId?: string | null;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;
}
