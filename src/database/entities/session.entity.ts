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
} from '../../common/database';
import { UserEntity } from './user.entity';

export type SessionRevocationReason =
  | 'NEW_LOGIN'
  | 'LOGOUT'
  | 'INACTIVITY'
  | 'REUSE_DETECTED'
  | 'ADMIN_REVOKED'
  | 'EXPIRED';

@Entity('sessions')
@Index('uq_user_active_session', ['userId'], {
  unique: true,
  where: 'revoked_at IS NULL',
})
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'refresh_token_hash', length: 255 })
  refreshTokenHash: string;

  @Column({ name: 'device_id', length: 100, nullable: true })
  deviceId?: string;

  @Column({ name: 'ip_address', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @TimestampColumn({ name: 'expires_at', nullable: true })
  @Index()
  expiresAt: Date;

  @TimestampColumn({
    name: 'last_activity_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastActivityAt: Date;

  @TimestampColumn({ name: 'revoked_at', nullable: true })
  @Index()
  revokedAt?: Date;

  @Column({ name: 'revocation_reason', length: 100, nullable: true })
  revocationReason?: SessionRevocationReason;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
