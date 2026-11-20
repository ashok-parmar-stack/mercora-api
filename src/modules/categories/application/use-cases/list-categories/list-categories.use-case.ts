import { Injectable, Inject } from "@nestjs/common";
import {
  ICategoryRepository,
  CATEGORY_REPOSITORY_TOKEN,
  CategoryFindOptions,
} from "../../../domain/repositories/category.repository.interface";
import { CategoryEntity } from "../../../domain/entities/category.entity";

@Injectable()
export class ListCategoriesUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY_TOKEN)
    private readonly categoryRepo: ICategoryRepository
  ) {}

  async execute(options: CategoryFindOptions = {}): Promise<{ data: CategoryEntity[]; total: number }> {
    return this.categoryRepo.findAll(options);
  }
}
