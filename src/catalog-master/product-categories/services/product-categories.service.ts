import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductCategoryEntity } from '../entities/product-category.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
  CategoryQueryDto,
  MoveCategoryDto,
} from '../dto';
import {
  UUID_REGEX,
  MercoraLogger,
  AuditService,
  toSlug,
  toCode,
} from '../../../common';

const generateSlug = toSlug;
const generateCode = toCode;

@Injectable()
export class ProductCategoriesService {
  private readonly logger = new MercoraLogger(ProductCategoriesService.name);

  constructor(
    @InjectRepository(ProductCategoryEntity)
    private readonly categoryRepo: Repository<ProductCategoryEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    private readonly audit: AuditService,
  ) {}

  /**
   * Find paginated list of categories with filters
   */
  async findAll(query: CategoryQueryDto = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 50));
    const skip = (page - 1) * limit;

    const qb = this.categoryRepo
      .createQueryBuilder('cat')
      .leftJoinAndSelect('cat.status', 'status')
      .leftJoinAndSelect('cat.parent', 'parent');

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(LOWER(cat.name) LIKE LOWER(:term) OR LOWER(cat.code) LIKE LOWER(:term) OR LOWER(cat.slug) LIKE LOWER(:term) OR LOWER(cat.description) LIKE LOWER(:term))',
        { term },
      );
    }

    if (query.roots_only) {
      qb.andWhere('cat.parentId IS NULL');
    } else if (query.parent_id) {
      qb.andWhere('cat.parentId = :parentId', { parentId: query.parent_id });
    }

    if (query.level !== undefined && query.level !== null) {
      qb.andWhere('cat.level = :lvl', { lvl: Number(query.level) });
    }

    if (query.status && query.status.trim()) {
      const st = query.status.trim();
      if (UUID_REGEX.test(st)) {
        qb.andWhere('cat.statusId = :st', { st });
      } else {
        qb.andWhere('status.code = :stCode', { stCode: st.toUpperCase() });
      }
    }

    const sortFieldMap: Record<string, string> = {
      sort_order: 'cat.sortOrder',
      sortOrder: 'cat.sortOrder',
      name: 'cat.name',
      level: 'cat.level',
      created_at: 'cat.createdAt',
      createdAt: 'cat.createdAt',
    };

    const sortBy = sortFieldMap[query.sort_by || 'sortOrder'] || 'cat.sortOrder';
    const sortOrder = (query.sort_order || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    qb.orderBy(sortBy, sortOrder as 'ASC' | 'DESC').addOrderBy('cat.name', 'ASC');
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Return full hierarchical category tree (Flipkart-style infinite tree)
   */
  async findTree(): Promise<ProductCategoryEntity[]> {
    const allCategories = await this.categoryRepo.find({
      relations: ['status', 'hsnMappings', 'hsnMappings.hsnCode'],
      order: {
        level: 'ASC',
        sortOrder: 'ASC',
        name: 'ASC',
      },
    });

    const map = new Map<string, ProductCategoryEntity & { children: ProductCategoryEntity[] }>();
    allCategories.forEach((cat) => {
      map.set(cat.id, { ...cat, children: [] });
    });

    const roots: ProductCategoryEntity[] = [];

    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /**
   * Return direct children of a category
   */
  async findChildren(id: string): Promise<ProductCategoryEntity[]> {
    return this.categoryRepo.find({
      where: { parentId: id },
      relations: ['status'],
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  /**
   * Find single category by UUID, Code, or Slug
   */
  async findOne(idOrSlug: string): Promise<ProductCategoryEntity> {
    if (!idOrSlug) {
      throw new BadRequestException('Identifier is required');
    }

    const trimmed = idOrSlug.trim();
    let category: ProductCategoryEntity | null = null;

    if (UUID_REGEX.test(trimmed)) {
      category = await this.categoryRepo.findOne({
        where: { id: trimmed },
        relations: ['status', 'parent', 'children', 'hsnMappings', 'hsnMappings.hsnCode'],
      });
    } else {
      category = await this.categoryRepo.findOne({
        where: [{ slug: trimmed.toLowerCase() }, { code: trimmed.toUpperCase() }],
        relations: ['status', 'parent', 'children', 'hsnMappings', 'hsnMappings.hsnCode'],
      });
    }

    if (!category) {
      throw new NotFoundException(`Product Category '${idOrSlug}' not found`);
    }

    return category;
  }

  /**
   * Generate breadcrumb path from root to this category
   */
  async findBreadcrumbPath(id: string) {
    const category = await this.findOne(id);
    const breadcrumbs: { id: string; name: string; code: string; slug: string; level: number }[] =
      [];

    let current: ProductCategoryEntity | null = category;
    while (current) {
      breadcrumbs.unshift({
        id: current.id,
        name: current.name,
        code: current.code,
        slug: current.slug,
        level: current.level,
      });

      if (current.parentId) {
        current = await this.categoryRepo.findOne({
          where: { id: current.parentId },
        });
      } else {
        current = null;
      }
    }

    return breadcrumbs;
  }

  /**
   * Create a new category
   */
  async create(dto: CreateProductCategoryDto): Promise<ProductCategoryEntity> {
    const name = dto.name.trim();
    const code = dto.code ? generateCode(dto.code) : generateCode(name);
    const slug = dto.slug ? generateSlug(dto.slug) : generateSlug(name);

    // Uniqueness checks
    const existingCode = await this.categoryRepo.findOne({ where: { code } });
    if (existingCode) {
      throw new ConflictException(`Category code '${code}' already exists`);
    }

    const existingSlug = await this.categoryRepo.findOne({ where: { slug } });
    if (existingSlug) {
      throw new ConflictException(`Category slug '${slug}' already exists`);
    }

    let level = 1;
    let parentPath = '';
    const parentId = (dto.parentId && dto.parentId.trim() !== '') ? dto.parentId.trim() : null;

    if (parentId) {
      const parent = await this.categoryRepo.findOne({ where: { id: parentId } });
      if (!parent) {
        throw new NotFoundException(`Parent category '${parentId}' not found`);
      }
      level = parent.level + 1;
      parentPath = parent.path || parent.id;
    }

    let statusId: string | null = null;
    if (dto.status) {
      const st = dto.status.trim();
      const statusEntity = UUID_REGEX.test(st)
        ? await this.statusRepo.findOne({ where: { id: st } })
        : await this.statusRepo.findOne({ where: { code: st.toUpperCase() } });
      if (statusEntity) {
        statusId = statusEntity.id;
      }
    } else {
      const def = await this.statusRepo.findOne({ where: { code: 'ACTIVE' } });
      statusId = def?.id || null;
    }

    const entity = this.categoryRepo.create({
      name,
      code,
      slug,
      parentId,
      description: dto.description || null,
      icon: dto.icon || null,
      imageUrl: dto.imageUrl || null,
      level,
      sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : 0,
      isSystem: dto.isSystem ?? false,
      statusId,
    });

    const saved = await this.categoryRepo.save(entity);

    // Save materialized path
    saved.path = parentPath ? `${parentPath}/${saved.id}` : saved.id;
    await this.categoryRepo.save(saved);

    await this.audit.log({
      action: 'CREATE_PRODUCT_CATEGORY',
      module: 'CATALOG_MASTER',
      entityType: 'ProductCategoryEntity',
      entityId: saved.id,
      newData: { name: saved.name, code: saved.code, level: saved.level },
    });

    return this.findOne(saved.id);
  }

  /**
   * Update category
   */
  async update(id: string, dto: UpdateProductCategoryDto): Promise<ProductCategoryEntity> {
    const category = await this.findOne(id);

    if (dto.name) {
      category.name = dto.name.trim();
    }

    if (dto.code) {
      const newCode = generateCode(dto.code);
      if (newCode !== category.code) {
        const existing = await this.categoryRepo.findOne({ where: { code: newCode } });
        if (existing) throw new ConflictException(`Category code '${newCode}' already exists`);
        category.code = newCode;
      }
    }

    if (dto.slug) {
      const newSlug = generateSlug(dto.slug);
      if (newSlug !== category.slug) {
        const existing = await this.categoryRepo.findOne({ where: { slug: newSlug } });
        if (existing) throw new ConflictException(`Category slug '${newSlug}' already exists`);
        category.slug = newSlug;
      }
    }

    if (dto.description !== undefined) category.description = dto.description;
    if (dto.icon !== undefined) category.icon = dto.icon;
    if (dto.imageUrl !== undefined) category.imageUrl = dto.imageUrl;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;

    if (dto.status) {
      const st = dto.status.trim();
      const statusEntity = UUID_REGEX.test(st)
        ? await this.statusRepo.findOne({ where: { id: st } })
        : await this.statusRepo.findOne({ where: { code: st.toUpperCase() } });
      if (statusEntity) {
        category.statusId = statusEntity.id;
      }
    }

    const saved = await this.categoryRepo.save(category);

    await this.audit.log({
      action: 'UPDATE_PRODUCT_CATEGORY',
      module: 'CATALOG_MASTER',
      entityType: 'ProductCategoryEntity',
      entityId: saved.id,
      newData: { name: saved.name, code: saved.code },
    });

    return this.findOne(saved.id);
  }

  /**
   * Move / Reparent category safely with cycle prevention and recursive descendant path update
   */
  async moveCategory(id: string, dto: MoveCategoryDto): Promise<ProductCategoryEntity> {
    const category = await this.findOne(id);
    const targetParentId = dto.targetParentId || null;

    if (targetParentId === id) {
      throw new BadRequestException('A category cannot be its own parent.');
    }

    let newLevel = 1;
    let newBasePath = id;

    if (targetParentId) {
      const targetParent = await this.findOne(targetParentId);

      // Verify that targetParent is not inside current category's descendant tree
      if (targetParent.path && targetParent.path.split('/').includes(id)) {
        throw new BadRequestException(
          `Cannot move category '${category.name}' into its own child '${targetParent.name}'.`,
        );
      }

      newLevel = targetParent.level + 1;
      newBasePath = `${targetParent.path}/${id}`;
    }

    const oldPath = category.path || id;
    category.parentId = targetParentId;
    category.level = newLevel;
    category.path = newBasePath;

    await this.categoryRepo.save(category);

    // Recursively update all descendants
    const descendants = await this.categoryRepo
      .createQueryBuilder('cat')
      .where('cat.path LIKE :pathPrefix', { pathPrefix: `${oldPath}/%` })
      .getMany();

    for (const desc of descendants) {
      const relativeSuffix = desc.path.substring(oldPath.length);
      desc.path = `${newBasePath}${relativeSuffix}`;
      desc.level = desc.path.split('/').length;
      await this.categoryRepo.save(desc);
    }

    await this.audit.log({
      action: 'MOVE_PRODUCT_CATEGORY',
      module: 'CATALOG_MASTER',
      entityType: 'ProductCategoryEntity',
      entityId: category.id,
      newData: { newParentId: targetParentId, newLevel },
    });

    return this.findOne(id);
  }

  /**
   * Soft-delete category (guarded)
   */
  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const category = await this.findOne(id);

    if (category.isSystem) {
      throw new BadRequestException(
        `Category '${category.name}' is a protected System Category and cannot be deleted.`,
      );
    }

    const childCount = await this.categoryRepo.count({
      where: { parentId: id },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        `Cannot delete '${category.name}' because it contains ${childCount} child categories. Move or delete children first.`,
      );
    }

    await this.categoryRepo.softDelete(id);

    await this.audit.log({
      action: 'DELETE_PRODUCT_CATEGORY',
      module: 'CATALOG_MASTER',
      entityType: 'ProductCategoryEntity',
      entityId: id,
      newData: { name: category.name, code: category.code },
    });


    return {
      success: true,
      message: `Category '${category.name}' deleted successfully.`,
    };
  }

  /**
   * Baseline Seeder for Product Categories
   */
  async seedBaselineCategories(): Promise<{ seeded: number; skipped: number; total: number; message: string }> {
    const total = await this.categoryRepo.count();
    const message = total > 0
      ? `Database already contains ${total} category records. No static seeding needed.`
      : 'No static category seed data configured. Please create or import categories via standard API.';
    this.logger.log(message);

    return {
      seeded: 0,
      skipped: 0,
      total,
      message,
    };
  }
}
