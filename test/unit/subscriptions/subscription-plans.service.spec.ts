import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionPlansService } from '../../../src/modules/subscriptions/services/subscription-plans.service';
import { BillingInterval } from '../../../src/modules/subscriptions/subscription.constants';

describe('SubscriptionPlansService (Unit - Section 14A)', () => {
  const baseLimits = {
    maxBusinessListings: 1,
    maxProducts: 10,
    maxEnquiriesPerMonth: 25,
    maxContacts: 2,
    featuredListing: false,
    verifiedPriority: false,
    leadInboxAccess: true,
    analyticsAccess: false,
    prioritySupport: false,
  };

  function setup() {
    const planRepo: any = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn((v) => ({ id: 'plan-new', ...v })),
      save: jest.fn(async (v) => v),
    };
    const planFeatureRepo: any = {
      count: jest.fn().mockResolvedValue(1),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
      manager: {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((_e, v) => v),
        save: jest.fn(async (_e, v) => v),
      },
    };
    const subscriptionRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { planId: 'plan-1', activeCount: 4, totalCount: 6 },
        ]),
      })),
    };

    const manager: any = {
      create: jest.fn((_entity, data) => ({
        id: 'plan-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })),
      save: jest.fn(async (_entity, data) => data),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const queryRunner: any = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager,
    };
    const dataSource: any = {
      createQueryRunner: jest.fn(() => queryRunner),
    };
    const auditService: any = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SubscriptionPlansService(
      planRepo,
      planFeatureRepo,
      subscriptionRepo,
      dataSource,
      auditService,
    );

    return { service, planRepo, manager, auditService };
  }

  it('returns only active plans sorted for public/business catalog', async () => {
    const { service, planRepo } = setup();
    planRepo.find.mockResolvedValue([
      {
        id: 'p-1',
        code: 'STARTER_MONTHLY',
        name: 'Starter',
        priceMinor: 99900,
        gstRateBps: 1800,
        currency: 'INR',
        billingInterval: BillingInterval.MONTHLY,
        durationDays: 30,
        features: ['F1'],
        limits: baseLimits,
        isActive: true,
        displayOrder: 1,
      },
    ]);

    const plans = await service.findActivePlans();
    expect(planRepo.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { displayOrder: 'ASC', priceMinor: 'ASC' },
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].priceMinor).toBe(99900);
    expect(plans[0].taxMinor).toBe(17982);
    expect(plans[0].totalPriceMinor).toBe(117882);
    expect(Array.isArray(plans[0].featureGroups)).toBe(true);
    expect(plans[0].featureGroups.length).toBeGreaterThanOrEqual(5);
    expect(
      plans[0].featureGroups.find((g) => g.key === 'featured_priority')?.included,
    ).toBe(false);
  });

  it('creates a new plan, normalizes code, syncs features, and writes audit log', async () => {
    const { service, planRepo, auditService } = setup();
    planRepo.findOne.mockResolvedValue(null);

    const created = await service.createPlan(
      {
        code: 'growth-monthly',
        name: 'Growth Plan',
        price: 1499,
        billingInterval: BillingInterval.MONTHLY,
        durationDays: 30,
        features: ['Priority Search', ''],
        limits: baseLimits,
      },
      'admin-1',
    );

    expect(created.code).toBe('GROWTH_MONTHLY');
    expect(created.priceMinor).toBe(149900);
    expect(created.taxMinor).toBe(26982);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE_SUBSCRIPTION_PLAN', userId: 'admin-1' }),
    );
  });

  it('rejects duplicate plan codes and invalid negative pricing or zero duration', async () => {
    const { service, planRepo } = setup();

    planRepo.findOne.mockResolvedValue({ id: 'existing', code: 'DUP_CODE' });
    await expect(
      service.createPlan({
        code: 'DUP_CODE',
        name: 'Dup',
        price: 500,
        billingInterval: BillingInterval.MONTHLY,
        durationDays: 30,
        features: [],
        limits: baseLimits,
      }),
    ).rejects.toThrow(ConflictException);

    planRepo.findOne.mockResolvedValue(null);
    await expect(
      service.createPlan({
        code: 'BAD_DUR',
        name: 'Bad',
        price: 500,
        billingInterval: BillingInterval.MONTHLY,
        durationDays: 0,
        features: [],
        limits: baseLimits,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createPlan({
        code: 'BAD_PRICE',
        name: 'Bad Price',
        priceMinor: -10,
        billingInterval: BillingInterval.MONTHLY,
        durationDays: 30,
        features: [],
        limits: baseLimits,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('updates plan pricing and deactivates plan without mutating any existing subscriptions', async () => {
    const { service, planRepo, manager, auditService } = setup();
    const existingPlan = {
      id: 'plan-1',
      code: 'STARTER_MONTHLY',
      name: 'Starter',
      priceMinor: 99900,
      gstRateBps: 1800,
      currency: 'INR',
      billingInterval: BillingInterval.MONTHLY,
      durationDays: 30,
      features: ['Old Feature'],
      limits: baseLimits,
      isActive: true,
      displayOrder: 1,
    };
    planRepo.findOne.mockResolvedValue(existingPlan);

    const updated = await service.updatePlan(
      'plan-1',
      { priceMinor: 129900, isActive: false },
      'admin-1',
    );

    expect(updated.priceMinor).toBe(129900);
    expect(updated.isActive).toBe(false);
    // Verify SubscriptionEntity was NEVER saved/modified in updatePlan transaction
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE_SUBSCRIPTION_PLAN',
        oldData: expect.objectContaining({ priceMinor: 99900, isActive: true }),
        newData: expect.objectContaining({ priceMinor: 129900, isActive: false }),
      }),
    );
  });

  it('throws NotFoundException when getting or updating unknown plan', async () => {
    const { service, planRepo } = setup();
    planRepo.findOne.mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    await expect(service.updatePlan('missing', { isActive: false })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('auto-generates system bullet features when features array is omitted on createPlan', async () => {
    const { service, planRepo } = setup();
    planRepo.findOne.mockResolvedValue(null);

    const created = await service.createPlan(
      {
        code: 'SYSTEM_AUTO',
        name: 'System Auto Plan',
        price: 1999,
        billingInterval: BillingInterval.QUARTERLY,
        durationDays: 90,
        limits: { ...baseLimits, featuredListing: true, maxProducts: 50 },
      },
      'admin-1',
    );

    expect(created.features.length).toBeGreaterThanOrEqual(5);
    expect(created.features.some((f) => /50 product catalog entries/i.test(f))).toBe(true);
    expect(created.features.some((f) => /Featured placement/i.test(f))).toBe(true);
  });

  it('generates missing Mercora system plans and syncs modules on existing ones without altering prices', async () => {
    const { service, planRepo, auditService } = setup();
    const existingStarter = {
      id: 'p-starter',
      code: 'STARTER_MONTHLY',
      name: 'Starter Plan',
      priceMinor: 88800, // custom admin price must remain untouched
      durationDays: 30,
      limits: baseLimits,
      features: [],
      isActive: true,
    };

    planRepo.findOne.mockImplementation(async ({ where }: any) =>
      where?.code === 'STARTER_MONTHLY' ? existingStarter : null,
    );
    planRepo.find.mockResolvedValue([existingStarter]);

    const res = await service.generateSystemPlans(
      { codes: ['STARTER_MONTHLY', 'GROWTH_SIX_MONTHS'], syncFeatureGroups: true },
      'admin-1',
    );

    expect(res.createdCount).toBe(1);
    expect(res.updatedCount).toBe(1);
    expect(existingStarter.priceMinor).toBe(88800);
    expect(existingStarter.features.length).toBeGreaterThan(0);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GENERATE_SUBSCRIPTION_SYSTEM_PLANS', userId: 'admin-1' }),
    );
  });
});
