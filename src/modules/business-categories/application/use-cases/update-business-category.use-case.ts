import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import {
  IBusinessCategoryRepository,
  BUSINESS_CATEGORY_REPOSITORY_TOKEN,
} from "../../domain/repositories/business-category.repository.interface";
import { BusinessCategoryEntity } from "../../domain/entities/business-category.entity";
import { UpdateBusinessCategoryDto } from "../dto/update-business-category.dto";

@Injectable()
export class UpdateBusinessCategoryUseCase {
  constructor(
    @Inject(BUSINESS_CATEGORY_REPOSITORY_TOKEN)
    private readonly repo: IBusinessCategoryRepository
  ) {}

  async execute(id: string, dto: UpdateBusinessCategoryDto): Promise<BusinessCategoryEntity> {
    const cat = await this.repo.findById(id);
    if (!cat) {
      throw new NotFoundException(`Business category with id '${id}' not found`);
    }

    if (dto.name !== undefined) cat.name = dto.name;
    if (dto.code !== undefined) cat.code = dto.code.toUpperCase();
    if (dto.slug !== undefined) cat.slug = dto.slug;
    if (dto.type !== undefined) cat.type = dto.type;
    if (dto.description !== undefined) cat.description = dto.description;
    if (dto.icon !== undefined) cat.icon = dto.icon;
    if (dto.displayOrder !== undefined) cat.displayOrder = dto.displayOrder;
    if (dto.status !== undefined) cat.status = dto.status;
    cat.updatedAt = new Date();

    return this.repo.save(cat);
  }
}
