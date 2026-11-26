import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, SelectQueryBuilder } from "typeorm";
import {
  IBusinessRepository,
  BusinessFindAllOptions,
  BusinessFacetsQuery,
  BusinessFacetsResult,
  PaginatedResult,
} from "../../../domain/repositories/business.repository.interface";
import { BusinessEntity } from "../../../domain/entities/business.entity";
import { BusinessOrmEntity } from "../entities/business-orm.entity";
import { BusinessMapper } from "../../mappers/business.mapper";
import { VerificationStatus } from "../../../domain/enums/verification-status.enum";
import { INITIAL_BUSINESS_SEED } from "../seeds/initial-businesses.seed";
import { runInTransaction } from "../../../../../common/utils/transaction-runner.util";
import {
  MinimalBusinessCategory,
  computeLiveCategoryCounts,
  expandMasterCategoryTerms,
  resolveCategoryFilterTargets,
  resolvePrimaryCategoryId,
  toTaxonomySlug,
} from "../../../domain/utils/business-category-matcher";

interface CategoryRowForFacet extends MinimalBusinessCategory {
  icon?: string;
  displayOrder: number;
  isActive: boolean;
}

type FacetDimension = "category" | "location" | "state" | "city" | "businessType" | "verification";

@Injectable()
export class TypeOrmBusinessRepository implements IBusinessRepository, OnModuleInit {
  private readonly logger = new Logger(TypeOrmBusinessRepository.name);
  private categoriesCache: CategoryRowForFacet[] | null = null;
  private categoriesCacheExpiresAt = 0;
  private readonly facetsCache = new Map<string, { value: BusinessFacetsResult; expiresAt: number }>();

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

  private async loadCategoriesMetadata(): Promise<CategoryRowForFacet[]> {
    const now = Date.now();
    if (this.categoriesCache && now < this.categoriesCacheExpiresAt) {
      return this.categoriesCache;
    }
    try {
      const rows = await this.dataSource.query(
        `SELECT id, name, slug, code, parent_id AS "parentId", icon,
                display_order AS "displayOrder", is_active AS "isActive"
         FROM business_categories
         WHERE is_active = TRUE
         ORDER BY display_order ASC, name ASC`,
      );
      const parsed = Array.isArray(rows) ? rows : [];
      this.categoriesCache = parsed;
      this.categoriesCacheExpiresAt = now + 30_000;
      return parsed;
    } catch {
      return [];
    }
  }

  private applyBusinessFilters(
    queryBuilder: SelectQueryBuilder<BusinessOrmEntity>,
    options: BusinessFacetsQuery,
    categories: MinimalBusinessCategory[],
    excludeDimension?: FacetDimension,
  ): void {
    if (options.query) {
      const q = `%${options.query.toLowerCase()}%`;
      queryBuilder.andWhere(
        "(LOWER(b.name) LIKE :q OR LOWER(b.category) LIKE :q OR LOWER(b.business_type) LIKE :q OR LOWER(b.city) LIKE :q OR LOWER(b.state) LIKE :q OR LOWER(b.description) LIKE :q)",
        { q },
      );
    }

    if (
      excludeDimension !== "category" &&
      options.category &&
      options.category !== "all" &&
      options.category !== "All Categories"
    ) {
      const terms = expandMasterCategoryTerms(options.category);
      const exactSlug = toTaxonomySlug(options.category);
      const clauses = terms.map((_, idx) => `LOWER(b.category) LIKE :catTerm${idx} OR LOWER(b.industry) LIKE :catTerm${idx}`);
      const params: Record<string, string> = {
        catRaw: options.category.toLowerCase().trim(),
        catSlugTerm: `%${exactSlug.replace(/-/g, " ")}%`,
      };
      terms.forEach((term, idx) => {
        params[`catTerm${idx}`] = `%${term}%`;
      });
      queryBuilder.andWhere(
        `(LOWER(TRIM(b.category)) = :catRaw OR ${clauses.join(" OR ")} OR LOWER(REGEXP_REPLACE(b.category, '[^a-zA-Z0-9]+', ' ', 'g')) LIKE :catSlugTerm)`,
        params,
      );
    }

    if (excludeDimension !== "location") {
      if (excludeDimension !== "state") {
        if (options.state && options.state !== "all") {
          queryBuilder.andWhere("LOWER(TRIM(b.state)) = LOWER(TRIM(:state))", {
            state: options.state,
          });
        } else if (options.location && options.location !== "all" && excludeDimension !== "city") {
          const loc = options.location.trim().toLowerCase();
          queryBuilder.andWhere("(LOWER(TRIM(b.state)) = :loc OR LOWER(TRIM(b.city)) = :loc)", {
            loc,
          });
        }
      }

      if (excludeDimension !== "city" && options.city && options.city !== "all") {
        queryBuilder.andWhere("LOWER(TRIM(b.city)) = LOWER(TRIM(:city))", {
          city: options.city,
        });
      }
    }

    if (excludeDimension !== "businessType" && options.businessType && options.businessType !== "all") {
      const { categoryIds, typeTokens } = resolveCategoryFilterTargets(
        options.businessType,
        categories,
      );

      if (categoryIds.length > 0 && typeTokens.length > 0) {
        queryBuilder.andWhere(
          `(EXISTS (SELECT 1 FROM business_category_assignments bca WHERE bca.business_id = b.id AND bca.category_id IN (:...targetCatIds))
            OR LOWER(TRIM(b.business_type)) IN (:...targetTypeTokens))`,
          { targetCatIds: categoryIds, targetTypeTokens: typeTokens },
        );
      } else if (typeTokens.length > 0) {
        queryBuilder.andWhere("LOWER(TRIM(b.business_type)) IN (:...targetTypeTokens)", {
          targetTypeTokens: typeTokens,
        });
      } else {
        const btLower = options.businessType.toLowerCase().trim();
        queryBuilder.andWhere(
          "(LOWER(b.business_type) = :btExact OR LOWER(b.business_type) LIKE :btPattern)",
          { btExact: btLower, btPattern: `%${btLower}%` },
        );
      }
    }

    if (excludeDimension !== "verification" && options.verifiedOnly) {
      queryBuilder.andWhere("b.verification_status IN (:...v)", {
        v: [VerificationStatus.VERIFIED, VerificationStatus.PREMIUM],
      });
    }
  }

