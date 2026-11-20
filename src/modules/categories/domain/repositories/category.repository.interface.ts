import { CategoryEntity } from "../entities/category.entity";
import { CategoryStatus } from "../enums/category-status.enum";

export interface CategoryFindOptions {
  query?: string;
  parentId?: string | null;
  status?: CategoryStatus;
  page?: number;
  limit?: number;
}

export interface ICategoryRepository {
  findAll(options?: CategoryFindOptions): Promise<{ data: CategoryEntity[]; total: number }>;
  findById(id: string): Promise<CategoryEntity | null>;
  findBySlug(slug: string): Promise<CategoryEntity | null>;
  save(category: CategoryEntity): Promise<CategoryEntity>;
  delete(id: string): Promise<void>;
  countChildren(parentId: string): Promise<number>;
}

export const CATEGORY_REPOSITORY_TOKEN = Symbol("ICategoryRepository");
