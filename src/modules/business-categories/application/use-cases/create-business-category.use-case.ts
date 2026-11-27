import { Injectable, Inject, ConflictException, NotFoundException } from "@nestjs/common";
import {
  IBusinessCategoryRepository,
  BUSINESS_CATEGORY_REPOSITORY_TOKEN,
} from "../../domain/repositories/business-category.repository.interface";
import { BusinessCategoryEntity } from "../../domain/entities/business-category.entity";
import { CreateBusinessCategoryDto } from "../dto/create-business-category.dto";
import { BusinessCategoryStatus } from "../../domain/enums/business-category-status.enum";
import { toSlug, toUniqueSlug, toCode } from "../../../../common";

@Injectable()
export class CreateBusinessCategoryUseCase {
  constructor(
    @Inject(BUSINESS_CATEGORY_REPOSITORY_TOKEN)
    private readonly repo: IBusinessCategoryRepository
  ) {}

  async execute(dto: CreateBusinessCategoryDto): Promise<BusinessCategoryEntity> {
    const customSlug = dto.slug?.trim() ? toSlug(dto.slug) : "";
    let slug = customSlug || toSlug(dto.name) || "category";
    const code = (dto.code || toCode(dto.name)).toUpperCase();

    const existingSlug = await this.repo.findBySlug(slug);
    if (existingSlug) {
      if (customSlug) {
        throw new ConflictException(`Business category with slug '${slug}' already exists`);
      }
      slug = toUniqueSlug(slug);
    }

    const id = dto.parentId ? `sub-${slug}` : slug;

    const existingCode = await this.repo.findByCode(code);
    if (existingCode) {
      throw new ConflictException(`Business category with code '${code}' already exists`);
    }

    if (dto.parentId) {
      const parent = await this.repo.findById(dto.parentId);
      if (!parent) {
        throw new NotFoundException(`Parent category with ID '${dto.parentId}' does not exist`);
      }
    }

    const isAct = dto.isActive !== undefined ? dto.isActive : (dto.status !== BusinessCategoryStatus.INACTIVE);
    const status = isAct ? BusinessCategoryStatus.ACTIVE : BusinessCategoryStatus.INACTIVE;

    const entity = new BusinessCategoryEntity(
      id,
      dto.name,
      code,
      slug,
      dto.type || (dto.parentId ? 'subcategory' : slug),
      dto.description,
      dto.icon,
      dto.displayOrder ?? 0,
      status,
      0,
      new Date(),
      new Date(),
      dto.parentId || null,
      isAct
    );

    return this.repo.save(entity);
  }
}
