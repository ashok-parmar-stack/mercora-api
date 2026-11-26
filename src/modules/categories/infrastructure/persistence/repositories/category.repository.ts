import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import {
  ICategoryRepository,
  CategoryFindOptions,
} from "../../../domain/repositories/category.repository.interface";
import { CategoryEntity } from "../../../domain/entities/category.entity";
import { CategoryOrmEntity } from "../entities/category.orm-entity";
import { CategoryMapper } from "../mappers/category.mapper";
import { CategoryStatus } from "../../../domain/enums/category-status.enum";
import { runInTransaction } from "../../../../../common/utils/transaction-runner.util";
import {
  expandMasterCategoryTerms,
  normalizeTaxonomyText,
} from "../../../../businesses/domain/utils/business-category-matcher";

const INITIAL_CATEGORIES = [
  { id: "cat-1", name: "Industrial Machinery", slug: "industrial-machinery", description: "Heavy machinery, CNC equipment, industrial tooling and automation", displayOrder: 1, iconUrl: "Factory", productCount: 0, businessCount: 0 },
  { id: "cat-2", name: "Textiles & Fabrics", slug: "textiles-fabrics", description: "Yarn, commercial textiles, apparel fabric and synthetic weaves", displayOrder: 2, iconUrl: "Layers", productCount: 0, businessCount: 0 },
  { id: "cat-3", name: "Pharmaceuticals", slug: "pharmaceuticals", description: "Active pharmaceutical ingredients, generic formulations and dosage forms", displayOrder: 3, iconUrl: "Activity", productCount: 0, businessCount: 0 },
  { id: "cat-4", name: "Ceramics & Tiles", slug: "ceramics-tiles", description: "Vitrified tiles, sanitaryware, porcelain slabs and ceramic raw materials", displayOrder: 4, iconUrl: "Grid", productCount: 0, businessCount: 0 },
  { id: "cat-5", name: "Chemicals & Plastics", slug: "chemicals-plastics", description: "Industrial solvents, resins, polymers and specialty compounds", displayOrder: 5, iconUrl: "FlaskConical", productCount: 0, businessCount: 0 },
  { id: "cat-6", name: "Packaging & Printing", slug: "packaging-printing", description: "Corrugated boxes, protective film wrapping, barcode labels and cartons", displayOrder: 6, iconUrl: "Package", productCount: 0, businessCount: 0 },
  { id: "cat-7", name: "Electrical & Electronics", slug: "electrical-electronics", description: "Power transmission equipment, semiconductors, panels and industrial cables", displayOrder: 7, iconUrl: "Zap", productCount: 0, businessCount: 0 },
  { id: "cat-8", name: "Construction & Real Estate", slug: "construction-real-estate", description: "Structural steel, cement, architectural hardware and civil materials", displayOrder: 8, iconUrl: "Building", productCount: 0, businessCount: 0 },
  { id: "cat-9", name: "Agriculture & Food", slug: "agriculture-food", description: "Agricultural produce, spices, grains, seeds and processed foods", displayOrder: 9, iconUrl: "Sprout", productCount: 0, businessCount: 0 },
  { id: "cat-10", name: "Metals & Minerals", slug: "metals-minerals", description: "Alloy ingots, mineral ores, sheet metals and metallurgical castings", displayOrder: 10, iconUrl: "Component", productCount: 0, businessCount: 0 },
  { id: "cat-11", name: "Automotive & Auto Parts", slug: "automotive-parts", description: "OEM vehicle spares, forged automotive components and accessories", displayOrder: 11, iconUrl: "Truck", productCount: 0, businessCount: 0 },
  { id: "cat-12", name: "Renewable & Solar Energy", slug: "renewable-solar-energy", description: "Photovoltaic solar panels, inverters, wind turbine components and cells", displayOrder: 12, iconUrl: "SunMedium", productCount: 0, businessCount: 0 },
];

@Injectable()
export class CategoryRepository implements ICategoryRepository, OnModuleInit {
  private readonly logger = new Logger(CategoryRepository.name);

  constructor(
    @InjectRepository(CategoryOrmEntity)
    private readonly ormRepo: Repository<CategoryOrmEntity>,
    private readonly dataSource: DataSource
  ) {}

