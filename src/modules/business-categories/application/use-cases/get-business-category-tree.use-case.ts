import { Injectable, Inject } from "@nestjs/common";
import {
  IBusinessCategoryRepository,
  BUSINESS_CATEGORY_REPOSITORY_TOKEN,
} from "../../domain/repositories/business-category.repository.interface";
import { BusinessCategoryEntity } from "../../domain/entities/business-category.entity";

@Injectable()
export class GetBusinessCategoryTreeUseCase {
  constructor(
    @Inject(BUSINESS_CATEGORY_REPOSITORY_TOKEN)
    private readonly repo: IBusinessCategoryRepository
  ) {}

  async execute(): Promise<BusinessCategoryEntity[]> {
    return this.repo.findTree();
  }
}