  async findAll(options: BusinessFindAllOptions): Promise<PaginatedResult<BusinessEntity>> {
    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 12;
    const skip = (page - 1) * limit;

    const categories = await this.loadCategoriesMetadata();
    const queryBuilder = this.ormRepository.createQueryBuilder("b");
    this.applyBusinessFilters(queryBuilder, options, categories);

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

  async getDirectoryFacets(options: BusinessFacetsQuery = {}): Promise<BusinessFacetsResult> {
    const cacheKey = JSON.stringify({
      q: options.query || "",
      c: options.category || "",
      l: options.location || "",
      s: options.state || "",
      ci: options.city || "",
      bt: options.businessType || "",
      v: Boolean(options.verifiedOnly),
    });
    const now = Date.now();
    const cached = this.facetsCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.value;
    }

    const categories = await this.loadCategoriesMetadata();

    const bizForCategoriesQb = this.ormRepository
      .createQueryBuilder("b")
      .select(["b.id AS id", "b.business_type AS \"businessType\""]);
    this.applyBusinessFilters(bizForCategoriesQb, options, categories, "businessType");

    const locationsQb = this.ormRepository
      .createQueryBuilder("b")
      .select("TRIM(b.state)", "name")
      .addSelect("COUNT(*)::int", "count")
      .where("b.state IS NOT NULL AND TRIM(b.state) != ''");
    this.applyBusinessFilters(locationsQb, options, categories, "location");
    locationsQb.groupBy("TRIM(b.state)").orderBy("count", "DESC").addOrderBy("TRIM(b.state)", "ASC");

    const citiesQb = this.ormRepository
      .createQueryBuilder("b")
      .select("TRIM(b.city)", "name")
      .addSelect("MIN(TRIM(b.state))", "state")
      .addSelect("COUNT(*)::int", "count")
      .where("b.city IS NOT NULL AND TRIM(b.city) != ''");
    this.applyBusinessFilters(citiesQb, options, categories, "city");
    citiesQb.groupBy("TRIM(b.city)").orderBy("count", "DESC").addOrderBy("TRIM(b.city)", "ASC");

    const masterCatQb = this.ormRepository
      .createQueryBuilder("b")
      .select("TRIM(b.category)", "name")
      .addSelect("COUNT(*)::int", "count")
      .where("b.category IS NOT NULL AND TRIM(b.category) != ''");
    this.applyBusinessFilters(masterCatQb, options, categories, "category");
    masterCatQb.groupBy("TRIM(b.category)").orderBy("count", "DESC").addOrderBy("TRIM(b.category)", "ASC");

    const verificationQb = this.ormRepository
      .createQueryBuilder("b")
      .select("COUNT(*)::int", "totalBusinesses")
      .addSelect(
        `COUNT(*) FILTER (WHERE b.verification_status IN ('Verified', 'Premium'))::int`,
        "verifiedCount",
      );
    this.applyBusinessFilters(verificationQb, options, categories, "verification");

    const [bizRows, assignmentRows, locationRows, cityRows, masterCatRows, productCatRows, verificationRow] = await Promise.all([
      bizForCategoriesQb.getRawMany(),
      this.dataSource
        .query(`SELECT business_id AS "businessId", category_id AS "categoryId" FROM business_category_assignments`)
        .catch(() => []),
      locationsQb.getRawMany(),
      citiesQb.getRawMany(),
      masterCatQb.getRawMany(),
      this.dataSource
        .query(`SELECT name, slug, display_order AS "displayOrder" FROM product_categories WHERE is_active = true ORDER BY display_order ASC, name ASC`)
        .catch(() => []),
      verificationQb.getRawOne(),
    ]);

    const categoryCounts = computeLiveCategoryCounts(bizRows, assignmentRows, categories);
    const rootBusinessCategories = categories
      .filter((c) => !c.parentId)
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        code: c.code,
        icon: c.icon,
        displayOrder: c.displayOrder ?? 0,
        businessCount: categoryCounts.get(c.id) ?? 0,
      }))
      .sort((a, b) =>
        b.businessCount !== a.businessCount
          ? b.businessCount - a.businessCount
          : a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
      );

    const totalBusinesses = Number(verificationRow?.totalBusinesses) || 0;
    const verifiedCount = Number(verificationRow?.verifiedCount) || 0;

    const masterCountByName = new Map<string, number>();
    for (const row of masterCatRows) {
      if (row?.name) {
        const key = String(row.name).trim().toLowerCase();
        masterCountByName.set(key, (masterCountByName.get(key) || 0) + (Number(row.count) || 0));
      }
    }

    const mergedMasterMap = new Map<string, { name: string; slug: string; count: number; displayOrder: number }>();
    for (const pc of productCatRows) {
      if (!pc?.name) continue;
      const name = String(pc.name).trim();
      const key = name.toLowerCase();
      mergedMasterMap.set(key, {
        name,
        slug: pc.slug ? String(pc.slug) : toTaxonomySlug(name),
        count: masterCountByName.get(key) || 0,
        displayOrder: Number(pc.displayOrder) || 0,
      });
    }
    for (const row of masterCatRows) {
      if (!row?.name) continue;
      const name = String(row.name).trim();
      const key = name.toLowerCase();
      if (!mergedMasterMap.has(key)) {
        mergedMasterMap.set(key, {
          name,
          slug: toTaxonomySlug(name),
          count: Number(row.count) || 0,
          displayOrder: 9999,
        });
      }
    }

    const mergedMasterCategories = Array.from(mergedMasterMap.values())
      .sort((a, b) =>
        b.count !== a.count
          ? b.count - a.count
          : a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
      )
      .map(({ name, slug, count }) => ({ name, slug, count }));

    const result: BusinessFacetsResult = {
      totalBusinesses,
      verifiedCount,
      unverifiedCount: Math.max(0, totalBusinesses - verifiedCount),
      businessCategories: rootBusinessCategories,
      locations: locationRows
        .filter((row: any) => row?.name)
        .map((row: any) => ({
          name: String(row.name),
          slug: toTaxonomySlug(row.name),
          count: Number(row.count) || 0,
        })),
      cities: cityRows
        .filter((row: any) => row?.name)
        .map((row: any) => ({
          name: String(row.name),
          slug: toTaxonomySlug(row.name),
          state: row.state ? String(row.state) : undefined,
          count: Number(row.count) || 0,
        })),
      masterCategories: mergedMasterCategories,
    };

    if (this.facetsCache.size >= 50) {
      const oldestKey = this.facetsCache.keys().next().value;
      if (oldestKey) this.facetsCache.delete(oldestKey);
    }
    this.facetsCache.set(cacheKey, { value: result, expiresAt: Date.now() + 20_000 });
    return result;
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

  async save(business: BusinessEntity, categoryIds?: string[]): Promise<BusinessEntity> {
    const categories = await this.loadCategoriesMetadata();
    return await runInTransaction(
      this.dataSource,
      async (qr) => {
        const orm = BusinessMapper.toOrm(business);
        const saved = await qr.manager.save(BusinessOrmEntity, orm);

        const resolvedIds = (categoryIds && categoryIds.length > 0
          ? categoryIds.filter(Boolean)
          : [resolvePrimaryCategoryId(business.businessType, categories)].filter(Boolean)) as string[];

        if (resolvedIds.length > 0) {
          await qr.manager.query(
            `DELETE FROM business_category_assignments WHERE business_id = $1`,
            [saved.id],
          );
          for (let idx = 0; idx < resolvedIds.length; idx++) {
            const catId = resolvedIds[idx];
            await qr.manager.query(
              `INSERT INTO business_category_assignments (id, business_id, category_id, is_primary)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (business_id, category_id) DO NOTHING`,
              [`bca-${saved.id}-${catId}`.slice(0, 64), saved.id, catId, idx === 0],
            );
          }
        }

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
