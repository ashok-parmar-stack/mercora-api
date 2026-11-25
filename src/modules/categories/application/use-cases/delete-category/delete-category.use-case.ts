import { Injectable, Inject, NotFoundException, BadRequestException } from "@nestjs/common";
import {
  ICategoryRepository,
  CATEGORY_REPOSITORY_TOKEN,
} from "../../../domain/repositories/category.repository.interface";
import { API_MESSAGES } from "../../../../../common/messages";

@Injectable()
export class DeleteCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY_TOKEN)
    private readonly categoryRepo: ICategoryRepository
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.categoryRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(API_MESSAGES.categories.notFound);
    }

    const childrenCount = await this.categoryRepo.countChildren(id);
    if (childrenCount > 0) {
      throw new BadRequestException(API_MESSAGES.categories.cannotDeleteWithChildren);
    }

    await this.categoryRepo.delete(id);
  }
}
