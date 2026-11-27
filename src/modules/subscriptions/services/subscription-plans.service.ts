import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import { runInTransaction } from '../../../common/utils/transaction-runner.util';
import { SubscriptionPlanEntity } from '../entities/subscription-plan.entity';
import { PlanFeatureEntity } from '../entities/plan-feature.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import {
  CreateSubscriptionPlanDto,
  GenerateSystemPlansDto,
  UpdateSubscriptionPlanDto,
} from '../dto/subscription-plan.dto';
import {
  BillingInterval,
  INITIAL_SUBSCRIPTION_PLANS,
  PlanFeatureGroup,
  PlanLimits,
  SUBSCRIPTION_FEATURE_KEYS,
  SYSTEM_PLAN_TEMPLATES,
  SubscriptionStatus,
  buildSystemFeatureGroups,
  buildSystemPlanFeatures,
} from '../subscription.constants';

export interface PlanResponseView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  label: string | null;
  isPopular: boolean;
  originalPrice: number | null;
  originalPriceMinor: number | null;
  price: number;
  priceMinor: number;
  currency: string;
  billingInterval: string;
  durationDays: number;
  gstRateBps: number;
  taxMinor: number;
  totalPriceMinor: number;
  totalPrice: number;
  features: string[];
  featureGroups: PlanFeatureGroup[];
  limits: PlanLimits;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  activeSubscribersCount?: number;
  totalSubscriptionsCount?: number;
}

@Injectable()
export class SubscriptionPlansService implements OnModuleInit {
  private readonly logger = new MercoraLogger(SubscriptionPlansService.name);

