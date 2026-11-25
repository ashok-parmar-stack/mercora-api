import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { IBusinessRepository, BusinessFindAllOptions, PaginatedResult } from "../../../domain/repositories/business.repository.interface";
import { BusinessEntity } from "../../../domain/entities/business.entity";
import { BusinessOrmEntity } from "../entities/business-orm.entity";
import { BusinessMapper } from "../../mappers/business.mapper";
import { VerificationStatus } from "../../../domain/enums/verification-status.enum";
import { INITIAL_BUSINESS_SEED } from "../seeds/initial-businesses.seed";
import { runInTransaction } from "../../../../../common/utils/transaction-runner.util";

@Injectable()
export class TypeOrmBusinessRepository implements IBusinessRepository, OnModuleInit {
  private readonly logger = new Logger(TypeOrmBusinessRepository.name);

  constructor(
    @InjectRepository(BusinessOrmEntity)
    private readonly ormRepository: Repository<BusinessOrmEntity>,
    private readonly dataSource: DataSource
  ) { }

  async onModuleInit() {
    const count = await this.ormRepository.count();
    if (count === 0) {
      await this.seedInitialBusinesses();
    }
  }

  private async seedInitialBusinesses(): Promise<void> {
    await runInTransaction(
      this.dataSource,
      async (qr) => {
        for (const item of INITIAL_BUSINESS_SEED) {
          const entity = qr.manager.create(BusinessOrmEntity, item);
          await qr.manager.save(BusinessOrmEntity, entity);
        }
      },
      "SeedInitialBusinesses"
    );
    this.logger.log(`Seeded ${INITIAL_BUSINESS_SEED.length} verified directory businesses inside transaction.`);
  }

  async findAll(options: BusinessFindAllOptions): Promise<PaginatedResult<BusinessEntity>> {
    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 12;
    const skip = (page - 1) * limit;

    const queryBuilder = this.ormRepository.createQueryBuilder("b");

    if (options.query) {
      const q = `%${options.query.toLowerCase()}%`;
      queryBuilder.andWhere(
        "(LOWER(b.name) LIKE :q OR LOWER(b.category) LIKE :q OR LOWER(b.city) LIKE :q OR LOWER(b.state) LIKE :q OR LOWER(b.description) LIKE :q)",
        { q }
      );
    }

    if (options.category && options.category !== "all" && options.category !== "All Categories") {
      const catLower = options.category.toLowerCase().trim().replace(/-/g, " ");
      queryBuilder.andWhere(
        "(LOWER(b.category) = :catExact OR LOWER(b.category) LIKE :catPattern)",
        { catExact: options.category.toLowerCase().trim(), catPattern: `%${catLower}%` }
      );
    }

    if (options.state && options.state !== "all") {
      queryBuilder.andWhere("LOWER(b.state) = LOWER(:state)", { state: options.state.trim() });
    } else if (options.location && options.location !== "all") {
      const loc = options.location.trim().toLowerCase();
      queryBuilder.andWhere("(LOWER(b.state) = :loc OR LOWER(b.city) = :loc)", { loc });
    }

    if (options.city && options.city !== "all") {
      queryBuilder.andWhere("LOWER(b.city) = LOWER(:city)", { city: options.city.trim() });
    }

    if (options.businessType && options.businessType !== "all") {
      const btLower = options.businessType.toLowerCase().trim();
      queryBuilder.andWhere(
        "(LOWER(b.business_type) = :btExact OR LOWER(b.business_type) LIKE :btPattern)",
        { btExact: btLower, btPattern: `%${btLower}%` }
      );
    }

    if (options.verifiedOnly) {
      queryBuilder.andWhere("b.verification_status IN (:...v)", {
        v: [VerificationStatus.VERIFIED, VerificationStatus.PREMIUM],
      });
    }

    switch (options.sortBy) {
      case "rating":
        queryBuilder.orderBy("b.rating", "DESC");
        break;
      case "reviews":
        queryBuilder.orderBy("b.review_count", "DESC");
        break;
      case "established":
        queryBuilder.orderBy("b.established_year", "ASC");
        break;
      default:
        queryBuilder.orderBy("b.rating", "DESC").addOrderBy("b.review_count", "DESC");
        break;
    }

    const [orms, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: BusinessMapper.toDomainList(orms),
      total,
      totalCount: total,
      page,
      limit,
      totalPages,
    };
  }

  async findById(id: string): Promise<BusinessEntity | null> {
    const orm = await this.ormRepository.findOne({ where: { id } });
    return orm ? BusinessMapper.toDomain(orm) : null;
  }

  async findBySlug(slug: string): Promise<BusinessEntity | null> {
    const orm = await this.ormRepository.findOne({ where: { slug } });
    return orm ? BusinessMapper.toDomain(orm) : null;
  }

  async findFeatured(limit: number = 6): Promise<BusinessEntity[]> {
    const orms = await this.ormRepository.find({
      where: [{ verification_status: VerificationStatus.PREMIUM }, { verification_status: VerificationStatus.VERIFIED }],
      order: { rating: "DESC", review_count: "DESC" },
      take: limit,
    });
    return BusinessMapper.toDomainList(orms);
  }

  async save(business: BusinessEntity): Promise<BusinessEntity> {
    return await runInTransaction(
      this.dataSource,
      async (qr) => {
        const orm = BusinessMapper.toOrm(business);
        const saved = await qr.manager.save(BusinessOrmEntity, orm);
        return BusinessMapper.toDomain(saved);
      },
      "SaveBusiness"
    );
  }

  async delete(id: string): Promise<void> {
    await runInTransaction(
      this.dataSource,
      async (qr) => {
        await qr.manager.delete(BusinessOrmEntity, { id });
      },
      "DeleteBusiness"
    );
  }

  async updateStatus(id: string, status: VerificationStatus): Promise<BusinessEntity | null> {
    return await runInTransaction(
      this.dataSource,
      async (qr) => {
        await qr.manager.update(BusinessOrmEntity, { id }, { verification_status: status });
        const updated = await qr.manager.findOne(BusinessOrmEntity, { where: { id } });
        return updated ? BusinessMapper.toDomain(updated) : null;
      },
      "UpdateBusinessStatus"
    );
  }
}
