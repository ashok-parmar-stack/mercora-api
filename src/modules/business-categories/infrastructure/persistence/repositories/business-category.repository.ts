import { Injectable, Logger } from "@nestjs/common";
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

@Injectable()
export class BusinessCategoryRepository implements IBusinessCategoryRepository {
  private readonly logger = new Logger(BusinessCategoryRepository.name);

  constructor(
    @InjectRepository(BusinessCategoryOrmEntity)
    private readonly ormRepo: Repository<BusinessCategoryOrmEntity>,
    private readonly dataSource: DataSource
  ) {}

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
    return {
      data: orms.map((o) => BusinessCategoryMapper.toDomain(o)),
      total,
    };
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

    return rootNodes;
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

  async delete(id: string): Promise<void> {
    await this.ormRepo.delete(id);
  }

  async count(): Promise<number> {
    return this.ormRepo.count();
  }
}
