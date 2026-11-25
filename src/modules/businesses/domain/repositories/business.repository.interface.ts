import { BusinessEntity } from "../entities/business.entity";
import { VerificationStatus } from "../enums/verification-status.enum";

export interface BusinessFindAllOptions {
  query?: string;
  category?: string;
  location?: string;
  state?: string;
  city?: string;
  businessType?: string;
  verifiedOnly?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IBusinessRepository {
  findAll(options: BusinessFindAllOptions): Promise<PaginatedResult<BusinessEntity>>;
  findBySlug(slug: string): Promise<BusinessEntity | null>;
  findById(id: string): Promise<BusinessEntity | null>;
  findFeatured(limit?: number): Promise<BusinessEntity[]>;
  save(business: BusinessEntity): Promise<BusinessEntity>;
  delete(id: string): Promise<void>;
  updateStatus(id: string, status: VerificationStatus): Promise<BusinessEntity | null>;
}

export const BUSINESS_REPOSITORY_TOKEN = Symbol("IBusinessRepository");
