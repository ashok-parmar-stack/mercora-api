import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HsnCodeCategoryEntity } from '../entities/hsn-code-category.entity';
import { HsnCodeEntity } from '../../hsn-codes/entities/hsn-code.entity';
import { ProductCategoryEntity } from '../../product-categories/entities/product-category.entity';
import { MapHsnCategoryDto } from '../dto';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit/audit.service';

@Injectable()
export class HsnCategoryMappingService {
  private readonly logger = new MercoraLogger(HsnCategoryMappingService.name);

  constructor(
    @InjectRepository(HsnCodeCategoryEntity)
    private readonly mappingRepo: Repository<HsnCodeCategoryEntity>,
    @InjectRepository(HsnCodeEntity)
    private readonly hsnRepo: Repository<HsnCodeEntity>,
    @InjectRepository(ProductCategoryEntity)
    private readonly categoryRepo: Repository<ProductCategoryEntity>,
    private readonly audit: AuditService,
  ) {}

  /**
   * Get all categories mapped to a given HSN code
   */
  async getCategoriesForHsn(hsnCodeId: string): Promise<HsnCodeCategoryEntity[]> {
    return this.mappingRepo.find({
      where: { hsnCodeId },
      relations: ['productCategory', 'productCategory.status'],
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
  }

  /**
   * Get all HSN codes mapped to a given product category
   */
  async getHsnsForCategory(productCategoryId: string): Promise<HsnCodeCategoryEntity[]> {
    return this.mappingRepo.find({
      where: { productCategoryId },
      relations: ['hsnCode', 'hsnCode.status'],
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
  }

  /**
   * Map a category to an HSN code
   */
  async mapCategory(hsnCodeId: string, dto: MapHsnCategoryDto): Promise<HsnCodeCategoryEntity> {
    const hsn = await this.hsnRepo.findOne({ where: { id: hsnCodeId } });
    if (!hsn) {
      throw new NotFoundException(`HSN Code '${hsnCodeId}' not found`);
    }

    const category = await this.categoryRepo.findOne({
      where: { id: dto.productCategoryId },
    });
    if (!category) {
      throw new NotFoundException(`Product Category '${dto.productCategoryId}' not found`);
    }

    let existing = await this.mappingRepo.findOne({
      where: {
        hsnCodeId,
        productCategoryId: dto.productCategoryId,
      },
    });

    const isPrimary = dto.isPrimary ?? false;

    // If marked as primary, reset any other primary category for this HSN
    if (isPrimary) {
      await this.mappingRepo.update(
        { hsnCodeId, isPrimary: true },
        { isPrimary: false },
      );
    }

    if (existing) {
      existing.isPrimary = isPrimary;
      const saved = await this.mappingRepo.save(existing);
      return this.mappingRepo.findOne({
        where: { id: saved.id },
        relations: ['productCategory', 'hsnCode'],
      }) as Promise<HsnCodeCategoryEntity>;
    }

    const newMapping = this.mappingRepo.create({
      hsnCodeId,
      productCategoryId: dto.productCategoryId,
      isPrimary,
    });

    const saved = await this.mappingRepo.save(newMapping);

    await this.audit.log({
      action: 'MAP_HSN_CATEGORY',
      module: 'CATALOG_MASTER',
      entityType: 'HsnCodeCategoryEntity',
      entityId: saved.id,
      newData: { hsnCode: hsn.code, categoryCode: category.code, isPrimary },
    });

    return this.mappingRepo.findOne({
      where: { id: saved.id },
      relations: ['productCategory', 'hsnCode'],
    }) as Promise<HsnCodeCategoryEntity>;
  }

  /**
   * Unmap category from HSN
   */
  async unmapCategory(
    hsnCodeId: string,
    productCategoryId: string,
  ): Promise<{ success: boolean; message: string }> {
    const mapping = await this.mappingRepo.findOne({
      where: { hsnCodeId, productCategoryId },
    });

    if (!mapping) {
      throw new NotFoundException('Mapping between specified HSN Code and Category does not exist.');
    }

    await this.mappingRepo.remove(mapping);

    await this.audit.log({
      action: 'UNMAP_HSN_CATEGORY',
      module: 'CATALOG_MASTER',
      entityType: 'HsnCodeCategoryEntity',
      entityId: mapping.id,
      newData: { hsnCodeId, productCategoryId },
    });


    return {
      success: true,
      message: 'Category unmapped from HSN successfully.',
    };
  }

  /**
   * Baseline Seeder for HSN ↔ Category mappings
   */
  async seedBaselineMappings(): Promise<{ seeded: number; skipped: number; total: number; message: string }> {
    const total = await this.mappingRepo.count();
    const message = total > 0
      ? `Database already contains ${total} HSN-Category mapping records. No static seeding needed.`
      : 'No static mapping seed data configured. Please configure HSN-Category mappings via standard API.';
    this.logger.log(message);

    return {
      seeded: 0,
      skipped: 0,
      total,
      message,
    };
  }
}
