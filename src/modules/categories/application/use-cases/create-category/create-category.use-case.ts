import { Injectable, Inject, ConflictException } from "@nestjs/common";
import {
  ICategoryRepository,
  CATEGORY_REPOSITORY_TOKEN,
} from "../../../domain/repositories/category.repository.interface";
import { CreateCategoryDto } from "./create-category.dto";
import { CategoryEntity } from "../../../domain/entities/category.entity";
import { CategoryStatus } from "../../../domain/enums/category-status.enum";
import { API_MESSAGES } from "../../../../../common/messages";
import { toSlug, toUniqueSlug } from "../../../../../common/services/slug.util";

@Injectable()
export class CreateCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY_TOKEN)
    private readonly categoryRepo: ICategoryRepository
  ) {}

  async execute(dto: CreateCategoryDto): Promise<CategoryEntity> {
    const customSlug = dto.slug?.trim() ? toSlug(dto.slug) : "";
    let slug = customSlug || toSlug(dto.name) || "category";
    const existing = await this.categoryRepo.findBySlug(slug);
    if (existing) {
      if (customSlug) {
        throw new ConflictException(API_MESSAGES.categories.slugExists);
      }
      slug = toUniqueSlug(slug);
    }

    const category = new CategoryEntity(
      `cat-${Date.now()}`,
      dto.name,
      slug,
      dto.description,
      dto.parentId || null,
      CategoryStatus.ACTIVE,
      dto.displayOrder || 0,
      dto.iconUrl,
      0,
      0
    );

    return this.categoryRepo.save(category);
  }
}
