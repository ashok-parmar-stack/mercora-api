import { BusinessCategoryEntity } from "../entities/business-category.entity";
import { BusinessCategoryStatus } from "../enums/business-category-status.enum";

export interface BusinessCategoryFindOptions {
  status?: BusinessCategoryStatus | string;
  isActive?: boolean;
  onlyRoot?: boolean;
  parentId?: string | null | 'root' | 'all';
  query?: string;
  type?: string;
  limit?: number;
  page?: number;
}

export interface IBusinessCategoryRepository {
  findAll(options?: BusinessCategoryFindOptions): Promise<{ data: BusinessCategoryEntity[]; total: number }>;
  findTree(): Promise<BusinessCategoryEntity[]>;
  findById(id: string): Promise<BusinessCategoryEntity | null>;
  findBySlug(slug: string): Promise<BusinessCategoryEntity | null>;
  findByCode(code: string): Promise<BusinessCategoryEntity | null>;
  hasChildren(id: string): Promise<boolean>;
  hasAssignedBusinesses(id: string): Promise<boolean>;
  save(entity: BusinessCategoryEntity): Promise<BusinessCategoryEntity>;
  bulkUpdateOrder(items: Array<{ id: string; displayOrder: number }>): Promise<void>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
}

export const BUSINESS_CATEGORY_REPOSITORY_TOKEN = "BUSINESS_CATEGORY_REPOSITORY_TOKEN";
