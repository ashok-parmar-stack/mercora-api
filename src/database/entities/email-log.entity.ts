import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import {
  CreateTimestampColumn,
  UpdateTimestampColumn,
  TimestampColumn,
} from '../../common/database';
import { EmailTemplateEntity } from './email-template.entity';
import { UserEntity } from './user.entity';

export type EmailLogStatus = 'PENDING' | 'SENT' | 'FAILED';

@Entity('email_logs')
export class EmailLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  @Index()
  templateId: string;

  @ManyToOne(() => EmailTemplateEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'template_id' })
  template: EmailTemplateEntity;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index()
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ length: 255 })
  @Index()
  recipientEmail: string;

  @Column({ length: 255 })
  subject: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  @Index()
  status: EmailLogStatus;

  @Column({ length: 255, nullable: true })
  providerMessageId: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @TimestampColumn({ name: 'sent_at', nullable: true })
  sentAt: Date;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
