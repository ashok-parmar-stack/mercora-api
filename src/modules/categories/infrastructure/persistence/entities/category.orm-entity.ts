import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
} from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn } from '../../../../../common/database';
import { CategoryStatus } from '../../../domain/enums/category-status.enum';

@Entity('directory_categories')
export class CategoryOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 150 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Index()
  @Column({ name: 'parent_id', type: 'varchar', length: 64, nullable: true })
  parentId?: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: CategoryStatus.ACTIVE,
  })
  status: CategoryStatus;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder: number;

  @Column({ name: 'icon_url', type: 'varchar', length: 500, nullable: true })
  iconUrl?: string;

  @Column({ name: 'product_count', type: 'integer', default: 0 })
  productCount: number;

  @Column({ name: 'business_count', type: 'integer', default: 0 })
  businessCount: number;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
