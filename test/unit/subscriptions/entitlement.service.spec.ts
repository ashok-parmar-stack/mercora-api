import { ForbiddenException } from '@nestjs/common';
import { SubscriptionEntitlementService } from '../../../src/modules/subscriptions/services/subscription-entitlement.service';
import { SubscriptionStatus } from '../../../src/modules/subscriptions/subscription.constants';

describe('SubscriptionEntitlementService (Unit - Access Enforcement)', () => {
  function setup() {
    const subscriptionRepo: any = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const businessRepo: any = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const enquiryRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(3),
      })),
    };

    const service = new SubscriptionEntitlementService(
      subscriptionRepo,
      businessRepo,
      enquiryRepo,
    );

    return { service, subscriptionRepo, businessRepo, enquiryRepo };
  }

  it('returns DEFAULT_FREE_PLAN_LIMITS when business has no active subscription or only EXPIRED subscription', async () => {
    const { service, businessRepo, subscriptionRepo } = setup();
    businessRepo.findOne.mockResolvedValue({
      id: 'biz-free',
      name: 'Free Biz',
      owner_user_id: 'usr-1',
      products: [{}, {}],
      contacts: [{}],
    });
    // Expired past expiresAt
    subscriptionRepo.find.mockResolvedValue([
      {
        id: 'sub-exp',
        status: SubscriptionStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 60_000),
        planSnapshot: {
          limits: { maxProducts: 100, featuredListing: true },
        },
      },
    ]);

    const snapshot = await service.getBusinessEntitlements('biz-free');
    expect(snapshot.hasActiveSubscription).toBe(false);
    expect(snapshot.planCode).toBe('FREE');
    expect(snapshot.limits.featuredListing).toBe(false);
    expect(snapshot.limits.maxProducts).toBe(5); // default free cap
  });

  it('unlocks paid plan limits while subscription is ACTIVE and revokes if expired', async () => {
    const { service, businessRepo, subscriptionRepo } = setup();
    businessRepo.findOne.mockResolvedValue({
      id: 'biz-pro',
      name: 'Pro Steel',
      owner_user_id: 'usr-1',
      products: Array.from({ length: 8 }),
      contacts: [{}],
    });

    subscriptionRepo.find.mockResolvedValue([
      {
        id: 'sub-pro',
        status: SubscriptionStatus.ACTIVE,
        planId: 'plan-pro',
        expiresAt: new Date(Date.now() + 86400_000),
        planSnapshot: {
          code: 'PRO_QUARTERLY',
          name: 'Pro Quarterly',
          limits: {
            maxBusinessListings: 3,
            maxProducts: 50,
            maxEnquiriesPerMonth: 150,
            maxContacts: 5,
            featuredListing: true,
            verifiedPriority: true,
            leadInboxAccess: true,
            analyticsAccess: true,
            prioritySupport: true,
          },
        },
      },
    ]);

    const snapshot = await service.getBusinessEntitlements('biz-pro');
    expect(snapshot.hasActiveSubscription).toBe(true);
    expect(snapshot.limits.featuredListing).toBe(true);
    expect(snapshot.limits.maxProducts).toBe(50);

    await expect(
      service.assertCanUpdateBusinessProfile('biz-pro', { productsCount: 25, contactsCount: 3 }),
    ).resolves.toBeUndefined();

    await expect(
      service.assertCanUpdateBusinessProfile('biz-pro', { productsCount: 51 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks second business listing creation when active/free limit is 1 and allows on paid multi-listing plan', async () => {
    const { service, businessRepo, subscriptionRepo } = setup();
    businessRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'biz-1' }]),
    });

    // Free limit = 1 -> cannot create 2nd
    subscriptionRepo.find.mockResolvedValue([]);
    await expect(service.assertCanCreateBusiness('usr-1', 'u@b.com')).rejects.toThrow(
      ForbiddenException,
    );

    // Pro limit = 3 -> allowed
    subscriptionRepo.find.mockResolvedValue([
      {
        id: 'sub-pro',
        status: SubscriptionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 86400_000),
        planSnapshot: { limits: { maxBusinessListings: 3 } },
      },
    ]);
    await expect(service.assertCanCreateBusiness('usr-1', 'u@b.com')).resolves.toBeUndefined();
  });

  it('falls back to user account-level subscription (businessId IS NULL) when business has no dedicated subscription', async () => {
    const { service, businessRepo, subscriptionRepo } = setup();
    businessRepo.findOne.mockResolvedValue({
      id: 'biz-new',
      name: 'New Listing',
      owner_user_id: 'usr-acct',
      products: [],
      contacts: [],
    });

    // First call (businessId = 'biz-new') -> empty; second call (userId = 'usr-acct', businessId IS NULL) -> active plan
    subscriptionRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'sub-acct-1',
          userId: 'usr-acct',
          businessId: null,
          status: SubscriptionStatus.ACTIVE,
          planId: 'plan-enterprise',
          expiresAt: new Date(Date.now() + 86400_000),
          planSnapshot: {
            code: 'ENTERPRISE_YEARLY',
            name: 'Enterprise Plan',
            limits: { maxProducts: 250, featuredListing: true },
          },
        },
      ]);

    const snapshot = await service.getBusinessEntitlements('biz-new');
    expect(snapshot.hasActiveSubscription).toBe(true);
    expect(snapshot.subscriptionId).toBe('sub-acct-1');
    expect(snapshot.limits.maxProducts).toBe(250);
    expect(snapshot.limits.featuredListing).toBe(true);
  });
});
