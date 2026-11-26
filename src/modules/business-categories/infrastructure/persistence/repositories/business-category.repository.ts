import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import {
  IBusinessCategoryRepository,
  BusinessCategoryFindOptions,
} from "../../../domain/repositories/business-category.repository.interface";
import { BusinessCategoryEntity } from "../../../domain/entities/business-category.entity";
import { BusinessCategoryOrmEntity } from "../entities/business-category.orm-entity";
import { BusinessCategoryMapper } from "../mappers/business-category.mapper";
import { BusinessCategoryStatus } from "../../../domain/enums/business-category-status.enum";
import { runInTransaction } from "../../../../../common/utils/transaction-runner.util";
import {
  SUBCATEGORY_PARENT_REPAIR_MAP,
  computeLiveCategoryCounts,
  resolvePrimaryCategoryId,
} from "../../../../businesses/domain/utils/business-category-matcher";

@Injectable()
export class BusinessCategoryRepository implements IBusinessCategoryRepository, OnModuleInit {
  private readonly logger = new Logger(BusinessCategoryRepository.name);

  constructor(
    @InjectRepository(BusinessCategoryOrmEntity)
    private readonly ormRepo: Repository<BusinessCategoryOrmEntity>,
    private readonly dataSource: DataSource
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repairHierarchyAndAssignments();
  }

