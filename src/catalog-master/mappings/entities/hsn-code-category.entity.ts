import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn } from '../../../common/database';
import { HsnCodeEntity } from '../../hsn-codes/entities/hsn-code.entity';
import { ProductCategoryEntity } from '../../product-categories/entities/product-category.entity';

@Entity('hsn_code_categories')
@Unique(['hsnCodeId', 'productCategoryId'])
@Index(['hsnCodeId'])
@Index(['productCategoryId'])
@Index(['isPrimary'])
export class HsnCodeCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'hsn_code_id', type: 'uuid' })
  hsnCodeId: string;

  @ManyToOne(() => HsnCodeEntity, (hsn) => hsn.categoryMappings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'hsn_code_id' })
  hsnCode?: HsnCodeEntity;

  @Column({ name: 'product_category_id', type: 'uuid' })
  productCategoryId: string;

  @ManyToOne(() => ProductCategoryEntity, (cat) => cat.hsnMappings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_category_id' })
  productCategory?: ProductCategoryEntity;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @CreateTimestampColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updatedAt: Date;
}
