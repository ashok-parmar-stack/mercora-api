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
  TimestampColumn,
} from '../../common/database';
import { UserEntity } from './user.entity';

@Entity('password_resets')
export class PasswordResetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'token_hash', length: 255, unique: true })
  @Index()
  tokenHash: string;

  @TimestampColumn({ name: 'expires_at' })
  @Index()
  expiresAt: Date;

  @TimestampColumn({ name: 'used_at', nullable: true })
  usedAt?: Date;

  @Column({ name: 'ip_address', length: 45, nullable: true })
  ipAddress?: string;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;
}
