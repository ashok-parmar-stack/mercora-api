import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import {
  ICategoryRepository,
  CATEGORY_REPOSITORY_TOKEN,
} from "../../../domain/repositories/category.repository.interface";
import { CategoryEntity } from "../../../domain/entities/category.entity";
import { API_MESSAGES } from "../../../../../common/messages";

@Injectable()
export class GetCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY_TOKEN)
    private readonly categoryRepo: ICategoryRepository
  ) {}

  async execute(slugOrId: string): Promise<CategoryEntity> {
    let category = await this.categoryRepo.findBySlug(slugOrId);
    if (!category) {
      category = await this.categoryRepo.findById(slugOrId);
    }

    if (!category) {
      throw new NotFoundException(API_MESSAGES.categories.notFound);
    }

    return category;
  }
}
