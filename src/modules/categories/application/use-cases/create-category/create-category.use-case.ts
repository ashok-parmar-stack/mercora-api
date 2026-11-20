import { Injectable, Inject, ConflictException } from "@nestjs/common";
import {
  ICategoryRepository,
  CATEGORY_REPOSITORY_TOKEN,
} from "../../../domain/repositories/category.repository.interface";
import { CreateCategoryDto } from "./create-category.dto";
import { CategoryEntity } from "../../../domain/entities/category.entity";
import { CategoryStatus } from "../../../domain/enums/category-status.enum";
import { API_MESSAGES } from "../../../../../config/messages.config";

@Injectable()
export class CreateCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY_TOKEN)
    private readonly categoryRepo: ICategoryRepository
  ) {}

  async execute(dto: CreateCategoryDto): Promise<CategoryEntity> {
    const slug = dto.slug || dto.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const existing = await this.categoryRepo.findBySlug(slug);
    if (existing) {
      throw new ConflictException(API_MESSAGES.categories.slugExists);
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
