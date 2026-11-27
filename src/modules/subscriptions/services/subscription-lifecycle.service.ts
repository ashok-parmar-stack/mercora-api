import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import { RequestContext } from '../../../common/context/request-context';
import { runInTransaction } from '../../../common/utils/transaction-runner.util';
import { EmailDispatcherService } from '../../email/services/email-dispatcher.service';
import { BusinessOrmEntity } from '../../businesses/infrastructure/persistence/entities/business-orm.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import { SubscriptionPlanEntity } from '../entities/subscription-plan.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { PaymentEntity } from '../entities/payment.entity';
import { PaymentAttemptEntity } from '../entities/payment-attempt.entity';
import { InvoiceEntity } from '../entities/invoice.entity';
import { SubscriptionChangeEntity } from '../entities/subscription-change.entity';
import { SubscriptionAuditLogEntity } from '../entities/subscription-audit-log.entity';
import { PaymentSettingsEntity } from '../entities/payment-settings.entity';
import { PaymentGatewayRegistry } from '../gateways/payment-gateway.registry';
import { GatewayPaymentDetails } from '../gateways/payment-gateway.interface';
import { InvoiceService, formatInrMinor } from './invoice.service';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';
import {
  AdminSubscriptionQueryDto,
  AdminUpdateSubscriptionDto,
  CancelSubscriptionDto,
  CheckoutSubscriptionDto,
  DowngradeSubscriptionDto,
  RenewSubscriptionDto,
  UpgradeSubscriptionDto,
} from '../dto/subscription.dto';
import { UpdatePaymentSettingsDto } from '../dto/payment.dto';
import {
  DEFAULT_FREE_PLAN_LIMITS,
  PaymentGateway,
  PaymentStatus,
  PaymentType,
  PlanSnapshot,
  SUBSCRIPTION_EMAIL_TEMPLATES,
  SubscriptionAuditActorType,
  SubscriptionChangeEffectiveWhen,
  SubscriptionChangeStatus,
  SubscriptionChangeType,
  SubscriptionStatus,
} from '../subscription.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionLifecycleService {
  private readonly logger = new MercoraLogger(SubscriptionLifecycleService.name);

  constructor(
    @InjectRepository(SubscriptionPlanEntity)
    private readonly planRepo: Repository<SubscriptionPlanEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(PaymentAttemptEntity)
    private readonly attemptRepo: Repository<PaymentAttemptEntity>,
    @InjectRepository(SubscriptionChangeEntity)
    private readonly changeRepo: Repository<SubscriptionChangeEntity>,
    @InjectRepository(SubscriptionAuditLogEntity)
    private readonly subAuditRepo: Repository<SubscriptionAuditLogEntity>,
    @InjectRepository(PaymentSettingsEntity)
    private readonly settingsRepo: Repository<PaymentSettingsEntity>,
    @InjectRepository(BusinessOrmEntity)
    private readonly businessRepo: Repository<BusinessOrmEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly gatewayRegistry: PaymentGatewayRegistry,
    private readonly invoiceService: InvoiceService,
    private readonly entitlementService: SubscriptionEntitlementService,
    private readonly emailDispatcher: EmailDispatcherService,
    private readonly auditService: AuditService,
  ) {}

  async getPaymentSettings(): Promise<PaymentSettingsEntity> {
    let settings = await this.settingsRepo.findOne({ where: { id: 'DEFAULT' } });
    if (!settings) {
      settings = this.settingsRepo.create({
        id: 'DEFAULT',
        activeGateway: PaymentGateway.RAZORPAY,
        razorpayEnabled: true,
        defaultCurrency: 'INR',
        defaultGstRateBps: 1800,
        gracePeriodDays: 3,
        expiringReminderDays: 7,
        upgradePolicy: 'IMMEDIATE',
        downgradePolicy: 'END_OF_PERIOD',
        refundRevokesAccess: true,
        schedulerEnabled: true,
        schedulerIntervalMs: 300000,
        reconcilePendingMinutes: 2,
        invoicePrefix: 'MERC',
        companyLegalName: 'Mercora Technologies Pvt Ltd',
        companyGstin: '',
        companyState: 'Gujarat',
        companyAddress: 'Ahmedabad, Gujarat, India',
        sacCode: '998314',
      });
      try {
        settings = await this.settingsRepo.save(settings);
      } catch {
        const retry = await this.settingsRepo.findOne({ where: { id: 'DEFAULT' } });
        if (retry) return retry;
      }
    }
    return settings;
  }

  async getAdminPaymentSettingsView() {
    const settings = await this.getPaymentSettings();
    const gateways = this.gatewayRegistry.listPublicConfigs();
    const razorpay = gateways.find((g) => g.gateway === PaymentGateway.RAZORPAY);
    return {
      settings,
      gateways: gateways.map((g) => ({
        gateway: g.gateway,
        enabled: g.enabled,
        configured: g.configured,
        mode: g.mode,
        maskedKeyId: g.keyId
          ? `${g.keyId.slice(0, 12)}...${g.keyId.slice(-4)}`
          : null,
      })),
      razorpayMode: razorpay?.mode || 'unconfigured',
    };
  }

  async updatePaymentSettings(dto: UpdatePaymentSettingsDto, adminId: string) {
    const current = await this.getPaymentSettings();
    const oldData = { ...current };

    if (dto.razorpayEnabled !== undefined) current.razorpayEnabled = dto.razorpayEnabled;
    if (dto.defaultGstRateBps !== undefined) current.defaultGstRateBps = dto.defaultGstRateBps;
    if (dto.gracePeriodDays !== undefined) current.gracePeriodDays = dto.gracePeriodDays;
    if (dto.expiringReminderDays !== undefined) current.expiringReminderDays = dto.expiringReminderDays;
    if (dto.upgradePolicy !== undefined) current.upgradePolicy = dto.upgradePolicy;
    if (dto.downgradePolicy !== undefined) current.downgradePolicy = dto.downgradePolicy;
    if (dto.refundRevokesAccess !== undefined) current.refundRevokesAccess = dto.refundRevokesAccess;
    if (dto.schedulerEnabled !== undefined) current.schedulerEnabled = dto.schedulerEnabled;
    if (dto.schedulerIntervalMs !== undefined) current.schedulerIntervalMs = dto.schedulerIntervalMs;
    if (dto.reconcilePendingMinutes !== undefined) current.reconcilePendingMinutes = dto.reconcilePendingMinutes;
    if (dto.invoicePrefix !== undefined) current.invoicePrefix = dto.invoicePrefix.trim();
    if (dto.companyLegalName !== undefined) current.companyLegalName = dto.companyLegalName.trim();
    if (dto.companyGstin !== undefined) current.companyGstin = dto.companyGstin.trim().toUpperCase();
    if (dto.companyState !== undefined) current.companyState = dto.companyState.trim();
    if (dto.companyAddress !== undefined) current.companyAddress = dto.companyAddress.trim();
    if (dto.sacCode !== undefined) current.sacCode = dto.sacCode.trim();
    current.updatedBy = adminId;

    const saved = await this.settingsRepo.save(current);

    await this.auditService.log({
      userId: adminId,
      action: 'UPDATE_PAYMENT_SETTINGS',
      module: 'PAYMENT_MANAGEMENT',
      entityType: 'PaymentSettingsEntity',
      entityId: saved.id,
      oldData: oldData as any,
      newData: saved as any,
    });

    this.logger.info('Updated payment settings', { adminId });
    return this.getAdminPaymentSettingsView();
  }

  buildPlanSnapshot(plan: SubscriptionPlanEntity): PlanSnapshot {
    return {
      planId: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description ?? null,
      label: plan.label ?? null,
      priceMinor: Number(plan.priceMinor),
      originalPriceMinor:
        plan.originalPriceMinor !== null && plan.originalPriceMinor !== undefined
          ? Number(plan.originalPriceMinor)
          : null,
      currency: plan.currency || 'INR',
      billingInterval: plan.billingInterval,
      durationDays: Number(plan.durationDays),
      gstRateBps: Number(plan.gstRateBps ?? 1800),
      features: Array.isArray(plan.features) ? [...plan.features] : [],
      featureGroups: Array.isArray(plan.featureGroups) ? [...plan.featureGroups] : [],
      limits: { ...DEFAULT_FREE_PLAN_LIMITS, ...(plan.limits || {}) },
      capturedAt: new Date().toISOString(),
    };
  }

  computeRemainingValidity(sub: SubscriptionEntity | null) {
    if (!sub || !sub.expiresAt) {
      return {
        remainingDays: 0,
        remainingHours: 0,
        isExpired: true,
        isExpiringSoon: false,
      };
    }
    const now = Date.now();
    const exp = new Date(sub.expiresAt).getTime();
    const diffMs = Math.max(0, exp - now);
    const remainingDays = Math.floor(diffMs / DAY_MS);
    const remainingHours = Math.floor((diffMs % DAY_MS) / (60 * 60 * 1000));
    return {
      remainingDays,
      remainingHours,
      isExpired: diffMs === 0,
      isExpiringSoon: diffMs > 0 && remainingDays <= 7,
    };
  }

  async getCurrentSubscriptionOverview(
    user: { id: string; email?: string | null; role?: string | null },
    requestedBusinessId?: string,
  ) {
    const ownedBusinesses = await this.entitlementService.findOwnedBusinesses(
      user.id,
      user.email,
    );

    if (ownedBusinesses.length === 0) {
      const latestAccountSub = await this.subscriptionRepo.findOne({
        where: {
          userId: user.id,
          businessId: IsNull(),
        },
        order: { createdAt: 'DESC' },
      });
      const activeAccountSub = await this.subscriptionRepo.findOne({
        where: {
          userId: user.id,
          businessId: IsNull(),
          status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]),
        },
        order: { createdAt: 'DESC' },
      });
      const currentAcc = activeAccountSub || latestAccountSub || null;
      const entitlements = await this.entitlementService.getAccountEntitlements(
        user.id,
        currentAcc?.billingDetails?.billingName || undefined,
      );
      const validity = this.computeRemainingValidity(currentAcc);
      const isAccActive = currentAcc?.status === SubscriptionStatus.ACTIVE;
      const isAccPastDue = currentAcc?.status === SubscriptionStatus.PAST_DUE;

      return {
        hasBusiness: false,
        businesses: [],
        selectedBusiness: null,
        subscription: currentAcc
          ? {
              id: currentAcc.id,
              businessId: null,
              billingDetails: currentAcc.billingDetails || null,
              planId: currentAcc.planId,
              planSnapshot: currentAcc.planSnapshot,
              status: currentAcc.status,
              subtotalMinor: Number(currentAcc.subtotalMinor),
              taxMinor: Number(currentAcc.taxMinor),
              amountMinor: Number(currentAcc.amountMinor),
              currency: currentAcc.currency,
              startsAt: currentAcc.startsAt,
              expiresAt: currentAcc.expiresAt,
              graceUntil: currentAcc.graceUntil,
              cancelAtPeriodEnd: currentAcc.cancelAtPeriodEnd,
              cancelledAt: currentAcc.cancelledAt,
              cancellationReason: currentAcc.cancellationReason,
              scheduledPlanId: currentAcc.scheduledPlanId,
              scheduledPlanSnapshot: currentAcc.scheduledPlanSnapshot,
              scheduledChangeAt: currentAcc.scheduledChangeAt,
              ...validity,
              createdAt: currentAcc.createdAt,
            }
          : null,
        entitlements,
        actions: {
          canPurchase: !isAccActive && !isAccPastDue,
          canRenew: Boolean(currentAcc && currentAcc.status !== SubscriptionStatus.PENDING),
          canUpgrade: Boolean(isAccActive),
          canDowngrade: Boolean(isAccActive),
          canCancel: Boolean(isAccActive && !currentAcc?.cancelAtPeriodEnd),
        },
      };
    }

    const { business } = await this.entitlementService.resolveOwnedBusiness(
      user,
      requestedBusinessId,
      false,
    );

    const latestSub = await this.subscriptionRepo.findOne({
      where: {
        businessId: business.id,
        status: In([
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.PAST_DUE,
          SubscriptionStatus.PENDING,
          SubscriptionStatus.EXPIRED,
          SubscriptionStatus.CANCELLED,
        ]),
      },
      order: { createdAt: 'DESC' },
    });

    // Prefer ACTIVE / PAST_DUE over a newer PENDING checkout when showing current subscription
    const activeOrGrace = await this.subscriptionRepo.findOne({
      where: {
        businessId: business.id,
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]),
      },
      order: { createdAt: 'DESC' },
    });

    const current = activeOrGrace || latestSub || null;
    const entitlements = await this.entitlementService.getBusinessEntitlements(business.id);
    const validity = this.computeRemainingValidity(current);
    const isActive = current?.status === SubscriptionStatus.ACTIVE;
    const isPastDue = current?.status === SubscriptionStatus.PAST_DUE;

    return {
      hasBusiness: true,
      businesses: ownedBusinesses.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        city: b.city,
        state: b.state,
        gstin: b.gstin || null,
        verificationStatus: b.verification_status,
      })),
      selectedBusiness: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        city: business.city,
        state: business.state,
        gstin: business.gstin,
        verificationStatus: business.verification_status,
      },
      subscription: current
        ? {
            id: current.id,
            businessId: current.businessId,
            planId: current.planId,
            planSnapshot: current.planSnapshot,
            status: current.status,
            subtotalMinor: Number(current.subtotalMinor),
            taxMinor: Number(current.taxMinor),
            amountMinor: Number(current.amountMinor),
            currency: current.currency,
            startsAt: current.startsAt,
            expiresAt: current.expiresAt,
            graceUntil: current.graceUntil,
            cancelAtPeriodEnd: current.cancelAtPeriodEnd,
            cancelledAt: current.cancelledAt,
            cancellationReason: current.cancellationReason,
            scheduledPlanId: current.scheduledPlanId,
            scheduledPlanSnapshot: current.scheduledPlanSnapshot,
            scheduledChangeAt: current.scheduledChangeAt,
            ...validity,
            createdAt: current.createdAt,
          }
        : null,
      entitlements,
      actions: {
        canPurchase: !isActive && !isPastDue,
        canRenew: Boolean(current && current.status !== SubscriptionStatus.PENDING),
        canUpgrade: Boolean(isActive),
        canDowngrade: Boolean(isActive),
        canCancel: Boolean(isActive && !current?.cancelAtPeriodEnd),
      },
    };
  }

  async getSubscriptionHistory(
    user: { id: string; email?: string | null; role?: string | null },
    businessId?: string,
    page = 1,
    limit = 20,
  ) {
    const owned = await this.entitlementService.findOwnedBusinesses(user.id, user.email);
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    if (businessId) {
      await this.entitlementService.resolveOwnedBusiness(user, businessId, false);
    }

    const qb = this.subscriptionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.business', 'business')
      .orderBy('s.createdAt', 'DESC')
      .skip(skip)
      .take(safeLimit);

    if (businessId) {
      qb.where('s.businessId = :businessId', { businessId });
    } else if (owned.length > 0) {
      qb.where('(s.userId = :userId OR s.businessId IN (:...bizIds))', {
        userId: user.id,
        bizIds: owned.map((b) => b.id),
      });
    } else {
      qb.where('s.userId = :userId', { userId: user.id });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items.map((s) => ({
        id: s.id,
        businessId: s.businessId || null,
        businessName:
          s.business?.name ||
          s.billingDetails?.billingName ||
          s.user?.name ||
          null,
        planId: s.planId,
        planSnapshot: s.planSnapshot,
        status: s.status,
        subtotalMinor: Number(s.subtotalMinor),
        taxMinor: Number(s.taxMinor),
        amountMinor: Number(s.amountMinor),
        currency: s.currency,
        startsAt: s.startsAt,
        expiresAt: s.expiresAt,
        cancelledAt: s.cancelledAt,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        scheduledPlanSnapshot: s.scheduledPlanSnapshot,
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

  async initiateCheckout(
    user: { id: string; email: string; name?: string; role?: string },
    dto: CheckoutSubscriptionDto,
    idempotencyHeader?: string,
  ) {
    return this.createOrderFlow({
      user,
      planId: dto.planId,
      businessId: dto.businessId,
      billingDetails: dto.billingDetails,
      gateway: dto.gateway || PaymentGateway.RAZORPAY,
      paymentType: PaymentType.PURCHASE,
      idempotencyKey: dto.idempotencyKey || idempotencyHeader,
    });
  }

  async renewSubscription(
    user: { id: string; email: string; name?: string; role?: string },
    dto: RenewSubscriptionDto,
    idempotencyHeader?: string,
  ) {
    const { business } = await this.entitlementService.resolveBillingTarget(
      user,
      dto.businessId,
      false,
    );

    const latest = await this.subscriptionRepo.findOne({
      where: {
        ...(business ? { businessId: business.id } : { userId: user.id, businessId: IsNull() }),
        status: In([
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.PAST_DUE,
          SubscriptionStatus.EXPIRED,
          SubscriptionStatus.CANCELLED,
        ]),
      },
      order: { createdAt: 'DESC' },
    });

    const targetPlanId =
      dto.planId || latest?.scheduledPlanId || latest?.planId;
    if (!targetPlanId) {
      throw new BadRequestException(
        'No previous subscription found to renew. Please choose a plan to purchase.',
      );
    }

    return this.createOrderFlow({
      user,
      planId: targetPlanId,
      businessId: business?.id,
      billingDetails: dto.billingDetails,
      gateway: PaymentGateway.RAZORPAY,
      paymentType: PaymentType.RENEWAL,
      previousSubscription: latest || undefined,
      idempotencyKey: dto.idempotencyKey || idempotencyHeader,
    });
  }

  async upgradeSubscription(
    user: { id: string; email: string; name?: string; role?: string },
    dto: UpgradeSubscriptionDto,
    idempotencyHeader?: string,
  ) {
    const { business } = await this.entitlementService.resolveBillingTarget(
      user,
      dto.businessId,
      false,
    );

    const active = await this.subscriptionRepo.findOne({
      where: {
        ...(business ? { businessId: business.id } : { userId: user.id, businessId: IsNull() }),
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]),
      },
      order: { createdAt: 'DESC' },
    });

    if (!active) {
      throw new BadRequestException(
        'No active subscription found to upgrade. Please purchase a subscription first.',
      );
    }

    if (active.planId === dto.targetPlanId) {
      throw new BadRequestException('You are already subscribed to this plan.');
    }

    const targetPlan = await this.planRepo.findOne({ where: { id: dto.targetPlanId } });
    if (!targetPlan) {
      throw new NotFoundException(`Target plan "${dto.targetPlanId}" not found.`);
    }
    if (!targetPlan.isActive) {
      throw new BadRequestException('Selected target plan is inactive and cannot be purchased.');
    }

    const currentBasePriceMinor = Number(active.planSnapshot?.priceMinor ?? active.subtotalMinor ?? 0);
    if (Number(targetPlan.priceMinor) <= currentBasePriceMinor) {
      throw new BadRequestException(
        'Target plan is not a higher tier than your current plan. Use downgrade for lower-tier plans.',
      );
    }

    // Backend proration calculation (unused days credit from current active period)
    let prorationCreditMinor = 0;
    if (active.startsAt && active.expiresAt) {
      const nowMs = Date.now();
      const startMs = new Date(active.startsAt).getTime();
      const endMs = new Date(active.expiresAt).getTime();
      const totalMs = Math.max(DAY_MS, endMs - startMs);
      const remainingMs = Math.max(0, endMs - nowMs);
      const ratio = Math.min(1, remainingMs / totalMs);
      prorationCreditMinor = Math.floor(Number(active.subtotalMinor || 0) * ratio);
    }

    return this.createOrderFlow({
      user,
      planId: targetPlan.id,
      businessId: business?.id,
      billingDetails: dto.billingDetails,
      gateway: PaymentGateway.RAZORPAY,
      paymentType: PaymentType.UPGRADE,
      previousSubscription: active,
      prorationCreditMinor,
      idempotencyKey: dto.idempotencyKey || idempotencyHeader,
    });
  }

  async scheduleDowngrade(
    user: { id: string; email: string; name?: string; role?: string },
    dto: DowngradeSubscriptionDto,
  ) {
    const { business } = await this.entitlementService.resolveBillingTarget(
      user,
      dto.businessId,
      false,
    );

    const active = await this.subscriptionRepo.findOne({
      where: {
        ...(business ? { businessId: business.id } : { userId: user.id, businessId: IsNull() }),
        status: SubscriptionStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });
    if (!active) {
      throw new BadRequestException('No active subscription found to downgrade.');
    }
    if (active.planId === dto.targetPlanId) {
      throw new BadRequestException('Target plan is identical to your current plan.');
    }

    const targetPlan = await this.planRepo.findOne({ where: { id: dto.targetPlanId } });
    if (!targetPlan) {
      throw new NotFoundException(`Target plan "${dto.targetPlanId}" not found.`);
    }
    if (!targetPlan.isActive) {
      throw new BadRequestException('Selected target plan is inactive.');
    }

    const currentPrice = Number(active.planSnapshot?.priceMinor ?? active.subtotalMinor ?? 0);
    if (Number(targetPlan.priceMinor) >= currentPrice) {
      throw new BadRequestException(
        'Target plan is not lower priced than your current plan. Use upgrade instead.',
      );
    }

    const settings = await this.getPaymentSettings();
    const targetSnapshot = this.buildPlanSnapshot(targetPlan);
    const oldValues = {
      planId: active.planId,
      scheduledPlanId: active.scheduledPlanId,
      scheduledChangeAt: active.scheduledChangeAt,
    };

    const effectiveImmediate = settings.downgradePolicy === 'IMMEDIATE';
    const effectiveAt = effectiveImmediate ? new Date() : active.expiresAt || new Date();

    await runInTransaction(
      this.dataSource,
      async (qr) => {
        if (effectiveImmediate) {
          active.planId = targetPlan.id;
          active.planSnapshot = targetSnapshot;
          active.scheduledPlanId = null;
          active.scheduledPlanSnapshot = null;
          active.scheduledChangeAt = null;
        } else {
          active.scheduledPlanId = targetPlan.id;
          active.scheduledPlanSnapshot = targetSnapshot;
          active.scheduledChangeAt = effectiveAt;
        }
        active.updatedBy = user.id;
        await qr.manager.save(SubscriptionEntity, active);

        await qr.manager.save(
          SubscriptionChangeEntity,
          qr.manager.create(SubscriptionChangeEntity, {
            subscriptionId: active.id,
            businessId: business?.id || null,
            userId: user.id,
            currentPlanId: oldValues.planId,
            requestedPlanId: targetPlan.id,
            changeType: SubscriptionChangeType.DOWNGRADE,
            effectiveWhen: effectiveImmediate
              ? SubscriptionChangeEffectiveWhen.IMMEDIATE
              : SubscriptionChangeEffectiveWhen.PERIOD_END,
            status: SubscriptionChangeStatus.COMPLETED,
            amountDueMinor: 0,
            currency: targetPlan.currency,
            effectiveAt,
          }),
        );

        await this.writeSubAudit(qr.manager, {
          subscriptionId: active.id,
          businessId: business?.id || null,
          actorType: SubscriptionAuditActorType.USER,
          actorId: user.id,
          action: effectiveImmediate
            ? 'DOWNGRADE_APPLIED_IMMEDIATE'
            : 'DOWNGRADE_SCHEDULED_PERIOD_END',
          oldValues,
          newValues: {
            planId: active.planId,
            scheduledPlanId: active.scheduledPlanId,
            scheduledChangeAt: active.scheduledChangeAt,
          },
          performedBy: user.id,
        });
      },
      'ScheduleDowngrade',
    );

    this.logger.info('Subscription downgrade processed', {
      subscriptionId: active.id,
      businessId: business?.id || null,
      targetPlanId: targetPlan.id,
      policy: settings.downgradePolicy,
    });

    return {
      success: true,
      effectiveWhen: effectiveImmediate ? 'IMMEDIATE' : 'PERIOD_END',
      effectiveAt,
      scheduledPlan: targetSnapshot,
      message: effectiveImmediate
        ? `Your subscription has been downgraded to ${targetPlan.name}.`
        : `Downgrade to ${targetPlan.name} scheduled for ${new Date(effectiveAt).toDateString()}. You retain full current plan benefits until then.`,
    };
  }

  async cancelSubscription(
    user: { id: string; email: string; name?: string; role?: string },
    dto: CancelSubscriptionDto,
  ) {
    const { business } = await this.entitlementService.resolveBillingTarget(
      user,
      dto.businessId,
      false,
    );

    const active = await this.subscriptionRepo.findOne({
      where: {
        ...(business ? { businessId: business.id } : { userId: user.id, businessId: IsNull() }),
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]),
      },
      order: { createdAt: 'DESC' },
    });

    if (!active) {
      throw new NotFoundException('No active subscription found to cancel.');
    }

    const cancelAtPeriodEnd = dto.cancelAtPeriodEnd !== false;
    const now = new Date();
    const oldValues = {
      status: active.status,
      cancelAtPeriodEnd: active.cancelAtPeriodEnd,
      cancelledAt: active.cancelledAt,
    };

    await runInTransaction(
      this.dataSource,
      async (qr) => {
        active.cancelAtPeriodEnd = cancelAtPeriodEnd;
        active.cancelledAt = now;
        active.cancellationReason = dto.reason?.trim() || 'Cancelled by business user';
        active.updatedBy = user.id;

        if (!cancelAtPeriodEnd) {
          active.status = SubscriptionStatus.CANCELLED;
        }
        await qr.manager.save(SubscriptionEntity, active);

        await qr.manager.save(
          SubscriptionChangeEntity,
          qr.manager.create(SubscriptionChangeEntity, {
            subscriptionId: active.id,
            businessId: business?.id || null,
            userId: user.id,
            currentPlanId: active.planId,
            requestedPlanId: active.planId,
            changeType: SubscriptionChangeType.CANCEL,
            effectiveWhen: cancelAtPeriodEnd
              ? SubscriptionChangeEffectiveWhen.PERIOD_END
              : SubscriptionChangeEffectiveWhen.IMMEDIATE,
            status: SubscriptionChangeStatus.COMPLETED,
            amountDueMinor: 0,
            currency: active.currency,
            effectiveAt: cancelAtPeriodEnd ? active.expiresAt || now : now,
          }),
        );

        await this.writeSubAudit(qr.manager, {
          subscriptionId: active.id,
          businessId: business?.id || null,
          actorType: SubscriptionAuditActorType.USER,
          actorId: user.id,
          action: cancelAtPeriodEnd ? 'SUBSCRIPTION_CANCEL_SCHEDULED' : 'SUBSCRIPTION_CANCELLED',
          oldValues,
          newValues: {
            status: active.status,
            cancelAtPeriodEnd: active.cancelAtPeriodEnd,
            cancelledAt: active.cancelledAt,
            reason: active.cancellationReason,
          },
          performedBy: user.id,
        });
      },
      'CancelSubscription',
    );

    this.logger.info('Subscription cancelled', {
      subscriptionId: active.id,
      businessId: business?.id || null,
      cancelAtPeriodEnd,
    });

    return {
      success: true,
      subscriptionId: active.id,
      status: active.status,
      cancelAtPeriodEnd: active.cancelAtPeriodEnd,
      expiresAt: active.expiresAt,
      message: cancelAtPeriodEnd
        ? 'Your subscription will remain active until the end of the current billing period and will not be renewed.'
        : 'Your subscription has been cancelled immediately.',
    };
  }

  async createOrderFlow(params: {
    user: { id: string; email: string; name?: string; role?: string };
    planId: string;
    businessId?: string;
    billingDetails?: {
      billingName?: string;
      gstin?: string;
      state?: string;
      address?: string;
    };
    gateway?: PaymentGateway | string;
    paymentType: PaymentType;
    previousSubscription?: SubscriptionEntity;
    prorationCreditMinor?: number;
    existingPendingSubscription?: SubscriptionEntity;
    idempotencyKey?: string;
  }) {
    const { user, planId, paymentType } = params;
    const settings = await this.getPaymentSettings();

    if (!settings.razorpayEnabled && (params.gateway || PaymentGateway.RAZORPAY) === PaymentGateway.RAZORPAY) {
      throw new BadRequestException('Razorpay payments are currently disabled in Payment Settings.');
    }

    const { business } = await this.entitlementService.resolveBillingTarget(
      user,
      params.businessId,
      false,
    );

    const resolvedBillingDetails = {
      billingName:
        params.billingDetails?.billingName?.trim() ||
        business?.name ||
        user.name ||
        user.email,
      gstin: params.billingDetails?.gstin?.trim().toUpperCase() || business?.gstin || null,
      state: params.billingDetails?.state?.trim() || business?.state || settings.companyState || 'Gujarat',
      address: params.billingDetails?.address?.trim() || business?.address || null,
      email: business?.email || user.email,
      phone: business?.phone || '',
    };

    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException(`Subscription plan "${planId}" not found.`);
    }
    if (!plan.isActive) {
      throw new BadRequestException(
        `Subscription plan "${plan.name}" is inactive and unavailable for purchase.`,
      );
    }

    if (paymentType === PaymentType.PURCHASE) {
      const existingActive = await this.subscriptionRepo.findOne({
        where: {
          ...(business ? { businessId: business.id } : { userId: user.id, businessId: IsNull() }),
          status: SubscriptionStatus.ACTIVE,
        },
      });
      if (existingActive && !params.existingPendingSubscription) {
        throw new ConflictException(
          'This account already has an active subscription. Please use Renew, Upgrade, or Downgrade.',
        );
      }
    }

    const cleanIdem = params.idempotencyKey?.trim() || null;
    if (cleanIdem) {
      const existingIdemPayment = await this.paymentRepo.findOne({
        where: { idempotencyKey: cleanIdem, userId: user.id },
        relations: ['subscription'],
      });
      if (existingIdemPayment && existingIdemPayment.gatewayOrderId) {
        if (existingIdemPayment.paymentStatus === PaymentStatus.CAPTURED) {
          throw new ConflictException('This checkout request has already been completed.');
        }
        if (existingIdemPayment.paymentStatus === PaymentStatus.CREATED) {
          const adapter = this.gatewayRegistry.getAdapter(existingIdemPayment.gateway);
          const pubConfig = adapter.getPublicConfig();
          return this.buildCheckoutResponse({
            subscription: existingIdemPayment.subscription!,
            payment: existingIdemPayment,
            plan,
            business,
            user,
            billingDetails: existingIdemPayment.subscription?.billingDetails || resolvedBillingDetails,
            keyId: pubConfig.keyId || '',
            prorationCreditMinor: 0,
            reused: true,
          });
        }
      }
    }

    // Prevent duplicate rapid pending checkout submissions (same billing scope + plan + type within 60s)
    const sixtySecondsAgo = new Date(Date.now() - 60_000);
    const pendingQb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.subscription', 'sub')
      .where('p.paymentType = :paymentType', { paymentType })
      .andWhere('p.paymentStatus = :status', { status: PaymentStatus.CREATED })
      .andWhere('p.createdAt >= :since', { since: sixtySecondsAgo })
      .andWhere('sub.planId = :planId', { planId: plan.id })
      .orderBy('p.createdAt', 'DESC');

    if (business) {
      pendingQb.andWhere('p.businessId = :businessId', { businessId: business.id });
    } else {
      pendingQb.andWhere('p.userId = :userId AND p.businessId IS NULL', { userId: user.id });
    }

    const recentPending = await pendingQb.getOne();

    if (recentPending && recentPending.gatewayOrderId && recentPending.subscription) {
      const adapter = this.gatewayRegistry.getAdapter(recentPending.gateway);
      const pubConfig = adapter.getPublicConfig();
      return this.buildCheckoutResponse({
        subscription: recentPending.subscription,
        payment: recentPending,
        plan,
        business,
        user,
        billingDetails: recentPending.subscription.billingDetails || resolvedBillingDetails,
        keyId: pubConfig.keyId || '',
        prorationCreditMinor: params.prorationCreditMinor || 0,
        reused: true,
      });
    }

    const baseSubtotalMinor = Number(plan.priceMinor);
    const creditMinor = Math.max(0, Math.trunc(Number(params.prorationCreditMinor || 0)));
    const netSubtotalMinor = Math.max(100, baseSubtotalMinor - creditMinor);
    const gstRateBps = Number(plan.gstRateBps ?? settings.defaultGstRateBps ?? 1800);
    const gst = this.invoiceService.computeGstBreakdown(
      netSubtotalMinor,
      gstRateBps,
      resolvedBillingDetails.state,
      settings.companyState,
    );

    const gatewayCode = params.gateway || settings.activeGateway || PaymentGateway.RAZORPAY;
    const adapter = this.gatewayRegistry.getAdapter(gatewayCode);
    const publicConfig = adapter.getPublicConfig();
    if (!publicConfig.configured || !publicConfig.keyId) {
      throw new BadRequestException(
        'Razorpay checkout is not configured yet. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      );
    }

    const snapshot = this.buildPlanSnapshot(plan);

    // Persist pending subscription + payment BEFORE calling gateway so receipt maps deterministically
    const { subscription, payment } = await runInTransaction(
      this.dataSource,
      async (qr) => {
        const sub =
          params.existingPendingSubscription ||
          (await qr.manager.save(
            SubscriptionEntity,
            qr.manager.create(SubscriptionEntity, {
              businessId: business?.id || null,
              userId: user.id,
              planId: plan.id,
              planSnapshot: snapshot,
              billingDetails: resolvedBillingDetails,
              status: SubscriptionStatus.PENDING,
              subtotalMinor: gst.subtotalMinor,
              taxMinor: gst.taxMinor,
              amountMinor: gst.totalMinor,
              currency: plan.currency || 'INR',
              previousSubscriptionId: params.previousSubscription?.id || null,
              createdBy: user.id,
              updatedBy: user.id,
            }),
          ));

        const pay = await qr.manager.save(
          PaymentEntity,
          qr.manager.create(PaymentEntity, {
            businessId: business?.id || null,
            userId: user.id,
            subscriptionId: sub.id,
            gateway: gatewayCode,
            paymentType,
            amountMinor: gst.totalMinor,
            refundedAmountMinor: 0,
            currency: plan.currency || 'INR',
            paymentStatus: PaymentStatus.CREATED,
            idempotencyKey: cleanIdem,
          }),
        );

        await qr.manager.save(
          SubscriptionChangeEntity,
          qr.manager.create(SubscriptionChangeEntity, {
            subscriptionId: sub.id,
            businessId: business?.id || null,
            userId: user.id,
            currentPlanId: params.previousSubscription?.planId || null,
            requestedPlanId: plan.id,
            changeType:
              paymentType === PaymentType.UPGRADE
                ? SubscriptionChangeType.UPGRADE
                : paymentType === PaymentType.RENEWAL
                  ? SubscriptionChangeType.RENEWAL
                  : SubscriptionChangeType.PURCHASE,
            effectiveWhen: SubscriptionChangeEffectiveWhen.IMMEDIATE,
            status: SubscriptionChangeStatus.PENDING,
            amountDueMinor: gst.totalMinor,
            currency: plan.currency || 'INR',
          }),
        );

        await this.writeSubAudit(qr.manager, {
          subscriptionId: sub.id,
          businessId: business?.id || null,
          actorType: SubscriptionAuditActorType.USER,
          actorId: user.id,
          action: `CHECKOUT_INITIATED_${paymentType}`,
          newValues: {
            planId: plan.id,
            planCode: plan.code,
            amountMinor: gst.totalMinor,
            prorationCreditMinor: creditMinor,
            gstinProvided: Boolean(resolvedBillingDetails.gstin),
          },
          performedBy: user.id,
        });

        return { subscription: sub, payment: pay };
      },
      'CreatePendingCheckout',
    );

    try {
      const gatewayOrder = await adapter.createOrder({
        amountMinor: gst.totalMinor,
        currency: plan.currency || 'INR',
        receipt: `rcpt_${payment.id.replace(/-/g, '').slice(0, 24)}`,
        notes: {
          mercora_payment_id: payment.id,
          mercora_subscription_id: subscription.id,
          business_id: business?.id || 'ACCOUNT',
          user_id: user.id,
          plan_code: plan.code,
          payment_type: paymentType,
        },
      });

      payment.gatewayOrderId = gatewayOrder.orderId;
      await this.paymentRepo.save(payment);

      await this.attemptRepo.save(
        this.attemptRepo.create({
          paymentId: payment.id,
          gateway: gatewayCode,
          gatewayOrderId: gatewayOrder.orderId,
          attemptNumber: 1,
          status: PaymentStatus.CREATED,
          gatewayResponse: gatewayOrder.rawSanitized,
        }),
      );

      this.logger.payment('CHECKOUT_ORDER_CREATED', {
        gateway: gatewayCode,
        paymentId: payment.id,
        subscriptionId: subscription.id,
        businessId: business?.id || undefined,
        orderId: gatewayOrder.orderId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        status: PaymentStatus.CREATED,
      });

      return this.buildCheckoutResponse({
        subscription,
        payment,
        plan,
        business,
        user,
        billingDetails: resolvedBillingDetails,
        keyId: publicConfig.keyId,
        prorationCreditMinor: creditMinor,
        reused: false,
      });
    } catch (err: any) {
      payment.paymentStatus = PaymentStatus.FAILED;
      payment.failureReason = err?.message || 'Gateway order creation failed';
      await this.paymentRepo.save(payment);

      await this.attemptRepo.save(
        this.attemptRepo.create({
          paymentId: payment.id,
          gateway: gatewayCode,
          attemptNumber: 1,
          status: PaymentStatus.FAILED,
          gatewayResponse: {},
          failureReason: payment.failureReason,
        }),
      );
      throw err;
    }
  }

  private buildCheckoutResponse(params: {
    subscription: SubscriptionEntity;
    payment: PaymentEntity;
    plan: SubscriptionPlanEntity;
    business: BusinessOrmEntity | null;
    user: { id: string; email: string; name?: string };
    billingDetails?: {
      billingName?: string | null;
      gstin?: string | null;
      state?: string | null;
      address?: string | null;
      email?: string | null;
      phone?: string | null;
    } | null;
    keyId: string;
    prorationCreditMinor: number;
    reused: boolean;
  }) {
    const {
      subscription,
      payment,
      plan,
      business,
      user,
      billingDetails,
      keyId,
      prorationCreditMinor,
      reused,
    } = params;
    const displayName = billingDetails?.billingName || business?.name || user.name || user.email;
    return {
      reused,
      subscriptionId: subscription.id,
      paymentId: payment.id,
      gateway: payment.gateway,
      keyId,
      orderId: payment.gatewayOrderId,
      currency: payment.currency,
      subtotalMinor: Number(subscription.subtotalMinor),
      taxMinor: Number(subscription.taxMinor),
      amountMinor: Number(payment.amountMinor),
      prorationCreditMinor,
      subtotal: Number((Number(subscription.subtotalMinor) / 100).toFixed(2)),
      taxAmount: Number((Number(subscription.taxMinor) / 100).toFixed(2)),
      amount: Number((Number(payment.amountMinor) / 100).toFixed(2)),
      paymentType: payment.paymentType,
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        billingInterval: plan.billingInterval,
        durationDays: Number(plan.durationDays),
      },
      business: {
        id: business?.id || null,
        name: displayName,
        email: billingDetails?.email || business?.email || user.email,
        phone: billingDetails?.phone || business?.phone || '',
        state: billingDetails?.state || business?.state || null,
        gstin: billingDetails?.gstin || business?.gstin || null,
      },
      prefill: {
        name: displayName,
        email: billingDetails?.email || business?.email || user.email,
        contact: billingDetails?.phone || business?.phone || '',
      },
    };
  }

  /**
   * Idempotent, row-locked payment settlement & subscription activation.
   * Called by:
   *  1. POST /api/v1/payments/verify
   *  2. POST /api/v1/webhooks/razorpay (payment.captured / order.paid)
   *  3. Pending payment reconciliation worker
   */
  async settleCapturedPayment(params: {
    paymentId?: string;
    gatewayOrderId?: string;
    gatewayPayment: GatewayPaymentDetails;
    signatureVerified: boolean;
    actorType: SubscriptionAuditActorType;
    actorId?: string | null;
    correlationId?: string | null;
  }): Promise<{
    alreadyProcessed: boolean;
    payment: PaymentEntity;
    subscription: SubscriptionEntity;
    invoice: InvoiceEntity;
  }> {
    const { gatewayPayment, signatureVerified, actorType, actorId, correlationId } = params;
    const settings = await this.getPaymentSettings();

    const txResult = await runInTransaction(
      this.dataSource,
      async (qr) => {
        const qb = qr.manager
          .createQueryBuilder(PaymentEntity, 'p')
          .setLock('pessimistic_write');

        if (params.paymentId) {
          qb.where('p.id = :paymentId', { paymentId: params.paymentId });
        } else if (params.gatewayOrderId) {
          qb.where('p.gatewayOrderId = :orderId', { orderId: params.gatewayOrderId });
        } else {
          throw new BadRequestException('Payment lookup key missing for settlement.');
        }

        const payment = await qb.getOne();
        if (!payment) {
          throw new NotFoundException('Matching payment record not found.');
        }

        const subscription = await qr.manager
          .createQueryBuilder(SubscriptionEntity, 's')
          .setLock('pessimistic_write')
          .where('s.id = :subId', { subId: payment.subscriptionId })
          .getOne();

        if (!subscription) {
          throw new NotFoundException('Subscription linked to payment not found.');
        }

        const business = payment.businessId
          ? await qr.manager.findOne(BusinessOrmEntity, {
              where: { id: payment.businessId },
            })
          : null;
        const user = await qr.manager.findOne(UserEntity, {
          where: { id: payment.userId },
        });

        // Idempotency guard: already settled
        if (
          payment.paymentStatus === PaymentStatus.CAPTURED ||
          payment.paymentStatus === PaymentStatus.REFUNDED ||
          payment.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED
        ) {
          const existingInvoice = await this.invoiceService.ensureInvoiceForCapturedPayment(
            qr.manager,
            { payment, subscription, business, user, settings },
          );
          return {
            alreadyProcessed: true,
            payment,
            subscription,
            invoice: existingInvoice,
            business,
            user,
          };
        }

        // Strict verification checks
        if (
          payment.gatewayOrderId &&
          gatewayPayment.orderId &&
          gatewayPayment.orderId !== payment.gatewayOrderId
        ) {
          throw new BadRequestException('Gateway order ID does not match payment record.');
        }
        if (Number(gatewayPayment.amountMinor) !== Number(payment.amountMinor)) {
          throw new BadRequestException(
            `Gateway payment amount (${gatewayPayment.amountMinor}) does not match expected amount (${payment.amountMinor}).`,
          );
        }
        if (
          String(gatewayPayment.currency).toUpperCase() !==
          String(payment.currency).toUpperCase()
        ) {
          throw new BadRequestException(
            `Gateway currency (${gatewayPayment.currency}) does not match expected currency (${payment.currency}).`,
          );
        }
        if (!gatewayPayment.captured) {
          // Record AUTHORIZED status without activating subscription
          payment.gatewayPaymentId = gatewayPayment.paymentId;
          payment.paymentStatus =
            gatewayPayment.status === 'authorized'
              ? PaymentStatus.AUTHORIZED
              : payment.paymentStatus;
          payment.paymentMethod = gatewayPayment.method || payment.paymentMethod;
          payment.paymentMethodDetails =
            gatewayPayment.methodDetails || payment.paymentMethodDetails;
          await qr.manager.save(PaymentEntity, payment);

          throw new ConflictException(
            `Payment is in "${gatewayPayment.status}" state and not captured yet. Subscription cannot be activated until captured.`,
          );
        }

        // Update payment to CAPTURED
        const now = new Date();
        payment.gatewayPaymentId = gatewayPayment.paymentId;
        payment.paymentStatus = PaymentStatus.CAPTURED;
        payment.paymentMethod = gatewayPayment.method || null;
        payment.paymentMethodDetails = gatewayPayment.methodDetails || null;
        payment.signatureVerified = payment.signatureVerified || signatureVerified;
        if (payment.signatureVerified && !payment.verifiedAt) {
          payment.verifiedAt = now;
        }
        payment.paidAt = now;
        payment.failureCode = null;
        payment.failureReason = null;
        await qr.manager.save(PaymentEntity, payment);

        const attemptCount = await qr.manager.count(PaymentAttemptEntity, {
          where: { paymentId: payment.id },
        });
        await qr.manager.save(
          PaymentAttemptEntity,
          qr.manager.create(PaymentAttemptEntity, {
            paymentId: payment.id,
            gateway: payment.gateway,
            gatewayOrderId: payment.gatewayOrderId,
            gatewayPaymentId: gatewayPayment.paymentId,
            attemptNumber: attemptCount + 1,
            status: PaymentStatus.CAPTURED,
            gatewayResponse: gatewayPayment.rawSanitized,
          }),
        );

        // Supersede any existing ACTIVE/PAST_DUE subscription on this business or account inside the same lock
        const existingActiveQb = qr.manager
          .createQueryBuilder(SubscriptionEntity, 's')
          .setLock('pessimistic_write');

        if (subscription.businessId) {
          existingActiveQb.where('s.businessId = :businessId', {
            businessId: subscription.businessId,
          });
        } else {
          existingActiveQb.where('s.userId = :userId AND s.businessId IS NULL', {
            userId: subscription.userId,
          });
        }

        const existingActive = await existingActiveQb
          .andWhere('s.id != :currentId', { currentId: subscription.id })
          .andWhere('s.status IN (:...statuses)', {
            statuses: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
          })
          .getMany();

        const durationDays = Number(subscription.planSnapshot?.durationDays || 30);
        let startsAt = now;
        let expiresAt = new Date(now.getTime() + durationDays * DAY_MS);

        for (const prev of existingActive) {
          const prevExpiryMs = prev.expiresAt ? new Date(prev.expiresAt).getTime() : 0;
          if (
            payment.paymentType === PaymentType.RENEWAL &&
            prevExpiryMs > now.getTime()
          ) {
            startsAt = prev.startsAt || now;
            expiresAt = new Date(prevExpiryMs + durationDays * DAY_MS);
          }

          prev.status =
            payment.paymentType === PaymentType.UPGRADE
              ? SubscriptionStatus.CANCELLED
              : SubscriptionStatus.EXPIRED;
          if (payment.paymentType === PaymentType.UPGRADE) {
            prev.cancelledAt = now;
            prev.cancellationReason = `Superseded by upgrade to ${subscription.planSnapshot?.name || 'new plan'}`;
          }
          prev.updatedBy = actorId || null;
          await qr.manager.save(SubscriptionEntity, prev);
        }

        const oldSubStatus = subscription.status;
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.startsAt = startsAt;
        subscription.expiresAt = expiresAt;
        subscription.graceUntil = null;
        subscription.cancelAtPeriodEnd = false;
        subscription.updatedBy = actorId || null;
        await qr.manager.save(SubscriptionEntity, subscription);

        await qr.manager.update(
          SubscriptionChangeEntity,
          { subscriptionId: subscription.id, status: SubscriptionChangeStatus.PENDING },
          { status: SubscriptionChangeStatus.COMPLETED, effectiveAt: startsAt },
        );

        const invoice = await this.invoiceService.ensureInvoiceForCapturedPayment(
          qr.manager,
          { payment, subscription, business, user, settings },
        );

        await this.writeSubAudit(qr.manager, {
          subscriptionId: subscription.id,
          businessId: subscription.businessId,
          actorType,
          actorId: actorId || null,
          action:
            payment.paymentType === PaymentType.RENEWAL
              ? 'SUBSCRIPTION_RENEWED'
              : payment.paymentType === PaymentType.UPGRADE
                ? 'SUBSCRIPTION_UPGRADED'
                : 'SUBSCRIPTION_ACTIVATED',
          oldValues: { status: oldSubStatus },
          newValues: {
            status: subscription.status,
            startsAt: subscription.startsAt,
            expiresAt: subscription.expiresAt,
            paymentId: payment.id,
            invoiceNumber: invoice.invoiceNumber,
          },
          performedBy: actorId || null,
          correlationId: correlationId || RequestContext.getRequestId() || null,
        });

        return {
          alreadyProcessed: false,
          payment,
          subscription,
          invoice,
          business,
          user,
        };
      },
      'SettleCapturedPayment',
    );

    if (!txResult.alreadyProcessed) {
      this.logger.payment('SUBSCRIPTION_ACTIVATED', {
        gateway: txResult.payment.gateway,
        paymentId: txResult.payment.id,
        subscriptionId: txResult.subscription.id,
        businessId: txResult.subscription.businessId,
        orderId: txResult.payment.gatewayOrderId || undefined,
        invoiceId: txResult.invoice.id,
        amountMinor: txResult.payment.amountMinor,
        currency: txResult.payment.currency,
        status: txResult.subscription.status,
      });

      await this.dispatchConfirmationEmailsOnce(txResult);
    }

    return {
      alreadyProcessed: txResult.alreadyProcessed,
      payment: txResult.payment,
      subscription: txResult.subscription,
      invoice: txResult.invoice,
    };
  }

  private async dispatchConfirmationEmailsOnce(ctx: {
    payment: PaymentEntity;
    subscription: SubscriptionEntity;
    invoice: InvoiceEntity;
    business: BusinessOrmEntity | null;
    user: UserEntity | null;
  }): Promise<void> {
    const recipient = ctx.user?.email || ctx.business?.email;
    if (!recipient) return;

    // Atomic notification claim prevents double-emailing on concurrent verify/webhook
    const claim = await this.paymentRepo
      .createQueryBuilder()
      .update(PaymentEntity)
      .set({ confirmationNotifiedAt: new Date() })
      .where('id = :id AND confirmation_notified_at IS NULL', { id: ctx.payment.id })
      .execute();

    if (!claim.affected) return;

    const frontendUrl =
      this.configService.get<string>('auth.frontendUrl') || 'http://localhost:9000';
    const commonContext = {
      user_name: ctx.user?.name || ctx.business?.name || 'Business Partner',
      business_name: ctx.business?.name || 'Your Business',
      plan_name: ctx.subscription.planSnapshot?.name || 'Subscription Plan',
      amount_formatted: formatInrMinor(ctx.payment.amountMinor),
      starts_at: ctx.subscription.startsAt
        ? new Date(ctx.subscription.startsAt).toISOString().slice(0, 10)
        : '',
      expires_at: ctx.subscription.expiresAt
        ? new Date(ctx.subscription.expiresAt).toISOString().slice(0, 10)
        : '',
      invoice_number: ctx.invoice.invoiceNumber,
      payment_id: ctx.payment.gatewayPaymentId || ctx.payment.id,
      payment_method: (ctx.payment.paymentMethod || 'RAZORPAY').toUpperCase(),
      dashboard_url: `${frontendUrl}/subscription`,
    };

    const isRenewal = ctx.payment.paymentType === PaymentType.RENEWAL;
    this.emailDispatcher.sendAsync({
      to: recipient,
      templateCode: isRenewal
        ? SUBSCRIPTION_EMAIL_TEMPLATES.SUBSCRIPTION_RENEWED
        : SUBSCRIPTION_EMAIL_TEMPLATES.SUBSCRIPTION_PURCHASED,
      userId: ctx.user?.id,
      context: commonContext,
    });

    this.emailDispatcher.sendAsync({
      to: recipient,
      templateCode: SUBSCRIPTION_EMAIL_TEMPLATES.PAYMENT_SUCCESS,
      userId: ctx.user?.id,
      context: commonContext,
    });
  }

  async markPaymentFailed(params: {
    paymentId?: string;
    gatewayOrderId?: string;
    gatewayPaymentId?: string | null;
    failureCode?: string | null;
    failureReason: string;
    gatewayResponse?: Record<string, unknown>;
    actorType: SubscriptionAuditActorType;
    correlationId?: string | null;
  }): Promise<PaymentEntity | null> {
    const result = await runInTransaction(
      this.dataSource,
      async (qr) => {
        const qb = qr.manager
          .createQueryBuilder(PaymentEntity, 'p')
          .setLock('pessimistic_write');

        if (params.paymentId) {
          qb.where('p.id = :paymentId', { paymentId: params.paymentId });
        } else if (params.gatewayOrderId) {
          qb.where('p.gatewayOrderId = :orderId', { orderId: params.gatewayOrderId });
        } else {
          return null;
        }

        const payment = await qb.getOne();
        if (!payment) return null;

        // Never downgrade a captured/refunded payment due to out-of-order failure webhook
        if (
          [
            PaymentStatus.CAPTURED,
            PaymentStatus.REFUNDED,
            PaymentStatus.PARTIALLY_REFUNDED,
          ].includes(payment.paymentStatus as PaymentStatus)
        ) {
          return { payment, notified: false };
        }

        const wasAlreadyFailed = payment.paymentStatus === PaymentStatus.FAILED;
        payment.paymentStatus = PaymentStatus.FAILED;
        if (params.gatewayPaymentId) payment.gatewayPaymentId = params.gatewayPaymentId;
        payment.failureCode = params.failureCode || null;
        payment.failureReason = params.failureReason;
        await qr.manager.save(PaymentEntity, payment);

        const attemptCount = await qr.manager.count(PaymentAttemptEntity, {
          where: { paymentId: payment.id },
        });
        await qr.manager.save(
          PaymentAttemptEntity,
          qr.manager.create(PaymentAttemptEntity, {
            paymentId: payment.id,
            gateway: payment.gateway,
            gatewayOrderId: payment.gatewayOrderId,
            gatewayPaymentId: params.gatewayPaymentId || null,
            attemptNumber: attemptCount + 1,
            status: PaymentStatus.FAILED,
            gatewayResponse: params.gatewayResponse || {},
            failureReason: params.failureReason,
          }),
        );

        await qr.manager.update(
          SubscriptionChangeEntity,
          { subscriptionId: payment.subscriptionId, status: SubscriptionChangeStatus.PENDING },
          {
            status: SubscriptionChangeStatus.FAILED,
            failureReason: params.failureReason,
          },
        );

        await this.writeSubAudit(qr.manager, {
          subscriptionId: payment.subscriptionId,
          businessId: payment.businessId,
          actorType: params.actorType,
          action: 'PAYMENT_FAILED',
          newValues: {
            paymentId: payment.id,
            failureCode: params.failureCode,
            failureReason: params.failureReason,
          },
          correlationId: params.correlationId || RequestContext.getRequestId() || null,
        });

        return { payment, shouldNotify: !wasAlreadyFailed };
      },
      'MarkPaymentFailed',
    );

    if (!result) return null;
    if (result.shouldNotify) {
      const [sub, biz, usr] = await Promise.all([
        this.subscriptionRepo.findOne({ where: { id: result.payment.subscriptionId } }),
        this.businessRepo.findOne({ where: { id: result.payment.businessId } }),
        this.userRepo.findOne({ where: { id: result.payment.userId } }),
      ]);
      const to = usr?.email || biz?.email;
      if (to && sub) {
        const frontendUrl =
          this.configService.get<string>('auth.frontendUrl') || 'http://localhost:9000';
        this.emailDispatcher.sendAsync({
          to,
          templateCode: SUBSCRIPTION_EMAIL_TEMPLATES.PAYMENT_FAILED,
          userId: usr?.id,
          context: {
            user_name: usr?.name || biz?.name || 'Business Partner',
            business_name: biz?.name || 'Your Business',
            plan_name: sub.planSnapshot?.name || 'Subscription Plan',
            amount_formatted: formatInrMinor(result.payment.amountMinor),
            failure_reason: result.payment.failureReason || 'Bank or gateway declined the transaction.',
            retry_url: `${frontendUrl}/subscription`,
          },
        });
      }
    }

    return result.payment;
  }

  /**
   * Lifecycle sweep:
   *  - Transitions expired ACTIVE subscriptions (applying configured gracePeriodDays if > 0)
   *  - Transitions PAST_DUE subscriptions past graceUntil -> EXPIRED
   *  - Sends expiring-soon reminders once per period
   */
  async runLifecycleSweep(now = new Date()) {
    const settings = await this.getPaymentSettings();
    const graceDays = Math.max(0, Number(settings.gracePeriodDays || 0));
    const reminderDays = Math.max(1, Number(settings.expiringReminderDays || 7));
    const frontendUrl =
      this.configService.get<string>('auth.frontendUrl') || 'http://localhost:9000';

    let movedToPastDue = 0;
    let expiredCount = 0;
    let remindersSent = 0;

    // 1. Check ACTIVE subscriptions with expiresAt <= now
    const expiredActive = await this.subscriptionRepo.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        expiresAt: LessThanOrEqual(now),
      },
    });

    for (const sub of expiredActive) {
      await runInTransaction(
        this.dataSource,
        async (qr) => {
          const locked = await qr.manager
            .createQueryBuilder(SubscriptionEntity, 's')
            .setLock('pessimistic_write')
            .where('s.id = :id', { id: sub.id })
            .getOne();
          if (!locked || locked.status !== SubscriptionStatus.ACTIVE) return;

          const oldStatus = locked.status;
          if (graceDays > 0 && !locked.cancelAtPeriodEnd) {
            locked.status = SubscriptionStatus.PAST_DUE;
            locked.graceUntil = new Date(
              new Date(locked.expiresAt || now).getTime() + graceDays * DAY_MS,
            );
            movedToPastDue++;
          } else {
            locked.status = locked.cancelAtPeriodEnd
              ? SubscriptionStatus.CANCELLED
              : SubscriptionStatus.EXPIRED;
            locked.expiredNotifiedAt = now;
            expiredCount++;
          }

          await qr.manager.save(SubscriptionEntity, locked);
          await this.writeSubAudit(qr.manager, {
            subscriptionId: locked.id,
            businessId: locked.businessId,
            actorType: SubscriptionAuditActorType.SYSTEM,
            action:
              locked.status === SubscriptionStatus.PAST_DUE
                ? 'SUBSCRIPTION_ENTERED_GRACE_PERIOD'
                : 'SUBSCRIPTION_EXPIRED',
            oldValues: { status: oldStatus },
            newValues: { status: locked.status, graceUntil: locked.graceUntil },
          });
        },
        'ExpireActiveSubscription',
      );

      if (graceDays === 0 || sub.cancelAtPeriodEnd) {
        await this.notifyExpired(sub, frontendUrl);
      }
    }

    // 2. Check PAST_DUE subscriptions where graceUntil <= now
    const graceExpired = await this.subscriptionRepo.find({
      where: {
        status: SubscriptionStatus.PAST_DUE,
        graceUntil: LessThanOrEqual(now),
      },
    });

    for (const sub of graceExpired) {
      await runInTransaction(
        this.dataSource,
        async (qr) => {
          const locked = await qr.manager
            .createQueryBuilder(SubscriptionEntity, 's')
            .setLock('pessimistic_write')
            .where('s.id = :id', { id: sub.id })
            .getOne();
          if (!locked || locked.status !== SubscriptionStatus.PAST_DUE) return;

          locked.status = SubscriptionStatus.EXPIRED;
          locked.expiredNotifiedAt = now;
          await qr.manager.save(SubscriptionEntity, locked);
          expiredCount++;

          await this.writeSubAudit(qr.manager, {
            subscriptionId: locked.id,
            businessId: locked.businessId,
            actorType: SubscriptionAuditActorType.SYSTEM,
            action: 'SUBSCRIPTION_GRACE_EXPIRED',
            oldValues: { status: SubscriptionStatus.PAST_DUE },
            newValues: { status: SubscriptionStatus.EXPIRED },
          });
        },
        'ExpireGraceSubscription',
      );
      await this.notifyExpired(sub, frontendUrl);
    }

    // 3. Send expiring-soon reminders once
    const reminderCutoff = new Date(now.getTime() + reminderDays * DAY_MS);
    const expiringSoon = await this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: SubscriptionStatus.ACTIVE })
      .andWhere('s.expiresAt > :now AND s.expiresAt <= :cutoff', {
        now,
        cutoff: reminderCutoff,
      })
      .andWhere('s.renewalReminderSentAt IS NULL')
      .andWhere('s.cancelAtPeriodEnd = false')
      .getMany();

    for (const sub of expiringSoon) {
      const claim = await this.subscriptionRepo
        .createQueryBuilder()
        .update(SubscriptionEntity)
        .set({ renewalReminderSentAt: now })
        .where('id = :id AND renewal_reminder_sent_at IS NULL', { id: sub.id })
        .execute();

      if (!claim.affected) continue;

      const [biz, usr] = await Promise.all([
        sub.businessId
          ? this.businessRepo.findOne({ where: { id: sub.businessId } })
          : Promise.resolve(null),
        this.userRepo.findOne({ where: { id: sub.userId } }),
      ]);
      const to = usr?.email || biz?.email;
      if (to && sub.expiresAt) {
        const daysLeft = Math.max(
          1,
          Math.ceil((new Date(sub.expiresAt).getTime() - now.getTime()) / DAY_MS),
        );
        this.emailDispatcher.sendAsync({
          to,
          templateCode: SUBSCRIPTION_EMAIL_TEMPLATES.SUBSCRIPTION_EXPIRING_SOON,
          userId: usr?.id,
          context: {
            user_name: usr?.name || biz?.name || 'Business Partner',
            business_name: biz?.name || 'Your Business',
            plan_name: sub.planSnapshot?.name || 'Subscription Plan',
            expires_at: new Date(sub.expiresAt).toISOString().slice(0, 10),
            days_remaining: daysLeft,
            renew_url: `${frontendUrl}/subscription`,
          },
        });
        remindersSent++;
      }
    }

    this.logger.lifecycle('Subscription lifecycle sweep completed', {
      movedToPastDue,
      expiredCount,
      remindersSent,
    });

    return { movedToPastDue, expiredCount, remindersSent };
  }

  private async notifyExpired(sub: SubscriptionEntity, frontendUrl: string) {
    const [biz, usr] = await Promise.all([
      sub.businessId
        ? this.businessRepo.findOne({ where: { id: sub.businessId } })
        : Promise.resolve(null),
      this.userRepo.findOne({ where: { id: sub.userId } }),
    ]);
    const to = usr?.email || biz?.email;
    if (!to) return;

    this.emailDispatcher.sendAsync({
      to,
      templateCode: SUBSCRIPTION_EMAIL_TEMPLATES.SUBSCRIPTION_EXPIRED,
      userId: usr?.id,
      context: {
        user_name: usr?.name || biz?.name || 'Business Partner',
        business_name: biz?.name || 'Your Business',
        plan_name: sub.planSnapshot?.name || 'Subscription Plan',
        expired_at: sub.expiresAt
          ? new Date(sub.expiresAt).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        renew_url: `${frontendUrl}/subscription`,
      },
    });
  }

  // ── Admin Subscription Management ─────────────────────────────────────────

  async listAdminSubscriptions(query: AdminSubscriptionQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.subscriptionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.business', 'business')
      .leftJoinAndSelect('s.user', 'user')
      .orderBy('s.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status && query.status !== 'ALL') {
      qb.andWhere('s.status = :status', { status: query.status });
    }
    if (query.planId) {
      qb.andWhere('s.planId = :planId', { planId: query.planId });
    }
    if (query.businessId) {
      qb.andWhere('s.businessId = :businessId', { businessId: query.businessId });
    }
    if (query.expiringWithinDays) {
      const now = new Date();
      const cutoff = new Date(now.getTime() + query.expiringWithinDays * DAY_MS);
      qb.andWhere('s.status = :act AND s.expiresAt >= :now AND s.expiresAt <= :cutoff', {
        act: SubscriptionStatus.ACTIVE,
        now,
        cutoff,
      });
    }
    if (query.search?.trim()) {
      const q = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(business.name) LIKE :q OR LOWER(user.email) LIKE :q OR LOWER(s.businessId) LIKE :q)',
        { q },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items.map((s) => ({
        id: s.id,
        businessId: s.businessId || null,
        businessName:
          s.business?.name ||
          s.billingDetails?.billingName ||
          s.user?.name ||
          null,
        businessCity: s.business?.city || null,
        businessState: s.business?.state || null,
        userId: s.userId,
        userName: s.user?.name || null,
        userEmail: s.user?.email || null,
        planId: s.planId,
        planSnapshot: s.planSnapshot,
        status: s.status,
        subtotalMinor: Number(s.subtotalMinor),
        taxMinor: Number(s.taxMinor),
        amountMinor: Number(s.amountMinor),
        currency: s.currency,
        startsAt: s.startsAt,
        expiresAt: s.expiresAt,
        graceUntil: s.graceUntil,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        cancelledAt: s.cancelledAt,
        scheduledPlanSnapshot: s.scheduledPlanSnapshot,
        createdAt: s.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getAdminSubscriptionById(id: string) {
    const sub = await this.subscriptionRepo.findOne({
      where: { id },
      relations: ['business', 'user', 'plan'],
    });
    if (!sub) {
      throw new NotFoundException(`Subscription "${id}" not found.`);
    }

    const [payments, auditLogs, changes] = await Promise.all([
      this.paymentRepo.find({
        where: { subscriptionId: sub.id },
        order: { createdAt: 'DESC' },
      }),
      this.subAuditRepo.find({
        where: { subscriptionId: sub.id },
        order: { createdAt: 'DESC' },
      }),
      this.changeRepo.find({
        where: { subscriptionId: sub.id },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return {
      ...sub,
      payments,
      auditLogs,
      changes,
    };
  }

  async adminUpdateSubscription(
    id: string,
    dto: AdminUpdateSubscriptionDto,
    adminId: string,
  ) {
    const updated = await runInTransaction(
      this.dataSource,
      async (qr) => {
        const sub = await qr.manager
          .createQueryBuilder(SubscriptionEntity, 's')
          .setLock('pessimistic_write')
          .where('s.id = :id', { id })
          .getOne();
        if (!sub) {
          throw new NotFoundException(`Subscription "${id}" not found.`);
        }

        const oldValues = {
          status: sub.status,
          expiresAt: sub.expiresAt,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        };

        if (dto.status && dto.status !== sub.status) {
          if (dto.status === SubscriptionStatus.ACTIVE) {
            const otherActive = await qr.manager.findOne(SubscriptionEntity, {
              where: sub.businessId
                ? { businessId: sub.businessId, status: SubscriptionStatus.ACTIVE }
                : { userId: sub.userId, businessId: IsNull(), status: SubscriptionStatus.ACTIVE },
            });
            if (otherActive && otherActive.id !== sub.id) {
              otherActive.status = SubscriptionStatus.EXPIRED;
              otherActive.updatedBy = adminId;
              await qr.manager.save(SubscriptionEntity, otherActive);
            }
            if (!sub.startsAt) sub.startsAt = new Date();
            if (!sub.expiresAt) {
              sub.expiresAt = new Date(
                Date.now() + Number(sub.planSnapshot?.durationDays || 30) * DAY_MS,
              );
            }
          }
          if (dto.status === SubscriptionStatus.CANCELLED && !sub.cancelledAt) {
            sub.cancelledAt = new Date();
            sub.cancellationReason = dto.reason?.trim() || 'Cancelled by administrator';
          }
          sub.status = dto.status;
        }

        if (dto.extendDays) {
          const baseMs = sub.expiresAt
            ? Math.max(Date.now(), new Date(sub.expiresAt).getTime())
            : Date.now();
          sub.expiresAt = new Date(baseMs + dto.extendDays * DAY_MS);
        }

        if (dto.cancelAtPeriodEnd !== undefined) {
          sub.cancelAtPeriodEnd = dto.cancelAtPeriodEnd;
        }
        sub.updatedBy = adminId;

        const saved = await qr.manager.save(SubscriptionEntity, sub);

        await qr.manager.save(
          SubscriptionChangeEntity,
          qr.manager.create(SubscriptionChangeEntity, {
            subscriptionId: saved.id,
            businessId: saved.businessId,
            userId: saved.userId,
            currentPlanId: saved.planId,
            requestedPlanId: saved.planId,
            changeType: SubscriptionChangeType.ADMIN_OVERRIDE,
            effectiveWhen: SubscriptionChangeEffectiveWhen.IMMEDIATE,
            status: SubscriptionChangeStatus.COMPLETED,
            amountDueMinor: 0,
            currency: saved.currency,
            effectiveAt: new Date(),
          }),
        );

        await this.writeSubAudit(qr.manager, {
          subscriptionId: saved.id,
          businessId: saved.businessId,
          actorType: SubscriptionAuditActorType.ADMIN,
          actorId: adminId,
          action: 'ADMIN_SUBSCRIPTION_UPDATED',
          oldValues,
          newValues: {
            status: saved.status,
            expiresAt: saved.expiresAt,
            cancelAtPeriodEnd: saved.cancelAtPeriodEnd,
            reason: dto.reason,
          },
          performedBy: adminId,
        });

        return saved;
      },
      'AdminUpdateSubscription',
    );

    await this.auditService.log({
      userId: adminId,
      action: 'ADMIN_UPDATE_SUBSCRIPTION',
      module: 'SUBSCRIPTION_MANAGEMENT',
      entityType: 'SubscriptionEntity',
      entityId: updated.id,
      newData: { status: updated.status, expiresAt: updated.expiresAt },
    });

    return updated;
  }

  async writeSubAudit(
    manager: EntityManager,
    input: {
      subscriptionId?: string | null;
      businessId?: string | null;
      actorType: SubscriptionAuditActorType | string;
      actorId?: string | null;
      action: string;
      oldValues?: Record<string, unknown> | null;
      newValues?: Record<string, unknown> | null;
      performedBy?: string | null;
      correlationId?: string | null;
    },
  ): Promise<void> {
    await manager.save(
      SubscriptionAuditLogEntity,
      manager.create(SubscriptionAuditLogEntity, {
        subscriptionId: input.subscriptionId || null,
        businessId: input.businessId || null,
        actorType: input.actorType,
        actorId: input.actorId || null,
        action: input.action,
        oldValues: input.oldValues || null,
        newValues: input.newValues || null,
        performedBy: input.performedBy || null,
        correlationId: input.correlationId || RequestContext.getRequestId() || null,
      }),
    );
  }
}
