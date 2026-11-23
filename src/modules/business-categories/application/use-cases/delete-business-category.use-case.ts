import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import {
  IBusinessCategoryRepository,
  BUSINESS_CATEGORY_REPOSITORY_TOKEN,
} from "../../domain/repositories/business-category.repository.interface";

@Injectable()
export class DeleteBusinessCategoryUseCase {
  constructor(
    @Inject(BUSINESS_CATEGORY_REPOSITORY_TOKEN)
    private readonly repo: IBusinessCategoryRepository
  ) {}

  async execute(id: string): Promise<void> {
    const cat = await this.repo.findById(id);
    if (!cat) {
      throw new NotFoundException(`Business category with id '${id}' not found`);
    }
    await this.repo.delete(id);
  }
}
