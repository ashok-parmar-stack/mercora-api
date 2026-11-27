import * as crypto from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PaymentService } from '../../../src/modules/subscriptions/services/payment.service';
import { SubscriptionLifecycleService } from '../../../src/modules/subscriptions/services/subscription-lifecycle.service';
import { RazorpayGatewayAdapter } from '../../../src/modules/subscriptions/gateways/razorpay-gateway.adapter';
import { PaymentGatewayRegistry } from '../../../src/modules/subscriptions/gateways/payment-gateway.registry';
import {
  PaymentGateway,
  PaymentStatus,
  PaymentType,
  SubscriptionStatus,
} from '../../../src/modules/subscriptions/subscription.constants';

describe('Razorpay Adapter, Payment Order & Verification (Unit - Section 14B & 14C)', () => {
  const keySecret = 'rzp_test_secret_unit_12345';
  const webhookSecret = 'whsec_test_unit_67890';

  function createAdapter() {
    const configService: any = {
      get: (k: string) => {
        if (k === 'razorpay.keyId') return 'rzp_test_key123';
        if (k === 'razorpay.keySecret') return keySecret;
        if (k === 'razorpay.webhookSecret') return webhookSecret;
        return undefined;
      },
    };
    return new RazorpayGatewayAdapter(configService);
  }

  function signCheckout(orderId: string, paymentId: string) {
    return crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
  }

  it('verifies valid HMAC-SHA256 checkout signature and rejects tampered signatures', () => {
    const adapter = createAdapter();
    const orderId = 'order_RzpTest001';
    const paymentId = 'pay_RzpTest001';
    const validSig = signCheckout(orderId, paymentId);

    expect(adapter.verifyCheckoutSignature({ orderId, paymentId, signature: validSig })).toBe(
      true,
    );
    expect(
      adapter.verifyCheckoutSignature({
        orderId,
        paymentId,
        signature: validSig.replace(/^./, validSig[0] === 'a' ? 'b' : 'a'),
      }),
    ).toBe(false);
  });

  describe('createOrderFlow server-side computation & safety', () => {
    function setupLifecycle(overrides?: { gatewayAdapter?: any; plan?: any; owned?: any[] }) {
      const planRepo: any = {
        findOne: jest.fn().mockResolvedValue(
          overrides?.plan ?? {
            id: 'plan-1',
            code: 'PRO_QUARTERLY',
            name: 'Pro Quarterly',
            priceMinor: 249900,
            gstRateBps: 1800,
            currency: 'INR',
            billingInterval: 'QUARTERLY',
            durationDays: 90,
            isActive: true,
            features: ['Priority Search'],
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
        ),
      };
      const settingsRepo: any = {
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
          invoicePrefix: 'MERC',
          companyLegalName: 'Mercora Pvt Ltd',
          companyGstin: '24AAACM0000A1Z5',
          companyState: 'Gujarat',
          companyAddress: 'Ahmedabad',
          sacCode: '998314',
        }),
      };
      const subscriptionRepo: any = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      const paymentQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      const paymentRepo: any = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(async (p) => p),
        createQueryBuilder: jest.fn(() => paymentQb),
      };
      const attemptRepo: any = {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((v) => v),
        save: jest.fn(async (v) => v),
      };
      const manager: any = {
        create: jest.fn((_cls, data) => ({ id: 'generated-uuid', ...data })),
        save: jest.fn(async (_cls, data) => ({ id: data.id || 'saved-uuid', ...data })),
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
      const adapter: any =
        overrides?.gatewayAdapter ?? {
          gatewayCode: PaymentGateway.RAZORPAY,
          isConfigured: () => true,
          getPublicConfig: () => ({
            gateway: PaymentGateway.RAZORPAY,
            enabled: true,
            configured: true,
            keyId: 'rzp_test_public_only',
            mode: 'test',
          }),
          createOrder: jest.fn().mockResolvedValue({
            gateway: PaymentGateway.RAZORPAY,
            orderId: 'order_ServerCreated999',
            amountMinor: 294882,
            currency: 'INR',
            receipt: 'rcpt_123',
            status: 'created',
            rawSanitized: { id: 'order_ServerCreated999' },
          }),
        };
      const registry = new PaymentGatewayRegistry(adapter);
      const invoiceService: any = {
        computeGstBreakdown: jest.fn((subtotal: number, gstBps: number) => {
          const taxMinor = Math.round((subtotal * gstBps) / 10000);
          return {
            subtotalMinor: subtotal,
            taxMinor,
            cgstMinor: Math.floor(taxMinor / 2),
            sgstMinor: taxMinor - Math.floor(taxMinor / 2),
            igstMinor: 0,
            totalMinor: subtotal + taxMinor,
          };
        }),
      };
      const entitlementService: any = {
        resolveBillingTarget: jest.fn().mockResolvedValue({
          business: {
            id: 'biz-1',
            name: 'Apex Manufacturing',
            state: 'Gujarat',
            email: 'owner@apex.in',
            phone: '9876543210',
            gstin: '24AAAAA0000A1Z5',
          },
          allOwned: [],
        }),
        resolveOwnedBusiness: jest.fn().mockResolvedValue({
          business: {
            id: 'biz-1',
            name: 'Apex Manufacturing',
            state: 'Gujarat',
            email: 'owner@apex.in',
            phone: '9876543210',
            gstin: '24AAAAA0000A1Z5',
          },
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
        {} as any,
        {} as any,
        dataSource,
        { get: jest.fn() } as any,
        registry,
        invoiceService,
        entitlementService,
        { sendAsync: jest.fn() } as any,
        { log: jest.fn().mockResolvedValue(undefined) } as any,
      );

      return { service, adapter, paymentRepo, subscriptionRepo, planRepo, entitlementService };
    }

    it('computes GST and payable amount strictly from DB plan (never trusts client price) and omits secrets', async () => {
      const { service, adapter } = setupLifecycle();

      const res = await service.initiateCheckout(
        { id: 'user-1', email: 'owner@apex.in', name: 'Owner', role: 'CUSTOMER' },
        { planId: 'plan-1', businessId: 'biz-1' },
      );

      expect(adapter.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amountMinor: 294882, // 249900 + 18% GST (44982)
          currency: 'INR',
        }),
      );
      expect(res.keyId).toBe('rzp_test_public_only');
      expect(res.orderId).toBe('order_ServerCreated999');
      expect(res.amountMinor).toBe(294882);
      expect(JSON.stringify(res)).not.toContain(keySecret);
      expect(JSON.stringify(res)).not.toContain(webhookSecret);
    });

    it('supports checkout without a directory business using inline optional GSTIN & billing details', async () => {
      const { service, entitlementService, subscriptionRepo: _s } = setupLifecycle();
      entitlementService.resolveBillingTarget.mockResolvedValueOnce({
        business: null,
        allOwned: [],
      });

      const res = await service.initiateCheckout(
        { id: 'user-solo', email: 'solo@mercora.in', name: 'Ashok Parmar', role: 'CUSTOMER' },
        {
          planId: 'plan-1',
          billingDetails: {
            billingName: 'Ashok Exports Pvt Ltd',
            gstin: '24abcde1234f1z5',
            state: 'Maharashtra',
          },
        },
      );

      expect(res.orderId).toBe('order_ServerCreated999');
      expect(res.business.id).toBeNull();
      expect(res.business.name).toBe('Ashok Exports Pvt Ltd');
      expect(res.business.gstin).toBe('24ABCDE1234F1Z5');
      expect(res.business.state).toBe('Maharashtra');
    });

    it('rejects inactive plans cleanly before calling Razorpay', async () => {
      const { service, adapter, planRepo } = setupLifecycle();
      planRepo.findOne.mockResolvedValue({
        id: 'plan-inactive',
        name: 'Legacy Plan',
        isActive: false,
      });

      await expect(
        service.initiateCheckout(
          { id: 'user-1', email: 'owner@apex.in' },
          { planId: 'plan-inactive' },
        ),
      ).rejects.toThrow(BadRequestException);
      expect(adapter.createOrder).not.toHaveBeenCalled();
    });

    it('marks payment attempt as FAILED and propagates error when Razorpay order creation fails', async () => {
      const failingAdapter = {
        gatewayCode: PaymentGateway.RAZORPAY,
        isConfigured: () => true,
        getPublicConfig: () => ({
          gateway: PaymentGateway.RAZORPAY,
          enabled: true,
          configured: true,
          keyId: 'rzp_test_public_only',
          mode: 'test' as const,
        }),
        createOrder: jest
          .fn()
          .mockRejectedValue(new ServiceUnavailableException('Razorpay timeout')),
      };
      const { service, paymentRepo } = setupLifecycle({ gatewayAdapter: failingAdapter });

      await expect(
        service.initiateCheckout(
          { id: 'user-1', email: 'owner@apex.in' },
          { planId: 'plan-1' },
        ),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(paymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: PaymentStatus.FAILED }),
      );
    });
  });

  describe('verifyCheckoutPayment strict server validation (Section 14C)', () => {
    function setupPaymentService() {
      const adapter = createAdapter();
      const fetchPaymentSpy = jest.fn();
      (adapter as any).fetchPayment = fetchPaymentSpy;

      const paymentRepo: any = { findOne: jest.fn(), save: jest.fn(async (p) => p) };
      const attemptRepo: any = {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((v) => v),
        save: jest.fn(async (v) => v),
      };
      const invoiceRepo: any = {
        findOne: jest.fn().mockResolvedValue({ id: 'inv-1', invoiceNumber: 'MERC-001' }),
      };
      const entitlementService: any = {
        findOwnedBusinesses: jest.fn().mockResolvedValue([{ id: 'biz-1' }]),
      };
      const lifecycleService: any = {
        markPaymentFailed: jest.fn().mockResolvedValue(undefined),
        settleCapturedPayment: jest.fn().mockResolvedValue({
          alreadyProcessed: false,
          payment: { id: 'pay-db-1', gatewayPaymentId: 'pay_Rzp1' },
          subscription: {
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
            startsAt: new Date(),
            expiresAt: new Date(),
          },
          invoice: { id: 'inv-1', invoiceNumber: 'MERC-001' },
        }),
      };

      const service = new PaymentService(
        paymentRepo,
        attemptRepo,
        {} as any,
        invoiceRepo,
        {} as any,
        { get: jest.fn() } as any,
        new PaymentGatewayRegistry(adapter as any),
        entitlementService,
        lifecycleService,
        {} as any,
      );

      return { service, paymentRepo, attemptRepo, lifecycleService, fetchPaymentSpy };
    }

    const basePaymentRecord = {
      id: 'pay-db-1',
      businessId: 'biz-1',
      userId: 'user-1',
      subscriptionId: 'sub-1',
      gateway: PaymentGateway.RAZORPAY,
      gatewayOrderId: 'order_Rzp1',
      amountMinor: 117882,
      currency: 'INR',
      paymentStatus: PaymentStatus.CREATED,
      subscription: { id: 'sub-1', status: SubscriptionStatus.PENDING },
    };

    it('rejects tampered signature and logs SIGNATURE_INVALID attempt without activating subscription', async () => {
      const { service, paymentRepo, attemptRepo, lifecycleService } = setupPaymentService();
      paymentRepo.findOne.mockResolvedValue({ ...basePaymentRecord });

      await expect(
        service.verifyCheckoutPayment(
          { id: 'user-1', role: 'CUSTOMER' },
          {
            razorpayOrderId: 'order_Rzp1',
            razorpayPaymentId: 'pay_Rzp1',
            razorpaySignature: 'tampered-signature',
          },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(attemptRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SIGNATURE_INVALID' }),
      );
      expect(lifecycleService.settleCapturedPayment).not.toHaveBeenCalled();
    });

    it('rejects unauthorized caller attempting to verify another business payment', async () => {
      const { service, paymentRepo } = setupPaymentService();
      paymentRepo.findOne.mockResolvedValue({ ...basePaymentRecord, userId: 'other-user', businessId: 'other-biz' });

      await expect(
        service.verifyCheckoutPayment(
          { id: 'attacker-user', role: 'CUSTOMER' },
          {
            razorpayOrderId: 'order_Rzp1',
            razorpayPaymentId: 'pay_Rzp1',
            razorpaySignature: signCheckout('order_Rzp1', 'pay_Rzp1'),
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects gateway amount or currency mismatch even if HMAC signature matches', async () => {
      const { service, paymentRepo, fetchPaymentSpy, lifecycleService } = setupPaymentService();
      paymentRepo.findOne.mockResolvedValue({ ...basePaymentRecord });

      fetchPaymentSpy.mockResolvedValueOnce({
        paymentId: 'pay_Rzp1',
        orderId: 'order_Rzp1',
        amountMinor: 100, // tampered partial amount
        currency: 'INR',
        status: 'captured',
        captured: true,
      });

      await expect(
        service.verifyCheckoutPayment(
          { id: 'user-1', role: 'CUSTOMER' },
          {
            razorpayOrderId: 'order_Rzp1',
            razorpayPaymentId: 'pay_Rzp1',
            razorpaySignature: signCheckout('order_Rzp1', 'pay_Rzp1'),
          },
        ),
      ).rejects.toThrow(BadRequestException);

      fetchPaymentSpy.mockResolvedValueOnce({
        paymentId: 'pay_Rzp1',
        orderId: 'order_Rzp1',
        amountMinor: 117882,
        currency: 'USD', // currency mismatch
        status: 'captured',
        captured: true,
      });

      await expect(
        service.verifyCheckoutPayment(
          { id: 'user-1', role: 'CUSTOMER' },
          {
            razorpayOrderId: 'order_Rzp1',
            razorpayPaymentId: 'pay_Rzp1',
            razorpaySignature: signCheckout('order_Rzp1', 'pay_Rzp1'),
          },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(lifecycleService.settleCapturedPayment).not.toHaveBeenCalled();
    });

    it('does NOT activate subscription when Razorpay payment is authorized but not yet captured', async () => {
      const { service, paymentRepo, fetchPaymentSpy, lifecycleService } = setupPaymentService();
      paymentRepo.findOne.mockResolvedValue({ ...basePaymentRecord });
      fetchPaymentSpy.mockResolvedValue({
        paymentId: 'pay_Rzp1',
        orderId: 'order_Rzp1',
        amountMinor: 117882,
        currency: 'INR',
        status: 'authorized',
        captured: false,
      });

      const res = await service.verifyCheckoutPayment(
        { id: 'user-1', role: 'CUSTOMER' },
        {
          razorpayOrderId: 'order_Rzp1',
          razorpayPaymentId: 'pay_Rzp1',
          razorpaySignature: signCheckout('order_Rzp1', 'pay_Rzp1'),
        },
      );

      expect(res.verified).toBe(false);
      expect(res.pendingCapture).toBe(true);
      expect(res.paymentStatus).toBe(PaymentStatus.AUTHORIZED);
      expect(lifecycleService.settleCapturedPayment).not.toHaveBeenCalled();
    });

    it('settles payment, activates subscription, and returns idempotent alreadyCompleted on replay', async () => {
      const { service, paymentRepo, fetchPaymentSpy, lifecycleService } = setupPaymentService();
      paymentRepo.findOne.mockResolvedValueOnce({ ...basePaymentRecord });
      fetchPaymentSpy.mockResolvedValue({
        paymentId: 'pay_Rzp1',
        orderId: 'order_Rzp1',
        amountMinor: 117882,
        currency: 'INR',
        status: 'captured',
        captured: true,
      });

      const first = await service.verifyCheckoutPayment(
        { id: 'user-1', role: 'CUSTOMER' },
        {
          razorpayOrderId: 'order_Rzp1',
          razorpayPaymentId: 'pay_Rzp1',
          razorpaySignature: signCheckout('order_Rzp1', 'pay_Rzp1'),
        },
      );
      expect(first.verified).toBe(true);
      expect(first.alreadyCompleted).toBe(false);
      expect(lifecycleService.settleCapturedPayment).toHaveBeenCalledTimes(1);

      // Replay after webhook/first verify already captured payment
      paymentRepo.findOne.mockResolvedValueOnce({
        ...basePaymentRecord,
        paymentStatus: PaymentStatus.CAPTURED,
        subscription: { id: 'sub-1', status: SubscriptionStatus.ACTIVE },
      });
      const second = await service.verifyCheckoutPayment(
        { id: 'user-1', role: 'CUSTOMER' },
        {
          razorpayOrderId: 'order_Rzp1',
          razorpayPaymentId: 'pay_Rzp1',
          razorpaySignature: signCheckout('order_Rzp1', 'pay_Rzp1'),
        },
      );
      expect(second.verified).toBe(true);
      expect(second.alreadyCompleted).toBe(true);
      expect(lifecycleService.settleCapturedPayment).toHaveBeenCalledTimes(1);
    });
  });
});
