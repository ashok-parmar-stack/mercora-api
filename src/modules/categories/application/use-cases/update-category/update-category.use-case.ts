import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import {
  ICategoryRepository,
  CATEGORY_REPOSITORY_TOKEN,
} from "../../../domain/repositories/category.repository.interface";
import { UpdateCategoryDto } from "./update-category.dto";
import { CategoryEntity } from "../../../domain/entities/category.entity";
import { API_MESSAGES } from "../../../../../config/messages.config";

@Injectable()
export class UpdateCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY_TOKEN)
    private readonly categoryRepo: ICategoryRepository
  ) {}

  async execute(id: string, dto: UpdateCategoryDto): Promise<CategoryEntity> {
    const existing = await this.categoryRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(API_MESSAGES.categories.notFound);
    }

    if (dto.name) existing.name = dto.name;
    if (dto.description !== undefined) existing.description = dto.description;
    if (dto.parentId !== undefined) existing.parentId = dto.parentId;
    if (dto.status) existing.status = dto.status;
    if (dto.displayOrder !== undefined) existing.displayOrder = dto.displayOrder;
    if (dto.iconUrl !== undefined) existing.iconUrl = dto.iconUrl;

    existing.updatedAt = new Date();
    return this.categoryRepo.save(existing);
  }
}
