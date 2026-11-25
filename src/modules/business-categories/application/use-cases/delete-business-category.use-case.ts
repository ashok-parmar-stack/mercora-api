import { Injectable, Inject, NotFoundException, BadRequestException } from "@nestjs/common";
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

    // Safety Dependency Check 1: Child subcategories
    const hasChildren = await this.repo.hasChildren(id);
    if (hasChildren) {
      throw new BadRequestException(
        `Cannot delete category '${cat.name}'. It has active subcategories. Delete or reassign its subcategories first.`
      );
    }

    // Safety Dependency Check 2: Assigned businesses
    const hasAssigned = await this.repo.hasAssignedBusinesses(id);
    if (hasAssigned) {
      throw new BadRequestException(
        `Cannot delete category '${cat.name}'. There are active business profiles linked to it. Reassign those businesses before deleting.`
      );
    }

    await this.repo.delete(id);
  }
}
