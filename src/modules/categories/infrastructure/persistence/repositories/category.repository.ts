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

const INITIAL_CATEGORIES = [
  { id: "cat-1", name: "Industrial Machinery", slug: "industrial-machinery", description: "Heavy machinery, CNC equipment, and tooling", displayOrder: 1, productCount: 420, businessCount: 150 },
  { id: "cat-2", name: "Textiles & Fabrics", slug: "textiles-fabrics", description: "Yarn, commercial textiles, and synthetic fabrics", displayOrder: 2, productCount: 310, businessCount: 95 },
  { id: "cat-3", name: "Pharmaceuticals", slug: "pharmaceuticals", description: "Active pharmaceutical ingredients and formulations", displayOrder: 3, productCount: 280, businessCount: 110 },
  { id: "cat-4", name: "Ceramics & Tiles", slug: "ceramics-tiles", description: "Vitrified tiles, sanitaryware, and ceramic raw materials", displayOrder: 4, productCount: 540, businessCount: 230 },
  { id: "cat-5", name: "Chemicals & Plastics", slug: "chemicals-plastics", description: "Industrial solvents, resins, and polymers", displayOrder: 5, productCount: 195, businessCount: 75 },
  { id: "cat-6", name: "Packaging & Printing", slug: "packaging-printing", description: "Corrugated boxes, film wrapping, and labels", displayOrder: 6, productCount: 160, businessCount: 60 },
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
    return {
      data: orms.map((o) => CategoryMapper.toDomain(o)),
      total,
    };
  }

  async findById(id: string): Promise<CategoryEntity | null> {
    const orm = await this.ormRepo.findOne({ where: { id } });
    return orm ? CategoryMapper.toDomain(orm) : null;
  }

  async findBySlug(slug: string): Promise<CategoryEntity | null> {
    const orm = await this.ormRepo.findOne({ where: { slug } });
    return orm ? CategoryMapper.toDomain(orm) : null;
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
