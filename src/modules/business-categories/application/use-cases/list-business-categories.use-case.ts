import { Injectable, Inject } from "@nestjs/common";
import {
  IBusinessCategoryRepository,
  BUSINESS_CATEGORY_REPOSITORY_TOKEN,
  BusinessCategoryFindOptions,
} from "../../domain/repositories/business-category.repository.interface";
import { BusinessCategoryEntity } from "../../domain/entities/business-category.entity";

@Injectable()
export class ListBusinessCategoriesUseCase {
  constructor(
    @Inject(BUSINESS_CATEGORY_REPOSITORY_TOKEN)
    private readonly repo: IBusinessCategoryRepository
  ) {}

  async execute(options: BusinessCategoryFindOptions = {}): Promise<{ data: BusinessCategoryEntity[]; total: number }> {
    return this.repo.findAll(options);
  }
}
