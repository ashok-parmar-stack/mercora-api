import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
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
import { INITIAL_BUSINESS_CATEGORIES } from "../seeds/initial-business-categories.seed";
import { runInTransaction } from "../../../../../common/utils/transaction-runner.util";

@Injectable()
export class BusinessCategoryRepository implements IBusinessCategoryRepository, OnModuleInit {
  private readonly logger = new Logger(BusinessCategoryRepository.name);

  constructor(
    @InjectRepository(BusinessCategoryOrmEntity)
    private readonly ormRepo: Repository<BusinessCategoryOrmEntity>,
    private readonly dataSource: DataSource
  ) {}

  async onModuleInit() {
    const count = await this.ormRepo.count();
    if (count === 0) {
      await runInTransaction(
        this.dataSource,
        async (qr) => {
          for (const item of INITIAL_BUSINESS_CATEGORIES) {
            const orm = qr.manager.create(BusinessCategoryOrmEntity, item);
            await qr.manager.save(BusinessCategoryOrmEntity, orm);
          }
        },
        "SeedInitialBusinessCategories"
      );
      this.logger.log(`Seeded ${INITIAL_BUSINESS_CATEGORIES.length} initial business categories.`);
    }
  }

  async findAll(options: BusinessCategoryFindOptions = {}): Promise<{ data: BusinessCategoryEntity[]; total: number }> {
    const qb = this.ormRepo.createQueryBuilder("bc");

    if (options.status) {
      qb.andWhere("bc.status = :st", { st: options.status });
    } else {
      qb.andWhere("bc.status = :st", { st: BusinessCategoryStatus.ACTIVE });
    }

    if (options.type) {
      qb.andWhere("(LOWER(bc.type) = LOWER(:type) OR LOWER(bc.slug) = LOWER(:type) OR LOWER(bc.code) = LOWER(:type))", {
        type: options.type.trim(),
      });
    }

    if (options.query) {
      const q = `%${options.query.toLowerCase()}%`;
      qb.andWhere("(LOWER(bc.name) LIKE :q OR LOWER(bc.description) LIKE :q OR LOWER(bc.code) LIKE :q)", { q });
    }

    qb.orderBy("bc.displayOrder", "ASC").addOrderBy("bc.name", "ASC");

    if (options.limit) {
      const page = options.page || 1;
      qb.skip((page - 1) * options.limit).take(options.limit);
    }

    const [orms, total] = await qb.getManyAndCount();
    return {
      data: orms.map((o) => BusinessCategoryMapper.toDomain(o)),
      total,
    };
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

  async save(entity: BusinessCategoryEntity): Promise<BusinessCategoryEntity> {
    const orm = BusinessCategoryMapper.toOrm(entity);
    const saved = await this.ormRepo.save(orm);
    return BusinessCategoryMapper.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.ormRepo.delete(id);
  }

  async count(): Promise<number> {
    return this.ormRepo.count();
  }
}
