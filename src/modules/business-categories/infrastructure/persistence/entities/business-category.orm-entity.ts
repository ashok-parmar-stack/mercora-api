import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
} from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn } from '../../../../../common/database';
import { BusinessCategoryStatus } from '../../../domain/enums/business-category-status.enum';

@Entity('business_categories')
export class BusinessCategoryOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Index()
  @Column({ name: 'parent_id', type: 'varchar', length: 64, nullable: true })
  parentId?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 150 })
  slug: string;

  @Index()
  @Column({ type: 'varchar', length: 64, default: 'general' })
  type: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  icon?: string;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder: number;

  @Column({
    type: 'varchar',
    length: 32,
    default: BusinessCategoryStatus.ACTIVE,
  })
  status: BusinessCategoryStatus;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'business_count', type: 'integer', default: 0 })
  businessCount: number;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
