import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubscriptionLifecycleService } from '../../../src/modules/subscriptions/services/subscription-lifecycle.service';
import { PaymentGatewayRegistry } from '../../../src/modules/subscriptions/gateways/payment-gateway.registry';
import {
  PaymentGateway,
  PaymentStatus,
  PaymentType,
  SubscriptionStatus,
} from '../../../src/modules/subscriptions/subscription.constants';

describe('SubscriptionLifecycleService (Unit - Section 14E)', () => {
  const starterSnapshot = {
    planId: 'plan-starter',
    code: 'STARTER_MONTHLY',
    name: 'Starter Monthly',
    priceMinor: 99900,
    currency: 'INR',
    billingInterval: 'MONTHLY',
    durationDays: 30,
    gstRateBps: 1800,
    features: ['F1'],
    limits: {
      maxBusinessListings: 1,
      maxProducts: 15,
      maxEnquiriesPerMonth: 40,
      maxContacts: 2,
      featuredListing: false,
      verifiedPriority: false,
      leadInboxAccess: true,
      analyticsAccess: false,
      prioritySupport: false,
    },
    capturedAt: '2026-01-01T00:00:00.000Z',
  };

  function setup() {
    const planRepo: any = { findOne: jest.fn() };
    const subscriptionRepo: any = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const paymentRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (p) => p),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };
    const attemptRepo: any = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
    };
    const settingsRepo: any = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
      findOne: jest.fn().mockResolvedValue({
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
      }),
    };
    const businessRepo: any = { findOne: jest.fn().mockResolvedValue({ id: 'biz-1', name: 'Apex Steel', state: 'Gujarat' }) };
    const userRepo: any = { findOne: jest.fn().mockResolvedValue({ id: 'user-1', name: 'Alice', email: 'alice@apex.in' }) };

    const savedEntities: any[] = [];
    const managerState: Record<string, any> = {};
    const manager: any = {
      create: jest.fn((_cls, data) => ({ id: `id-${savedEntities.length + 1}`, ...data })),
      save: jest.fn(async (_cls, data) => {
        savedEntities.push(data);
        return data;
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn((entityCls) => {
        const name = entityCls?.name || '';
        const qb: any = {
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn(async () => {
            if (name === 'PaymentEntity') return managerState.payment;
            if (name === 'SubscriptionEntity') return managerState.subscription;
            return null;
          }),
          getMany: jest.fn(async () => managerState.existingActive || []),
        };
        return qb;
      }),
    };

    const dataSource: any = {
      createQueryRunner: jest.fn(() => ({
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager,
      })),
    };

    const adapter: any = {
      gatewayCode: PaymentGateway.RAZORPAY,
      isConfigured: () => true,
      getPublicConfig: () => ({
        gateway: PaymentGateway.RAZORPAY,
        enabled: true,
        configured: true,
        keyId: 'rzp_test_1',
        mode: 'test',
      }),
      createOrder: jest.fn().mockResolvedValue({
        gateway: PaymentGateway.RAZORPAY,
        orderId: 'order_Lifecycle_1',
        amountMinor: 100000,
        currency: 'INR',
        status: 'created',
        rawSanitized: {},
      }),
    };

    const invoiceService: any = {
      computeGstBreakdown: jest.fn((sub: number, bps: number) => {
        const tax = Math.round((sub * bps) / 10000);
        return {
          subtotalMinor: sub,
          taxMinor: tax,
          cgstMinor: Math.floor(tax / 2),
          sgstMinor: tax - Math.floor(tax / 2),
          igstMinor: 0,
          totalMinor: sub + tax,
        };
      }),
      ensureInvoiceForCapturedPayment: jest
        .fn()
        .mockResolvedValue({ id: 'inv-1', invoiceNumber: 'MERC-001' }),
    };

    const entitlementService: any = {
      resolveBillingTarget: jest.fn().mockResolvedValue({
        business: { id: 'biz-1', name: 'Apex Steel', state: 'Gujarat' },
        allOwned: [],
      }),
      resolveOwnedBusiness: jest.fn().mockResolvedValue({
        business: { id: 'biz-1', name: 'Apex Steel', state: 'Gujarat' },
        allOwned: [],
      }),
    };

    const service = new SubscriptionLifecycleService(
      planRepo,
      subscriptionRepo,
      paymentRepo,
      attemptRepo,
      {} as any,
      {} as any,
      settingsRepo,
      businessRepo,
      userRepo,
      dataSource,
      { get: jest.fn().mockReturnValue('http://localhost:9000') } as any,
      new PaymentGatewayRegistry(adapter),
      invoiceService,
      entitlementService,
      { sendAsync: jest.fn() } as any,
      { log: jest.fn().mockResolvedValue(undefined) } as any,
    );

    return {
      service,
      planRepo,
      subscriptionRepo,
      settingsRepo,
      managerState,
      manager,
      adapter,
    };
  }

  it('activates subscription and preserves remaining active days when settling a RENEWAL payment', async () => {
    const { service, managerState } = setup();
    const tenDaysFromNow = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const prevStarted = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);

    managerState.payment = {
      id: 'pay-renew-1',
      businessId: 'biz-1',
      userId: 'user-1',
      subscriptionId: 'sub-new-renew',
      gateway: PaymentGateway.RAZORPAY,
      gatewayOrderId: 'order_renew_1',
      paymentType: PaymentType.RENEWAL,
      amountMinor: 117882,
      currency: 'INR',
      paymentStatus: PaymentStatus.CREATED,
    };
    managerState.subscription = {
      id: 'sub-new-renew',
      businessId: 'biz-1',
      userId: 'user-1',
      planId: 'plan-starter',
      planSnapshot: starterSnapshot, // 30 days
      status: SubscriptionStatus.PENDING,
    };
    managerState.existingActive = [
      {
        id: 'sub-old-active',
        businessId: 'biz-1',
        status: SubscriptionStatus.ACTIVE,
        startsAt: prevStarted,
        expiresAt: tenDaysFromNow,
      },
    ];

    const result = await service.settleCapturedPayment({
      paymentId: 'pay-renew-1',
      gatewayPayment: {
        gateway: PaymentGateway.RAZORPAY,
        paymentId: 'pay_RzpRenew',
        orderId: 'order_renew_1',
        amountMinor: 117882,
        amountRefundedMinor: 0,
        currency: 'INR',
        status: 'captured',
        captured: true,
        rawSanitized: {},
      },
      signatureVerified: true,
      actorType: 'USER' as any,
    });

    expect(result.subscription.status).toBe(SubscriptionStatus.ACTIVE);
    // Expiry should extend 30 days beyond tenDaysFromNow (~40 days total remaining), NOT lose unused 10 days
    const expectedMinExpiry = tenDaysFromNow.getTime() + 29 * 24 * 60 * 60 * 1000;
    expect(new Date(result.subscription.expiresAt!).getTime()).toBeGreaterThan(expectedMinExpiry);
    expect(managerState.existingActive[0].status).toBe(SubscriptionStatus.EXPIRED);
  });

  it('applies backend prorated unused credit on UPGRADE and rejects upgrade to same/lower tier', async () => {
    const { service, planRepo, subscriptionRepo, adapter } = setup();
    const startsAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    subscriptionRepo.findOne.mockResolvedValue({
      id: 'sub-active',
      businessId: 'biz-1',
      planId: 'plan-starter',
      status: SubscriptionStatus.ACTIVE,
      subtotalMinor: 100000,
      planSnapshot: starterSnapshot, // 99900 base
      startsAt,
      expiresAt,
    });

    planRepo.findOne.mockResolvedValue({
      id: 'plan-pro',
      code: 'PRO_MONTHLY',
      name: 'Pro',
      priceMinor: 200000,
      gstRateBps: 1800,
      currency: 'INR',
      billingInterval: 'MONTHLY',
      durationDays: 30,
      isActive: true,
      features: [],
      limits: starterSnapshot.limits,
    });

    const checkout = await service.upgradeSubscription(
      { id: 'user-1', email: 'alice@apex.in' },
      { targetPlanId: 'plan-pro', businessId: 'biz-1' },
    );

    expect(checkout.prorationCreditMinor).toBeGreaterThan(45000);
    expect(checkout.subtotalMinor).toBeLessThan(200000);
    expect(adapter.createOrder).toHaveBeenCalled();

    // Reject same plan
    await expect(
      service.upgradeSubscription(
        { id: 'user-1', email: 'alice@apex.in' },
        { targetPlanId: 'plan-starter' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('schedules DOWNGRADE for end of period without removing active entitlements immediately', async () => {
    const { service, planRepo, subscriptionRepo, manager } = setup();
    const expiresAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    const activeSub: any = {
      id: 'sub-pro',
      businessId: 'biz-1',
      planId: 'plan-pro',
      status: SubscriptionStatus.ACTIVE,
      subtotalMinor: 200000,
      planSnapshot: { ...starterSnapshot, planId: 'plan-pro', priceMinor: 200000 },
      expiresAt,
    };
    subscriptionRepo.findOne.mockResolvedValue(activeSub);
    planRepo.findOne.mockResolvedValue({
      id: 'plan-starter',
      code: 'STARTER_MONTHLY',
      name: 'Starter Monthly',
      priceMinor: 99900,
      gstRateBps: 1800,
      currency: 'INR',
      billingInterval: 'MONTHLY',
      durationDays: 30,
      isActive: true,
      features: ['F1'],
      limits: starterSnapshot.limits,
    });

    const result = await service.scheduleDowngrade(
      { id: 'user-1', email: 'alice@apex.in' },
      { targetPlanId: 'plan-starter' },
    );

    expect(result.effectiveWhen).toBe('PERIOD_END');
    // Current active planId remains unchanged until renewal/period end
    expect(activeSub.planId).toBe('plan-pro');
    expect(activeSub.scheduledPlanId).toBe('plan-starter');
    expect(manager.save).toHaveBeenCalled();
  });

  it('supports cancel at period end and immediate cancellation', async () => {
    const { service, subscriptionRepo, manager } = setup();
    const activeSub: any = {
      id: 'sub-active',
      businessId: 'biz-1',
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    };
    subscriptionRepo.findOne.mockResolvedValue(activeSub);

    const endCancel = await service.cancelSubscription(
      { id: 'user-1', email: 'alice@apex.in' },
      { cancelAtPeriodEnd: true, reason: 'Switching seasonally' },
    );
    expect(endCancel.status).toBe(SubscriptionStatus.ACTIVE);
    expect(endCancel.cancelAtPeriodEnd).toBe(true);

    const immediateCancel = await service.cancelSubscription(
      { id: 'user-1', email: 'alice@apex.in' },
      { cancelAtPeriodEnd: false, reason: 'No longer needed' },
    );
    expect(immediateCancel.status).toBe(SubscriptionStatus.CANCELLED);
    expect(manager.save).toHaveBeenCalled();

    subscriptionRepo.findOne.mockResolvedValue(null);
    await expect(
      service.cancelSubscription({ id: 'user-1', email: 'alice@apex.in' }, {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('expires past-due / ended active subscriptions during runLifecycleSweep according to gracePeriodDays', async () => {
    const { service, subscriptionRepo, settingsRepo, managerState } = setup();
    const expiredSub = {
      id: 'sub-ended',
      businessId: 'biz-1',
      userId: 'user-1',
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      expiresAt: new Date(Date.now() - 3600_000),
      planSnapshot: starterSnapshot,
    };
    subscriptionRepo.find.mockResolvedValueOnce([expiredSub]).mockResolvedValueOnce([]);
    managerState.subscription = expiredSub;

    // 0 grace days -> immediate EXPIRED
    settingsRepo.findOne.mockResolvedValueOnce({ gracePeriodDays: 0, expiringReminderDays: 7 });
    const sweep1 = await service.runLifecycleSweep(new Date());
    expect(sweep1.expiredCount).toBe(1);
    expect(expiredSub.status).toBe(SubscriptionStatus.EXPIRED);
  });

  it('persists subscription, scheduler & GST invoice policies directly in PostgreSQL payment_settings', async () => {
    const { service, settingsRepo } = setup();
    const res = await service.updatePaymentSettings(
      {
        defaultGstRateBps: 1800,
        gracePeriodDays: 5,
        expiringReminderDays: 10,
        upgradePolicy: 'END_OF_PERIOD',
        downgradePolicy: 'IMMEDIATE',
        schedulerEnabled: false,
        schedulerIntervalMs: 600000,
        reconcilePendingMinutes: 4,
        invoicePrefix: 'MERC',
        companyLegalName: 'Mercora Technologies Pvt Ltd',
        companyGstin: '24abcde1234f1z5',
        companyState: 'Gujarat',
        companyAddress: 'Ahmedabad, Gujarat, India',
        sacCode: '998314',
      },
      'admin-1',
    );

    expect(settingsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        gracePeriodDays: 5,
        schedulerEnabled: false,
        schedulerIntervalMs: 600000,
        reconcilePendingMinutes: 4,
        companyGstin: '24ABCDE1234F1Z5',
        invoicePrefix: 'MERC',
      }),
    );
    expect(res.settings.schedulerEnabled).toBe(false);
    expect(res.settings.schedulerIntervalMs).toBe(600000);
    expect(res.settings.reconcilePendingMinutes).toBe(4);
  });
});
