import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn, DeleteTimestampColumn } from '../../../common/database';
import { StatusEntity } from '../../../database/entities/status.entity';
import { HsnCodeCategoryEntity } from '../../mappings/entities/hsn-code-category.entity';

@Entity('product_categories')
@Index(['code'], { unique: true })
@Index(['slug'], { unique: true })
@Index(['parentId'])
@Index(['level'])
@Index(['sortOrder'])
@Index(['statusId'])
@Index(['createdAt'])
export class ProductCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string;

  @ManyToOne(() => ProductCategoryEntity, (cat) => cat.children, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'parent_id' })
  parent?: ProductCategoryEntity;

  @OneToMany(() => ProductCategoryEntity, (cat) => cat.parent)
  children?: ProductCategoryEntity[];

  @Column({ length: 150 })
  name: string;

  @Column({ length: 100, unique: true })
  code: string; // e.g. 'CERAMIC-TILES', 'FLOOR-TILES', 'PORCELAIN-TILES'

  @Column({ length: 150, unique: true })
  slug: string; // e.g. 'ceramic-tiles', 'floor-tiles', 'porcelain-tiles'

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 100, nullable: true })
  icon: string; // Lucide icon identifier e.g. 'Layers', 'Grid', 'Package'

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl: string;

  @Column({ length: 500, nullable: true })
  path: string; // Materialized path e.g. 'root-id/child-id/subchild-id'

  @Column({ type: 'integer', default: 1 })
  level: number; // 1: Root, 2: Child, 3: Subchild, 4: Deep child...

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ name: 'status_id', type: 'bigint', nullable: true })
  statusId: string;

  @ManyToOne(() => StatusEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'status_id' })
  status?: StatusEntity;

  // ── HSN Code Mappings ───────────────────────────────────────────────────
  @OneToMany(() => HsnCodeCategoryEntity, (mapping) => mapping.productCategory)
  hsnMappings?: HsnCodeCategoryEntity[];

  // ── Audit Timestamps ───────────────────────────────────────────────────
  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteTimestampColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
