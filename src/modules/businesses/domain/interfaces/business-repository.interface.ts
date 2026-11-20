import {
  IBusinessRepository,
  BUSINESS_REPOSITORY_TOKEN,
  BusinessFindAllOptions,
  PaginatedResult,
} from "../repositories/business.repository.interface";

export type { IBusinessRepository, PaginatedResult };
export type BusinessFindOptions = BusinessFindAllOptions;
export type BusinessListResult = PaginatedResult<any>;

export const IBusinessRepositoryToken = BUSINESS_REPOSITORY_TOKEN;
export { BUSINESS_REPOSITORY_TOKEN };