  private async repairHierarchyAndAssignments(): Promise<void> {
    try {
      await runInTransaction(
        this.dataSource,
        async (qr) => {
          // 1. Repair seeded subcategories that were stored with parent_id = NULL
          for (const [subId, parentId] of Object.entries(SUBCATEGORY_PARENT_REPAIR_MAP)) {
            await qr.manager.query(
              `UPDATE business_categories
               SET parent_id = $1, updated_at = NOW()
               WHERE id = $2
                 AND parent_id IS NULL
                 AND EXISTS (SELECT 1 FROM business_categories p WHERE p.id = $1)`,
              [parentId, subId],
            );
          }

          // 2. Ensure directory_businesses assignments match their canonical category
          const categories = await qr.manager.query(
            `SELECT id, name, slug, code, parent_id AS "parentId" FROM business_categories`,
          );
          const businesses = await qr.manager.query(
            `SELECT id, business_type AS "businessType" FROM directory_businesses`,
          );

          for (const biz of businesses) {
            const expectedCatId = resolvePrimaryCategoryId(biz.businessType, categories);
            if (!expectedCatId) continue;

            const existingRows = await qr.manager.query(
              `SELECT id, category_id AS "categoryId", is_primary AS "isPrimary"
               FROM business_category_assignments
               WHERE business_id = $1`,
              [biz.id],
            );

            if (existingRows.length === 0) {
              await qr.manager.query(
                `INSERT INTO business_category_assignments (id, business_id, category_id, is_primary)
                 VALUES ($1, $2, $3, TRUE)
                 ON CONFLICT (business_id, category_id) DO NOTHING`,
                [`bca-${biz.id}-${expectedCatId}`.slice(0, 64), biz.id, expectedCatId],
              );
            } else if (existingRows.length === 1 && existingRows[0].categoryId !== expectedCatId) {
              // Repair legacy catch-all wholesaler assignment for Distributor / Seller rows
              const currentAssigned = existingRows[0].categoryId;
              const isMislinkedLegacy =
                currentAssigned === "wholesaler" &&
                (expectedCatId === "distributor" || expectedCatId === "seller");
              if (isMislinkedLegacy) {
                await qr.manager.query(
                  `UPDATE business_category_assignments
                   SET category_id = $1, is_primary = TRUE
                   WHERE id = $2`,
                  [expectedCatId, existingRows[0].id],
                );
              }
            }
          }
        },
        "RepairBusinessCategoryHierarchy",
      );
    } catch (err) {
      this.logger.warn(
        `Skipping category hierarchy/assignment check: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async attachDynamicCounts(
    entities: BusinessCategoryEntity[],
  ): Promise<BusinessCategoryEntity[]> {
    if (!entities.length) return entities;
    try {
      const [allCategories, businesses, assignments] = await Promise.all([
        this.dataSource.query(
          `SELECT id, name, slug, code, parent_id AS "parentId" FROM business_categories`,
        ),
        this.dataSource.query(
          `SELECT id, business_type AS "businessType" FROM directory_businesses`,
        ),
        this.dataSource.query(
          `SELECT business_id AS "businessId", category_id AS "categoryId" FROM business_category_assignments`,
        ),
      ]);

      const counts = computeLiveCategoryCounts(businesses, assignments, allCategories);
      const applyCounts = (node: BusinessCategoryEntity) => {
        if (counts.has(node.id)) {
          node.businessCount = counts.get(node.id)!;
        }
        if (node.subcategories?.length) {
          node.subcategories.forEach(applyCounts);
        }
      };

      entities.forEach(applyCounts);
    } catch {
      // Preserve stored businessCount if relational count query is unavailable
    }
    return entities;
  }

  async findAll(options: BusinessCategoryFindOptions = {}): Promise<{ data: BusinessCategoryEntity[]; total: number }> {
    const qb = this.ormRepo.createQueryBuilder("bc");

    if (options.status && options.status !== 'all') {
      qb.andWhere("bc.status = :st", { st: options.status });
    }

    if (options.isActive !== undefined) {
      qb.andWhere("bc.isActive = :act", { act: options.isActive });
    }

    if (options.onlyRoot || options.parentId === 'root') {
      qb.andWhere("bc.parentId IS NULL");
    } else if (options.parentId && options.parentId !== 'all') {
      qb.andWhere("bc.parentId = :pid", { pid: options.parentId });
    }

    if (options.type && options.type !== 'all') {
      qb.andWhere("(LOWER(bc.type) = LOWER(:type) OR LOWER(bc.slug) = LOWER(:type) OR LOWER(bc.code) = LOWER(:type))", {
        type: options.type.trim(),
      });
    }

    if (options.query) {
      const q = `%${options.query.toLowerCase()}%`;
      qb.andWhere("(LOWER(bc.name) LIKE :q OR LOWER(bc.description) LIKE :q OR LOWER(bc.code) LIKE :q OR LOWER(bc.slug) LIKE :q)", { q });
    }

    qb.orderBy("bc.displayOrder", "ASC").addOrderBy("bc.name", "ASC");

    if (options.limit) {
      const page = options.page || 1;
      qb.skip((page - 1) * options.limit).take(options.limit);
    }

    const [orms, total] = await qb.getManyAndCount();
    const data = await this.attachDynamicCounts(
      orms.map((o) => BusinessCategoryMapper.toDomain(o)),
    );
    return { data, total };
  }

  async findTree(): Promise<BusinessCategoryEntity[]> {
    const all = await this.ormRepo.find({
      order: { displayOrder: "ASC", name: "ASC" }
    });

    const domainList = all.map(o => BusinessCategoryMapper.toDomain(o));
    const rootNodes: BusinessCategoryEntity[] = [];
    const nodeMap = new Map<string, BusinessCategoryEntity>();

    for (const item of domainList) {
      item.subcategories = [];
      nodeMap.set(item.id, item);
    }

    for (const item of domainList) {
      if (item.parentId && nodeMap.has(item.parentId)) {
        nodeMap.get(item.parentId)!.subcategories!.push(item);
      } else {
        rootNodes.push(item);
      }
    }

    return this.attachDynamicCounts(rootNodes);
  }

  async findById(id: string): Promise<BusinessCategoryEntity | null> {
    const orm = await this.ormRepo.findOne({ where: { id } });
    return orm ? BusinessCategoryMapper.toDomain(orm) : null;
  }

  async findBySlug(slug: string): Promise<BusinessCategoryEntity | null> {
    const orm = await this.ormRepo.findOne({ where: { slug } });
    return orm ? BusinessCategoryMapper.toDomain(orm) : null;
  }

  async findByCode(code: string): Promise<BusinessCategoryEntity | null> {
    const orm = await this.ormRepo.findOne({ where: { code } });
    return orm ? BusinessCategoryMapper.toDomain(orm) : null;
  }

  async hasChildren(id: string): Promise<boolean> {
    const count = await this.ormRepo.count({ where: { parentId: id } });
    return count > 0;
  }

  async hasAssignedBusinesses(id: string): Promise<boolean> {
    try {
      const count = await this.dataSource.query(
        `SELECT COUNT(*) FROM business_category_assignments WHERE category_id = $1;`,
        [id]
      );
      return parseInt(count[0]?.count || '0', 10) > 0;
    } catch {
      return false;
    }
  }

  async save(entity: BusinessCategoryEntity): Promise<BusinessCategoryEntity> {
    const orm = BusinessCategoryMapper.toOrm(entity);
    const saved = await this.ormRepo.save(orm);
    return BusinessCategoryMapper.toDomain(saved);
  }

  async bulkUpdateOrder(items: Array<{ id: string; displayOrder: number }>): Promise<void> {
    if (!items || items.length === 0) return;

    await runInTransaction(
      this.dataSource,
      async (qr) => {
        for (const item of items) {
          await qr.manager.update(
            BusinessCategoryOrmEntity,
            { id: item.id },
            { displayOrder: Number(item.displayOrder) || 0 },
          );
        }
      },
      "BulkUpdateBusinessCategoryOrder",
    );
  }

  async delete(id: string): Promise<void> {
    await this.ormRepo.delete(id);
  }

  async count(): Promise<number> {
    return this.ormRepo.count();
  }
}