  constructor(
    @InjectRepository(SubscriptionPlanEntity)
    private readonly planRepo: Repository<SubscriptionPlanEntity>,
    @InjectRepository(PlanFeatureEntity)
    private readonly planFeatureRepo: Repository<PlanFeatureEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.ensureSeededPlansAndFeatures();
    } catch (err: any) {
      this.logger.warn('Deferred plan seed check skipped', { reason: err?.message });
    }
  }

  async ensureSeededPlansAndFeatures(): Promise<void> {
    const count = await this.planRepo.count();
    if (count === 0) {
      for (const spec of INITIAL_SUBSCRIPTION_PLANS) {
        const created = await this.planRepo.save(
          this.planRepo.create({
            code: spec.code,
            name: spec.name,
            description: spec.description,
            label: spec.label,
            isPopular: spec.isPopular,
            originalPriceMinor: (spec as any).originalPriceMinor ?? null,
            priceMinor: spec.priceMinor,
            currency: spec.currency,
            billingInterval: spec.billingInterval,
            durationDays: spec.durationDays,
            gstRateBps: spec.gstRateBps,
            features: [...spec.features],
            featureGroups: buildSystemFeatureGroups(spec.limits, spec.durationDays),
            limits: { ...spec.limits },
            isActive: spec.isActive,
            displayOrder: spec.displayOrder,
          }),
        );
        await this.syncPlanFeatures(created.id, created.limits, null);
      }
      this.logger.lifecycle(`Seeded ${INITIAL_SUBSCRIPTION_PLANS.length} subscription plans`);
      return;
    }

    const plans = await this.planRepo.find();
    for (const plan of plans) {
      const featureCount = await this.planFeatureRepo.count({ where: { planId: plan.id } });
      if (featureCount === 0 && plan.limits) {
        await this.syncPlanFeatures(plan.id, plan.limits, null);
      }
    }
  }

  toPlanView(
    plan: SubscriptionPlanEntity,
    counts?: { active?: number; total?: number },
  ): PlanResponseView {
    const priceMinor = Number(plan.priceMinor || 0);
    const originalPriceMinor =
      plan.originalPriceMinor !== null && plan.originalPriceMinor !== undefined
        ? Number(plan.originalPriceMinor)
        : null;
    const gstRateBps = Number(plan.gstRateBps ?? 1800);
    const taxMinor = Math.round((priceMinor * gstRateBps) / 10000);
    const totalPriceMinor = priceMinor + taxMinor;
    const derivedGroups =
      Array.isArray(plan.featureGroups) && plan.featureGroups.length > 0
        ? plan.featureGroups
        : buildSystemFeatureGroups(plan.limits, plan.durationDays);

    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description ?? null,
      label: plan.label ?? null,
      isPopular: Boolean(plan.isPopular),
      originalPrice:
        originalPriceMinor !== null ? Number((originalPriceMinor / 100).toFixed(2)) : null,
      originalPriceMinor,
      price: Number((priceMinor / 100).toFixed(2)),
      priceMinor,
      currency: plan.currency || 'INR',
      billingInterval: plan.billingInterval,
      durationDays: Number(plan.durationDays),
      gstRateBps,
      taxMinor,
      totalPriceMinor,
      totalPrice: Number((totalPriceMinor / 100).toFixed(2)),
      features: Array.isArray(plan.features) ? plan.features : [],
      featureGroups: derivedGroups,
      limits: plan.limits,
      isActive: Boolean(plan.isActive),
      displayOrder: Number(plan.displayOrder ?? 0),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      ...(counts
        ? {
            activeSubscribersCount: counts.active ?? 0,
            totalSubscriptionsCount: counts.total ?? 0,
          }
        : {}),
    };
  }

  async findActivePlans(): Promise<PlanResponseView[]> {
    const plans = await this.planRepo.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC', priceMinor: 'ASC' },
    });
    return plans.map((p) => this.toPlanView(p));
  }

  async findById(id: string): Promise<PlanResponseView> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Subscription plan "${id}" not found.`);
    }
    return this.toPlanView(plan);
  }

  async findAllAdmin(): Promise<PlanResponseView[]> {
    const plans = await this.planRepo.find({
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });

    const statsRows = await this.subscriptionRepo
      .createQueryBuilder('s')
      .select('s.plan_id', 'planId')
      .addSelect(`COUNT(*) FILTER (WHERE s.status = 'ACTIVE')::int`, 'activeCount')
      .addSelect('COUNT(*)::int', 'totalCount')
      .groupBy('s.plan_id')
      .getRawMany();

    const statsByPlan = new Map<string, { active: number; total: number }>();
    for (const row of statsRows) {
      statsByPlan.set(String(row.planId), {
        active: Number(row.activeCount || 0),
        total: Number(row.totalCount || 0),
      });
    }

    return plans.map((plan) =>
      this.toPlanView(plan, statsByPlan.get(plan.id) || { active: 0, total: 0 }),
    );
  }

  async getPlanSubscribers(planId: string, page = 1, limit = 20) {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException(`Subscription plan "${planId}" not found.`);
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await this.subscriptionRepo.findAndCount({
      where: { planId },
      relations: ['business', 'user'],
      order: { createdAt: 'DESC' },
      skip,
      take: safeLimit,
    });

    return {
      plan: this.toPlanView(plan),
      data: items.map((s) => ({
        id: s.id,
        status: s.status,
        businessId: s.businessId,
        businessName: s.business?.name || null,
        businessCity: s.business?.city || null,
        businessState: s.business?.state || null,
        userId: s.userId,
        userEmail: s.user?.email || null,
        amountMinor: Number(s.amountMinor),
        currency: s.currency,
        startsAt: s.startsAt,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      })),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  private resolvePriceMinor(price?: number, priceMinor?: number): number {
    if (priceMinor !== undefined && priceMinor !== null) {
      const val = Math.trunc(Number(priceMinor));
      if (!Number.isFinite(val) || val < 0) {
        throw new BadRequestException('Plan priceMinor must be a non-negative integer.');
      }
      return val;
    }
    if (price !== undefined && price !== null) {
      const val = Math.round(Number(price) * 100);
      if (!Number.isFinite(val) || val < 0) {
        throw new BadRequestException('Plan price must be a non-negative number.');
      }
      return val;
    }
    throw new BadRequestException('Either priceMinor (paise) or price (INR) must be provided.');
  }

  async createPlan(dto: CreateSubscriptionPlanDto, actorId?: string): Promise<PlanResponseView> {
    const normalizedCode = dto.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const existing = await this.planRepo.findOne({ where: { code: normalizedCode } });
    if (existing) {
      throw new ConflictException(`Subscription plan with code "${normalizedCode}" already exists.`);
    }

    const priceMinor = this.resolvePriceMinor(dto.price, dto.priceMinor);
    const originalPriceMinor =
      dto.originalPrice !== undefined || dto.originalPriceMinor !== undefined
        ? this.resolvePriceMinor(dto.originalPrice, dto.originalPriceMinor)
        : null;
    if (dto.durationDays <= 0) {
      throw new BadRequestException('Subscription durationDays must be greater than zero.');
    }

    const rawFeatures = Array.isArray(dto.features)
      ? dto.features.map((f) => f.trim()).filter(Boolean)
      : [];
    const resolvedFeatures =
      rawFeatures.length > 0
        ? rawFeatures
        : buildSystemPlanFeatures(dto.limits, dto.durationDays);

    const resolvedGroups =
      Array.isArray(dto.featureGroups) && dto.featureGroups.length > 0
        ? dto.featureGroups.map((g) => ({
            key: g.key.trim(),
            title: g.title.trim(),
            included: Boolean(g.included),
            items: (g.items || []).map((i) => i.trim()).filter(Boolean),
          }))
        : buildSystemFeatureGroups(dto.limits, dto.durationDays);

    const saved = await runInTransaction(
      this.dataSource,
      async (qr) => {
        const plan = qr.manager.create(SubscriptionPlanEntity, {
          code: normalizedCode,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          label: dto.label?.trim() || null,
          isPopular: Boolean(dto.isPopular),
          originalPriceMinor,
          priceMinor,
          currency: (dto.currency || 'INR').toUpperCase(),
          billingInterval: dto.billingInterval || BillingInterval.MONTHLY,
          durationDays: dto.durationDays,
          gstRateBps: dto.gstRateBps ?? 1800,
          features: resolvedFeatures,
          featureGroups: resolvedGroups,
          limits: dto.limits,
          isActive: dto.isActive ?? true,
          displayOrder: dto.displayOrder ?? 0,
          createdBy: actorId || null,
          updatedBy: actorId || null,
        });
        const persisted = await qr.manager.save(SubscriptionPlanEntity, plan);
        await this.syncPlanFeatures(persisted.id, persisted.limits, actorId || null, qr.manager);
        return persisted;
      },
      'CreateSubscriptionPlan',
    );

    await this.auditService.log({
      userId: actorId,
      action: 'CREATE_SUBSCRIPTION_PLAN',
      module: 'SUBSCRIPTION_MANAGEMENT',
      entityType: 'SubscriptionPlanEntity',
      entityId: saved.id,
      newData: { code: saved.code, name: saved.name, priceMinor: saved.priceMinor },
    });

    this.logger.info('Created subscription plan', {
      planId: saved.id,
      code: saved.code,
      priceMinor: saved.priceMinor,
      actorId,
    });

    return this.toPlanView(saved);
  }

  async updatePlan(
    id: string,
    dto: UpdateSubscriptionPlanDto,
    actorId?: string,
  ): Promise<PlanResponseView> {
    const existing = await this.planRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Subscription plan "${id}" not found.`);
    }

    const oldSnapshot = {
      name: existing.name,
      priceMinor: existing.priceMinor,
      isActive: existing.isActive,
      durationDays: existing.durationDays,
      limits: existing.limits,
    };

    if (dto.price !== undefined || dto.priceMinor !== undefined) {
      existing.priceMinor = this.resolvePriceMinor(dto.price, dto.priceMinor);
    }
    if (dto.originalPrice !== undefined || dto.originalPriceMinor !== undefined) {
      existing.originalPriceMinor =
        dto.originalPrice === null && dto.originalPriceMinor === null
          ? null
          : this.resolvePriceMinor(dto.originalPrice, dto.originalPriceMinor);
    }
    if (dto.name !== undefined) existing.name = dto.name.trim();
    if (dto.description !== undefined) existing.description = dto.description?.trim() || null;
    if (dto.label !== undefined) existing.label = dto.label?.trim() || null;
    if (dto.isPopular !== undefined) existing.isPopular = dto.isPopular;
    if (dto.billingInterval !== undefined) existing.billingInterval = dto.billingInterval;
    if (dto.durationDays !== undefined) {
      if (dto.durationDays <= 0) {
        throw new BadRequestException('durationDays must be greater than zero.');
      }
      existing.durationDays = dto.durationDays;
    }
    if (dto.gstRateBps !== undefined) existing.gstRateBps = dto.gstRateBps;
    if (dto.features !== undefined) {
      existing.features = dto.features.map((f) => f.trim()).filter(Boolean);
    }
    if (dto.featureGroups !== undefined) {
      existing.featureGroups = dto.featureGroups.map((g) => ({
        key: g.key.trim(),
        title: g.title.trim(),
        included: Boolean(g.included),
        items: (g.items || []).map((i) => i.trim()).filter(Boolean),
      }));
    } else if (dto.limits !== undefined && (!Array.isArray(existing.featureGroups) || existing.featureGroups.length === 0)) {
      existing.featureGroups = buildSystemFeatureGroups(dto.limits, existing.durationDays);
    }
    if (dto.limits !== undefined) {
      existing.limits = dto.limits;
      if (dto.featureGroups === undefined) {
        existing.featureGroups = buildSystemFeatureGroups(dto.limits, existing.durationDays);
      }
    }
    if (dto.isActive !== undefined) existing.isActive = dto.isActive;
    if (dto.displayOrder !== undefined) existing.displayOrder = dto.displayOrder;
    existing.updatedBy = actorId || existing.updatedBy || null;

    // Never retroactively alters existing subscriptions.plan_snapshot or subscriptions.amount_minor!
    const saved = await runInTransaction(
      this.dataSource,
      async (qr) => {
        const persisted = await qr.manager.save(SubscriptionPlanEntity, existing);
        if (dto.limits !== undefined) {
          await this.syncPlanFeatures(persisted.id, persisted.limits, actorId || null, qr.manager);
        }
        return persisted;
      },
      'UpdateSubscriptionPlan',
    );

    await this.auditService.log({
      userId: actorId,
      action: 'UPDATE_SUBSCRIPTION_PLAN',
      module: 'SUBSCRIPTION_MANAGEMENT',
      entityType: 'SubscriptionPlanEntity',
      entityId: saved.id,
      oldData: oldSnapshot,
      newData: {
        name: saved.name,
        priceMinor: saved.priceMinor,
        isActive: saved.isActive,
        durationDays: saved.durationDays,
        limits: saved.limits,
      },
    });

    this.logger.info('Updated subscription plan (existing subscriber snapshots preserved)', {
      planId: saved.id,
      code: saved.code,
      priceMinor: saved.priceMinor,
      isActive: saved.isActive,
      actorId,
    });

    return this.toPlanView(saved);
  }

  getSystemPlanTemplates() {
    return SYSTEM_PLAN_TEMPLATES.map((tpl) => {
      const taxMinor = Math.round((Number(tpl.priceMinor) * Number(tpl.gstRateBps)) / 10000);
      const totalPriceMinor = Number(tpl.priceMinor) + taxMinor;
      return {
        code: tpl.code,
        name: tpl.name,
        description: tpl.description,
        label: tpl.label,
        isPopular: Boolean(tpl.isPopular),
        originalPrice: Number((Number(tpl.originalPriceMinor) / 100).toFixed(2)),
        originalPriceMinor: Number(tpl.originalPriceMinor),
        price: Number((Number(tpl.priceMinor) / 100).toFixed(2)),
        priceMinor: Number(tpl.priceMinor),
        currency: tpl.currency,
        billingInterval: tpl.billingInterval,
        durationDays: Number(tpl.durationDays),
        gstRateBps: Number(tpl.gstRateBps),
        taxMinor,
        totalPriceMinor,
        totalPrice: Number((totalPriceMinor / 100).toFixed(2)),
        features: buildSystemPlanFeatures(tpl.limits, tpl.durationDays),
        featureGroups: buildSystemFeatureGroups(tpl.limits, tpl.durationDays),
        limits: { ...tpl.limits },
        displayOrder: Number(tpl.displayOrder),
      };
    });
  }

  async generateSystemPlans(dto: GenerateSystemPlansDto = {}, actorId?: string) {
    const requestedCodes =
      Array.isArray(dto.codes) && dto.codes.length > 0
        ? new Set(dto.codes.map((c) => c.trim().toUpperCase()).filter(Boolean))
        : null;

    const selectedTemplates = requestedCodes
      ? SYSTEM_PLAN_TEMPLATES.filter((t) => requestedCodes.has(t.code))
      : [...SYSTEM_PLAN_TEMPLATES];

    if (selectedTemplates.length === 0) {
      throw new BadRequestException('No matching Mercora system plan presets were selected.');
    }

    const syncGroups = dto.syncFeatureGroups !== false;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const tpl of selectedTemplates) {
      const existing = await this.planRepo.findOne({ where: { code: tpl.code } });
      if (!existing) {
        await runInTransaction(
          this.dataSource,
          async (qr) => {
            const plan = qr.manager.create(SubscriptionPlanEntity, {
              code: tpl.code,
              name: tpl.name,
              description: tpl.description,
              label: tpl.label,
              isPopular: Boolean(tpl.isPopular),
              originalPriceMinor: tpl.originalPriceMinor,
              priceMinor: tpl.priceMinor,
              currency: tpl.currency,
              billingInterval: tpl.billingInterval,
              durationDays: tpl.durationDays,
              gstRateBps: tpl.gstRateBps,
              features: buildSystemPlanFeatures(tpl.limits, tpl.durationDays),
              featureGroups: buildSystemFeatureGroups(tpl.limits, tpl.durationDays),
              limits: { ...tpl.limits },
              isActive: true,
              displayOrder: tpl.displayOrder,
              createdBy: actorId || null,
              updatedBy: actorId || null,
            });
            const persisted = await qr.manager.save(SubscriptionPlanEntity, plan);
            await this.syncPlanFeatures(persisted.id, persisted.limits, actorId || null, qr.manager);
          },
          'GenerateSystemPlanCreate',
        );
        createdCount++;
      } else if (syncGroups) {
        await runInTransaction(
          this.dataSource,
          async (qr) => {
            const effectiveLimits = existing.limits || { ...tpl.limits };
            existing.featureGroups = buildSystemFeatureGroups(
              effectiveLimits,
              existing.durationDays || tpl.durationDays,
            );
            if (!Array.isArray(existing.features) || existing.features.length === 0) {
              existing.features = buildSystemPlanFeatures(
                effectiveLimits,
                existing.durationDays || tpl.durationDays,
              );
            }
            existing.updatedBy = actorId || existing.updatedBy || null;
            const persisted = await qr.manager.save(SubscriptionPlanEntity, existing);
            await this.syncPlanFeatures(persisted.id, persisted.limits, actorId || null, qr.manager);
          },
          'GenerateSystemPlanSync',
        );
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    await this.auditService.log({
      userId: actorId,
      action: 'GENERATE_SUBSCRIPTION_SYSTEM_PLANS',
      module: 'SUBSCRIPTION_MANAGEMENT',
      entityType: 'SubscriptionPlanEntity',
      newData: {
        codes: selectedTemplates.map((t) => t.code),
        createdCount,
        updatedCount,
        skippedCount,
      },
    });

    this.logger.info('Mercora system subscription plans generated/synced', {
      createdCount,
      updatedCount,
      skippedCount,
      actorId,
    });

    const plans = await this.findAllAdmin();
    return {
      createdCount,
      updatedCount,
      skippedCount,
      plans,
    };
  }

  private async syncPlanFeatures(
    planId: string,
    limits: PlanLimits,
    actorId: string | null,
    manager = this.planFeatureRepo.manager,
  ): Promise<void> {
    if (!limits) return;
    const entries: Array<{
      featureKey: string;
      featureName: string;
      isEnabled: boolean;
      quotaLimit: number | null;
      quotaPeriod: string | null;
    }> = [
      {
        featureKey: SUBSCRIPTION_FEATURE_KEYS.BUSINESS_LISTINGS,
        featureName: 'Business Directory Listings',
        isEnabled: limits.maxBusinessListings !== 0,
        quotaLimit: limits.maxBusinessListings,
        quotaPeriod: 'LIFETIME',
      },
      {
        featureKey: SUBSCRIPTION_FEATURE_KEYS.PRODUCT_LISTINGS,
        featureName: 'Product Catalog Listings',
        isEnabled: limits.maxProducts !== 0,
        quotaLimit: limits.maxProducts,
        quotaPeriod: 'LIFETIME',
      },
      {
        featureKey: SUBSCRIPTION_FEATURE_KEYS.ENQUIRIES_PER_MONTH,
        featureName: 'Monthly Buyer Enquiries',
        isEnabled: limits.maxEnquiriesPerMonth !== 0,
        quotaLimit: limits.maxEnquiriesPerMonth,
        quotaPeriod: '30_DAYS',
      },
      {
        featureKey: SUBSCRIPTION_FEATURE_KEYS.CONTACT_NUMBERS,
        featureName: 'Department Contact Numbers',
        isEnabled: limits.maxContacts !== 0,
        quotaLimit: limits.maxContacts,
        quotaPeriod: 'LIFETIME',
      },
      {
        featureKey: SUBSCRIPTION_FEATURE_KEYS.FEATURED_LISTING,
        featureName: 'Featured Directory Placement',
        isEnabled: Boolean(limits.featuredListing),
        quotaLimit: null,
        quotaPeriod: null,
      },
      {
        featureKey: SUBSCRIPTION_FEATURE_KEYS.VERIFIED_PRIORITY,
        featureName: 'Priority Verification Benefits',
        isEnabled: Boolean(limits.verifiedPriority),
        quotaLimit: null,
        quotaPeriod: null,
      },
      {
        featureKey: SUBSCRIPTION_FEATURE_KEYS.LEAD_INBOX_ACCESS,
        featureName: 'Lead & Enquiry Inbox Access',
        isEnabled: Boolean(limits.leadInboxAccess),
        quotaLimit: null,
        quotaPeriod: null,
      },
      {
        featureKey: SUBSCRIPTION_FEATURE_KEYS.ANALYTICS_ACCESS,
        featureName: 'Business Performance Analytics',
        isEnabled: Boolean(limits.analyticsAccess),
        quotaLimit: null,
        quotaPeriod: null,
      },
      {
        featureKey: SUBSCRIPTION_FEATURE_KEYS.PRIORITY_SUPPORT,
        featureName: 'Dedicated Priority Support',
        isEnabled: Boolean(limits.prioritySupport),
        quotaLimit: null,
        quotaPeriod: null,
      },
    ];

    for (const item of entries) {
      const existing = await manager.findOne(PlanFeatureEntity, {
        where: { planId, featureKey: item.featureKey },
      });
      if (existing) {
        existing.featureName = item.featureName;
        existing.isEnabled = item.isEnabled;
        existing.quotaLimit = item.quotaLimit;
        existing.quotaPeriod = item.quotaPeriod;
        existing.updatedBy = actorId;
        await manager.save(PlanFeatureEntity, existing);
      } else {
        await manager.save(
          PlanFeatureEntity,
          manager.create(PlanFeatureEntity, {
            planId,
            ...item,
            createdBy: actorId,
            updatedBy: actorId,
          }),
        );
      }
    }
  }
}
