import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { MercoraLogger } from '../../../common/logger';
import { BusinessOrmEntity } from '../../businesses/infrastructure/persistence/entities/business-orm.entity';
import { BusinessEnquiryEntity } from '../../../database/entities/business-enquiry.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import {
  DEFAULT_FREE_PLAN_LIMITS,
  PlanLimits,
  SubscriptionStatus,
} from '../subscription.constants';

export interface BusinessEntitlementSnapshot {
  businessId: string;
  businessName: string;
  hasActiveSubscription: boolean;
  isInGracePeriod: boolean;
  subscriptionId: string | null;
  subscriptionStatus: string;
  planId: string | null;
  planCode: string | null;
  planName: string;
  startsAt: Date | null;
  expiresAt: Date | null;
  limits: PlanLimits;
  usage: {
    businessListingsUsed: number;
    productsUsed: number;
    contactsUsed: number;
    enquiriesThisMonthUsed: number;
  };
  remaining: {
    businessListings: number;
    products: number;
    contacts: number;
    enquiriesThisMonth: number;
  };
}

@Injectable()
export class SubscriptionEntitlementService {
  private readonly logger = new MercoraLogger(SubscriptionEntitlementService.name);

  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    @InjectRepository(BusinessOrmEntity)
    private readonly businessRepo: Repository<BusinessOrmEntity>,
    @InjectRepository(BusinessEnquiryEntity)
    private readonly enquiryRepo: Repository<BusinessEnquiryEntity>,
  ) {}

  async findOwnedBusinesses(
    userId: string,
    email?: string | null,
  ): Promise<BusinessOrmEntity[]> {
    const qb = this.businessRepo
      .createQueryBuilder('b')
      .orderBy('b.created_at', 'DESC');

    if (email && email.trim()) {
      qb.where(
        '(b.owner_user_id = :userId OR (b.owner_user_id IS NULL AND LOWER(b.email) = LOWER(:email)))',
        { userId, email: email.trim() },
      );
    } else {
      qb.where('b.owner_user_id = :userId', { userId });
    }

    return qb.getMany();
  }

  async resolveOwnedBusiness(
    user: { id: string; email?: string | null; role?: string | null },
    requestedBusinessId?: string | null,
    allowAdmin = false,
  ): Promise<{ business: BusinessOrmEntity; allOwned: BusinessOrmEntity[] }> {
    const owned = await this.findOwnedBusinesses(user.id, user.email);
    const isAdmin =
      allowAdmin &&
      Boolean(
        user.role &&
          ['SUPER_ADMIN', 'ADMIN', 'DATA_MANAGER', 'SALES'].includes(
            user.role.toUpperCase(),
          ),
      );

    if (requestedBusinessId?.trim()) {
      const target = await this.businessRepo.findOne({
        where: { id: requestedBusinessId.trim() },
      });
      if (!target) {
        throw new NotFoundException(
          `Business "${requestedBusinessId}" was not found.`,
        );
      }

      const ownsById = Boolean(target.owner_user_id && target.owner_user_id === user.id);
      const ownsByLegacyEmail = Boolean(
        !target.owner_user_id &&
          user.email &&
          target.email?.toLowerCase() === user.email.toLowerCase(),
      );

      if (!isAdmin && !ownsById && !ownsByLegacyEmail) {
        throw new ForbiddenException(
          'You do not have ownership permission for this business.',
        );
      }

      return { business: target, allOwned: owned.length > 0 ? owned : [target] };
    }

    if (owned.length === 0) {
      throw new NotFoundException(
        'No registered business profile found for your account. Please register your business first before subscribing.',
      );
    }

    return { business: owned[0], allOwned: owned };
  }

  /**
   * Resolves optional business context for billing/checkout:
   * - If requestedBusinessId is supplied, verifies ownership strictly.
   * - Otherwise returns the first owned business or null for account-level billing.
   */
  async resolveBillingTarget(
    user: { id: string; email?: string | null; role?: string | null },
    requestedBusinessId?: string | null,
    allowAdmin = false,
  ): Promise<{ business: BusinessOrmEntity | null; allOwned: BusinessOrmEntity[] }> {
    const owned = await this.findOwnedBusinesses(user.id, user.email);
    const isAdmin =
      allowAdmin &&
      Boolean(
        user.role &&
          ['SUPER_ADMIN', 'ADMIN', 'DATA_MANAGER', 'SALES'].includes(
            user.role.toUpperCase(),
          ),
      );

    if (requestedBusinessId?.trim()) {
      const target = await this.businessRepo.findOne({
        where: { id: requestedBusinessId.trim() },
      });
      if (!target) {
        throw new NotFoundException(
          `Business "${requestedBusinessId}" was not found.`,
        );
      }

      const ownsById = Boolean(target.owner_user_id && target.owner_user_id === user.id);
      const ownsByLegacyEmail = Boolean(
        !target.owner_user_id &&
          user.email &&
          target.email?.toLowerCase() === user.email.toLowerCase(),
      );

      if (!isAdmin && !ownsById && !ownsByLegacyEmail) {
        throw new ForbiddenException(
          'You do not have ownership permission for this business.',
        );
      }

      return { business: target, allOwned: owned.length > 0 ? owned : [target] };
    }

    return { business: owned[0] || null, allOwned: owned };
  }

  private pickValidSubscription(candidates: SubscriptionEntity[]): SubscriptionEntity | null {
    const now = Date.now();
    for (const sub of candidates) {
      if (sub.status === SubscriptionStatus.ACTIVE) {
        if (!sub.expiresAt || new Date(sub.expiresAt).getTime() > now) {
          return sub;
        }
      }
      if (sub.status === SubscriptionStatus.PAST_DUE) {
        if (sub.graceUntil && new Date(sub.graceUntil).getTime() > now) {
          return sub;
        }
      }
    }
    return null;
  }

  async findEffectiveSubscription(
    businessId?: string | null,
    ownerUserId?: string | null,
  ): Promise<SubscriptionEntity | null> {
    if (businessId) {
      const candidates = await this.subscriptionRepo.find({
        where: {
          businessId,
          status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]),
        },
        order: { createdAt: 'DESC' },
      });
      const match = this.pickValidSubscription(candidates);
      if (match) return match;
    }

    if (ownerUserId) {
      const accountCandidates = await this.subscriptionRepo.find({
        where: {
          userId: ownerUserId,
          businessId: IsNull(),
          status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]),
        },
        order: { createdAt: 'DESC' },
      });
      return this.pickValidSubscription(accountCandidates);
    }

    return null;
  }

  async getAccountEntitlements(
    userId: string,
    displayName = 'Account Subscription',
  ): Promise<BusinessEntitlementSnapshot> {
    const activeSub = await this.findEffectiveSubscription(null, userId);
    const limits: PlanLimits = activeSub?.planSnapshot?.limits
      ? { ...DEFAULT_FREE_PLAN_LIMITS, ...activeSub.planSnapshot.limits }
      : { ...DEFAULT_FREE_PLAN_LIMITS };

    const ownerCount = await this.businessRepo.count({ where: { owner_user_id: userId } });

    return {
      businessId: 'ACCOUNT',
      businessName: activeSub?.billingDetails?.billingName || displayName,
      hasActiveSubscription: Boolean(activeSub),
      isInGracePeriod: activeSub?.status === SubscriptionStatus.PAST_DUE,
      subscriptionId: activeSub?.id || null,
      subscriptionStatus: activeSub?.status || 'FREE',
      planId: activeSub?.planId || null,
      planCode: activeSub?.planSnapshot?.code || 'FREE',
      planName: activeSub?.planSnapshot?.name || 'Free Tier',
      startsAt: activeSub?.startsAt || null,
      expiresAt: activeSub?.expiresAt || null,
      limits,
      usage: {
        businessListingsUsed: ownerCount,
        productsUsed: 0,
        contactsUsed: 0,
        enquiriesThisMonthUsed: 0,
      },
      remaining: {
        businessListings: this.computeRemaining(limits.maxBusinessListings, ownerCount),
        products: limits.maxProducts,
        contacts: limits.maxContacts,
        enquiriesThisMonth: limits.maxEnquiriesPerMonth,
      },
    };
  }

  private computeRemaining(limit: number, used: number): number {
    if (limit < 0) return -1; // unlimited
    return Math.max(0, limit - used);
  }

  async getBusinessEntitlements(businessId: string): Promise<BusinessEntitlementSnapshot> {
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException(`Business "${businessId}" not found.`);
    }

    const activeSub = await this.findEffectiveSubscription(
      businessId,
      business.owner_user_id,
    );
    const limits: PlanLimits = activeSub?.planSnapshot?.limits
      ? { ...DEFAULT_FREE_PLAN_LIMITS, ...activeSub.planSnapshot.limits }
      : { ...DEFAULT_FREE_PLAN_LIMITS };

    const ownerCount = business.owner_user_id
      ? await this.businessRepo.count({ where: { owner_user_id: business.owner_user_id } })
      : 1;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const enquiriesThisMonthUsed = await this.enquiryRepo
      .createQueryBuilder('e')
      .where('e.business_id = :businessId', { businessId })
      .andWhere('e.created_at >= :since', { since: thirtyDaysAgo })
      .getCount();

    const productsUsed = Array.isArray(business.products) ? business.products.length : 0;
    const contactsUsed = Array.isArray(business.contacts) ? business.contacts.length : 0;

    return {
      businessId: business.id,
      businessName: business.name,
      hasActiveSubscription: Boolean(activeSub),
      isInGracePeriod: activeSub?.status === SubscriptionStatus.PAST_DUE,
      subscriptionId: activeSub?.id || null,
      subscriptionStatus: activeSub?.status || 'FREE',
      planId: activeSub?.planId || null,
      planCode: activeSub?.planSnapshot?.code || 'FREE',
      planName: activeSub?.planSnapshot?.name || 'Free Tier',
      startsAt: activeSub?.startsAt || null,
      expiresAt: activeSub?.expiresAt || null,
      limits,
      usage: {
        businessListingsUsed: ownerCount,
        productsUsed,
        contactsUsed,
        enquiriesThisMonthUsed,
      },
      remaining: {
        businessListings: this.computeRemaining(limits.maxBusinessListings, ownerCount),
        products: this.computeRemaining(limits.maxProducts, productsUsed),
        contacts: this.computeRemaining(limits.maxContacts, contactsUsed),
        enquiriesThisMonth: this.computeRemaining(
          limits.maxEnquiriesPerMonth,
          enquiriesThisMonthUsed,
        ),
      },
    };
  }

  async canAccessFeature(
    businessId: string,
    feature: keyof PlanLimits,
  ): Promise<boolean> {
    const snapshot = await this.getBusinessEntitlements(businessId);
    const value = snapshot.limits[feature];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return false;
  }

  async assertCanCreateBusiness(
    ownerUserId?: string | null,
    ownerEmail?: string | null,
  ): Promise<void> {
    if (!ownerUserId) return;

    const owned = await this.findOwnedBusinesses(ownerUserId, ownerEmail);
    if (owned.length === 0) return; // First business always allowed

    let maxListingsAllowed = DEFAULT_FREE_PLAN_LIMITS.maxBusinessListings;
    const accountSub = await this.findEffectiveSubscription(null, ownerUserId);
    const accountLimit = accountSub?.planSnapshot?.limits?.maxBusinessListings;
    if (typeof accountLimit === 'number') {
      if (accountLimit < 0) return;
      if (accountLimit > maxListingsAllowed) maxListingsAllowed = accountLimit;
    }

    for (const biz of owned) {
      const sub = await this.findEffectiveSubscription(biz.id, ownerUserId);
      const limit = sub?.planSnapshot?.limits?.maxBusinessListings;
      if (typeof limit === 'number') {
        if (limit < 0) return; // Unlimited
        if (limit > maxListingsAllowed) maxListingsAllowed = limit;
      }
    }

    if (maxListingsAllowed >= 0 && owned.length >= maxListingsAllowed) {
      this.logger.warn('Business listing limit reached for owner', {
        ownerUserId,
        ownedCount: owned.length,
        maxListingsAllowed,
      });
      throw new ForbiddenException(
        `Your current subscription allows up to ${maxListingsAllowed} business listing(s). Please upgrade your subscription plan to add more businesses.`,
      );
    }
  }

  async assertCanUpdateBusinessProfile(
    businessId: string,
    counts: { productsCount?: number; contactsCount?: number },
  ): Promise<void> {
    const entitlement = await this.getBusinessEntitlements(businessId);

    if (
      counts.productsCount !== undefined &&
      entitlement.limits.maxProducts >= 0 &&
      counts.productsCount > entitlement.limits.maxProducts
    ) {
      throw new ForbiddenException(
        `Your "${entitlement.planName}" plan supports up to ${entitlement.limits.maxProducts} product(s). Please upgrade your subscription to add more products.`,
      );
    }

    if (
      counts.contactsCount !== undefined &&
      entitlement.limits.maxContacts >= 0 &&
      counts.contactsCount > entitlement.limits.maxContacts
    ) {
      throw new ForbiddenException(
        `Your "${entitlement.planName}" plan supports up to ${entitlement.limits.maxContacts} contact number(s). Please upgrade your subscription to add more contacts.`,
      );
    }
  }

  async getFeaturedEntitledBusinessIds(): Promise<string[]> {
    const now = new Date();
    const activeSubs = await this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.status = :active AND (s.expires_at IS NULL OR s.expires_at > :now)', {
        active: SubscriptionStatus.ACTIVE,
        now,
      })
      .orWhere('s.status = :pastDue AND s.grace_until IS NOT NULL AND s.grace_until > :now', {
        pastDue: SubscriptionStatus.PAST_DUE,
        now,
      })
      .getMany();

    return activeSubs
      .filter((s) => Boolean(s.planSnapshot?.limits?.featuredListing))
      .map((s) => s.businessId);
  }

  async isWithinMonthlyEnquiryQuota(businessId: string): Promise<{
    allowed: boolean;
    used: number;
    limit: number;
    leadInboxAccess: boolean;
  }> {
    const entitlement = await this.getBusinessEntitlements(businessId);
    const limit = entitlement.limits.maxEnquiriesPerMonth;
    const used = entitlement.usage.enquiriesThisMonthUsed;
    const allowed = limit < 0 || used < limit;
    return {
      allowed,
      used,
      limit,
      leadInboxAccess: entitlement.limits.leadInboxAccess,
    };
  }
}
