import { Injectable, Inject, ConflictException } from "@nestjs/common";
import {
  IBusinessCategoryRepository,
  BUSINESS_CATEGORY_REPOSITORY_TOKEN,
} from "../../domain/repositories/business-category.repository.interface";
import { BusinessCategoryEntity } from "../../domain/entities/business-category.entity";
import { CreateBusinessCategoryDto } from "../dto/create-business-category.dto";
import { BusinessCategoryStatus } from "../../domain/enums/business-category-status.enum";
import { toSlug, toCode } from "../../../../common";

@Injectable()
export class CreateBusinessCategoryUseCase {
  constructor(
    @Inject(BUSINESS_CATEGORY_REPOSITORY_TOKEN)
    private readonly repo: IBusinessCategoryRepository
  ) {}

  async execute(dto: CreateBusinessCategoryDto): Promise<BusinessCategoryEntity> {
    const slug = dto.slug || toSlug(dto.name);
    const code = (dto.code || toCode(dto.name)).toUpperCase();
    const id = slug;

    const existingSlug = await this.repo.findBySlug(slug);
    if (existingSlug) {
      throw new ConflictException(`Business category with slug '${slug}' already exists`);
    }

    const existingCode = await this.repo.findByCode(code);
    if (existingCode) {
      throw new ConflictException(`Business category with code '${code}' already exists`);
    }

    const entity = new BusinessCategoryEntity(
      id,
      dto.name,
      code,
      slug,
      dto.type || slug,
      dto.description,
      dto.icon,
      dto.displayOrder ?? 0,
      dto.status || BusinessCategoryStatus.ACTIVE,
      0
    );

    return this.repo.save(entity);
  }
}
