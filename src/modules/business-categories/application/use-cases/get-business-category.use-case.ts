import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import {
  IBusinessCategoryRepository,
  BUSINESS_CATEGORY_REPOSITORY_TOKEN,
} from "../../domain/repositories/business-category.repository.interface";
import { BusinessCategoryEntity } from "../../domain/entities/business-category.entity";

@Injectable()
export class GetBusinessCategoryUseCase {
  constructor(
    @Inject(BUSINESS_CATEGORY_REPOSITORY_TOKEN)
    private readonly repo: IBusinessCategoryRepository
  ) {}

  async execute(identifier: string): Promise<BusinessCategoryEntity> {
    let cat = await this.repo.findById(identifier);
    if (!cat) {
      cat = await this.repo.findBySlug(identifier);
    }
    if (!cat) {
      cat = await this.repo.findByCode(identifier.toUpperCase());
    }
    if (!cat) {
      throw new NotFoundException(`Business category '${identifier}' was not found`);
    }
    return cat;
  }
}
