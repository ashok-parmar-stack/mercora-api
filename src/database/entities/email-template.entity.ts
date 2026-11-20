import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn, DeleteTimestampColumn } from '../../common/database';
import { StatusEntity } from './status.entity';

@Entity('email_templates')
export class EmailTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  @Index()
  code: string; // e.g. 'USER_WELCOME', 'EMAIL_VERIFICATION', 'PASSWORD_RESET', 'USER_INVITATION'

  @Column({ length: 150 })
  name: string;

  @Column({ length: 255 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'simple-json', nullable: true })
  variables: string[]; // e.g. ['{{user_name}}', '{{app_name}}', '{{login_url}}', '{{support_email}}']

  @Column({ name: 'status_id', type: 'bigint', nullable: true })
  statusId: string;

  @ManyToOne(() => StatusEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'status_id' })
  status: StatusEntity;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteTimestampColumn({ name: 'deleted_at' })
  deletedAt: Date;
}
