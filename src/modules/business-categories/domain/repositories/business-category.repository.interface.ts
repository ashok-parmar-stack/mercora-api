import { BusinessCategoryEntity } from "../entities/business-category.entity";
import { BusinessCategoryStatus } from "../enums/business-category-status.enum";

export interface BusinessCategoryFindOptions {
  status?: BusinessCategoryStatus;
  query?: string;
  type?: string;
  limit?: number;
  page?: number;
}

export interface IBusinessCategoryRepository {
  findAll(options?: BusinessCategoryFindOptions): Promise<{ data: BusinessCategoryEntity[]; total: number }>;
  findById(id: string): Promise<BusinessCategoryEntity | null>;
  findBySlug(slug: string): Promise<BusinessCategoryEntity | null>;
  findByCode(code: string): Promise<BusinessCategoryEntity | null>;
  save(entity: BusinessCategoryEntity): Promise<BusinessCategoryEntity>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
}

export const BUSINESS_CATEGORY_REPOSITORY_TOKEN = "BUSINESS_CATEGORY_REPOSITORY_TOKEN";
