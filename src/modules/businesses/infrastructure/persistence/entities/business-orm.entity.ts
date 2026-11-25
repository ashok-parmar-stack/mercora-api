import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
} from 'typeorm';
import { CreateTimestampColumn, UpdateTimestampColumn } from '../../../../../common/database';

@Entity('directory_businesses')
export class BusinessOrmEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id: string;

  @Column('varchar', { length: 255 })
  @Index()
  name: string;

  @Column('varchar', { length: 255, unique: true })
  @Index()
  slug: string;

  @Column('varchar', { length: 255, nullable: true })
  logo_url: string;

  @Column('text')
  image_url: string;

  @Column('varchar', { length: 150 })
  @Index()
  category: string;

  @Column('varchar', { length: 50 })
  @Index()
  business_type: string;

  @Column('varchar', { length: 150 })
  industry: string;

  @Column('varchar', { length: 100 })
  @Index()
  city: string;

  @Column('varchar', { length: 100 })
  @Index()
  state: string;

  @Index()
  @Column('varchar', { length: 20 })
  pincode: string;

  @Column('text')
  description: string;

  @Column('text', { nullable: true })
  full_overview: string;

  @Column('float', { default: 0 })
  rating: number;

  @Column('integer', { default: 0 })
  review_count: number;

  @Column('integer')
  established_year: number;

  @Column('varchar', { length: 50, default: '10 – 50' })
  employee_count: string;

  @Column('varchar', { length: 50, default: 'Verified' })
  @Index()
  verification_status: string;

  @Column('varchar', { length: 50 })
  phone: string;

  @Column('varchar', { length: 100 })
  email: string;

  @Column('varchar', { length: 150 })
  website: string;

  @Column('text')
  address: string;

  @Column('varchar', { length: 50, nullable: true })
  gstin: string;

  @Column('varchar', { length: 50, nullable: true })
  cin: string;

  @Column('simple-json', { nullable: true })
  products: Array<{
    id: string;
    name: string;
    category: string;
    imageUrl: string;
    description?: string;
  }>;

  @CreateTimestampColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateTimestampColumn({ name: 'updated_at' })
  updated_at: Date;
}
