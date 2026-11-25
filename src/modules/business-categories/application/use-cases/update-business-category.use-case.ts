import { Injectable, Inject, NotFoundException, BadRequestException, ConflictException } from "@nestjs/common";
import {
  IBusinessCategoryRepository,
  BUSINESS_CATEGORY_REPOSITORY_TOKEN,
} from "../../domain/repositories/business-category.repository.interface";
import { BusinessCategoryEntity } from "../../domain/entities/business-category.entity";
import { UpdateBusinessCategoryDto } from "../dto/update-business-category.dto";
import { BusinessCategoryStatus } from "../../domain/enums/business-category-status.enum";

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

    if (dto.slug && dto.slug !== cat.slug) {
      const existingSlug = await this.repo.findBySlug(dto.slug);
      if (existingSlug && existingSlug.id !== id) {
        throw new ConflictException(`Slug '${dto.slug}' is already taken`);
      }
      cat.slug = dto.slug;
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException("A category cannot be its own parent.");
      }
      if (dto.parentId) {
        const parent = await this.repo.findById(dto.parentId);
        if (!parent) {
          throw new NotFoundException(`Parent category '${dto.parentId}' does not exist.`);
        }
      }
      cat.parentId = dto.parentId || null;
    }

    if (dto.name !== undefined) cat.name = dto.name;
    if (dto.code !== undefined) cat.code = dto.code.toUpperCase();
    if (dto.type !== undefined) cat.type = dto.type;
    if (dto.description !== undefined) cat.description = dto.description;
    if (dto.icon !== undefined) cat.icon = dto.icon;
    if (dto.displayOrder !== undefined) cat.displayOrder = dto.displayOrder;

    if (dto.isActive !== undefined) {
      cat.isActiveStatus = dto.isActive;
      cat.status = dto.isActive ? BusinessCategoryStatus.ACTIVE : BusinessCategoryStatus.INACTIVE;
    } else if (dto.status !== undefined) {
      cat.status = dto.status;
      cat.isActiveStatus = dto.status === BusinessCategoryStatus.ACTIVE;
    }

    cat.updatedAt = new Date();
    return this.repo.save(cat);
  }
}
