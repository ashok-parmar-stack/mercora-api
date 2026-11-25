import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn } from '../../common/database';

@Entity('business_enquiries')
@Index(['businessId', 'createdAt'])
export class BusinessEnquiryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'business_id', type: 'varchar', length: 64 })
  businessId: string;

  @Column({ name: 'business_name', type: 'varchar', length: 255, nullable: true })
  businessName?: string;

  @Column({ name: 'sender_name', type: 'varchar', length: 150 })
  senderName: string;

  @Column({ name: 'sender_email', type: 'varchar', length: 255, nullable: true })
  senderEmail?: string;

  @Column({ name: 'sender_phone', type: 'varchar', length: 50 })
  senderPhone: string;

  @Column({ name: 'company_name', type: 'varchar', length: 255, nullable: true })
  companyName?: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ length: 40, default: 'NEW' })
  status: string;

  @Column({ name: 'source', length: 60, default: 'DIRECTORY_RFQ' })
  source: string;

  @Column({ name: 'ip_address', length: 64, nullable: true })
  ipAddress?: string;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