  async onModuleInit() {
    const count = await this.ormRepo.count();
    if (count === 0) {
      await runInTransaction(
        this.dataSource,
        async (qr) => {
          for (const item of INITIAL_CATEGORIES) {
            const orm = qr.manager.create(CategoryOrmEntity, {
              ...item,
              status: CategoryStatus.ACTIVE,
            });
            await qr.manager.save(CategoryOrmEntity, orm);
          }
        },
        "SeedInitialCategories"
      );
      this.logger.log(`Seeded ${INITIAL_CATEGORIES.length} initial categories within transaction.`);
    }
  }

  private async attachDynamicCounts(categories: CategoryEntity[]): Promise<CategoryEntity[]> {
    if (!categories.length) return categories;
    try {
      const rows = await this.dataSource.query(
        `SELECT TRIM(category) AS category, COUNT(*)::int AS cnt
         FROM directory_businesses
         WHERE category IS NOT NULL AND TRIM(category) != ''
         GROUP BY TRIM(category)`,
      );

      const normalizedCounts: Array<{ norm: string; cnt: number }> = (rows || []).map((r: any) => ({
        norm: normalizeTaxonomyText(r.category),
        cnt: Number(r.cnt) || 0,
      }));

      for (const cat of categories) {
        const matchTerms = expandMasterCategoryTerms(cat.name).map(normalizeTaxonomyText);
        const totalForCat = normalizedCounts
          .filter((entry) => matchTerms.includes(entry.norm))
          .reduce((sum, entry) => sum + entry.cnt, 0);
        cat.businessCount = totalForCat;
      }
    } catch {
      // Keep stored count if directory_businesses query fails
    }
    return categories;
  }

  async findAll(options: CategoryFindOptions = {}): Promise<{ data: CategoryEntity[]; total: number }> {
    const qb = this.ormRepo.createQueryBuilder("c");

    if (options.status) {
      qb.andWhere("c.status = :st", { st: options.status });
    } else {
      qb.andWhere("c.status = :st", { st: CategoryStatus.ACTIVE });
    }

    if (options.query) {
      qb.andWhere("(LOWER(c.name) LIKE :q OR LOWER(c.description) LIKE :q)", {
        q: `%${options.query.toLowerCase()}%`,
      });
    }

    if (options.parentId !== undefined) {
      if (options.parentId === null) {
        qb.andWhere("c.parentId IS NULL");
      } else {
        qb.andWhere("c.parentId = :pId", { pId: options.parentId });
      }
    }

    qb.orderBy("c.displayOrder", "ASC").addOrderBy("c.name", "ASC");

    if (options.limit) {
      const page = options.page || 1;
      qb.skip((page - 1) * options.limit).take(options.limit);
    }

    const [orms, total] = await qb.getManyAndCount();
    const data = await this.attachDynamicCounts(orms.map((o) => CategoryMapper.toDomain(o)));
    return { data, total };
  }

  async findById(id: string): Promise<CategoryEntity | null> {
    const orm = await this.ormRepo.findOne({ where: { id } });
    if (!orm) return null;
    const [enriched] = await this.attachDynamicCounts([CategoryMapper.toDomain(orm)]);
    return enriched;
  }

  async findBySlug(slug: string): Promise<CategoryEntity | null> {
    const orm = await this.ormRepo.findOne({ where: { slug } });
    if (!orm) return null;
    const [enriched] = await this.attachDynamicCounts([CategoryMapper.toDomain(orm)]);
    return enriched;
  }

  async save(category: CategoryEntity): Promise<CategoryEntity> {
    return await runInTransaction(
      this.dataSource,
      async (qr) => {
        const orm = CategoryMapper.toOrm(category);
        const saved = await qr.manager.save(CategoryOrmEntity, orm);
        return CategoryMapper.toDomain(saved);
      },
      "SaveCategory"
    );
  }

  async delete(id: string): Promise<void> {
    await runInTransaction(
      this.dataSource,
      async (qr) => {
        await qr.manager.delete(CategoryOrmEntity, { id });
      },
      "DeleteCategory"
    );
  }

  async countChildren(parentId: string): Promise<number> {
    return this.ormRepo.count({ where: { parentId } });
  }
}
