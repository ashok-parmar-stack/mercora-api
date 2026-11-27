import * as crypto from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

import { configureApp } from '../../src/bootstrap/configure-app';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { PermissionResolverService } from '../../src/database/permission-resolver.service';
import { SubscriptionPlansController } from '../../src/modules/subscriptions/controllers/subscription-plans.controller';
import { SubscriptionsController } from '../../src/modules/subscriptions/controllers/subscriptions.controller';
import { PaymentsController } from '../../src/modules/subscriptions/controllers/payments.controller';
import { InvoicesController } from '../../src/modules/subscriptions/controllers/invoices.controller';
import { WebhooksController } from '../../src/modules/subscriptions/controllers/webhooks.controller';
import { AdminPaymentsController } from '../../src/modules/subscriptions/controllers/admin-payments.controller';
import { SubscriptionPlansService } from '../../src/modules/subscriptions/services/subscription-plans.service';
import { SubscriptionLifecycleService } from '../../src/modules/subscriptions/services/subscription-lifecycle.service';
import { SubscriptionEntitlementService } from '../../src/modules/subscriptions/services/subscription-entitlement.service';
import { PaymentService } from '../../src/modules/subscriptions/services/payment.service';
import { InvoiceService } from '../../src/modules/subscriptions/services/invoice.service';
import { WebhookService } from '../../src/modules/subscriptions/services/webhook.service';
import { RefundService } from '../../src/modules/subscriptions/services/refund.service';
import { PaymentAnalyticsService } from '../../src/modules/subscriptions/services/payment-analytics.service';
import { SubscriptionSchedulerService } from '../../src/modules/subscriptions/services/subscription-scheduler.service';
import { RazorpayGatewayAdapter } from '../../src/modules/subscriptions/gateways/razorpay-gateway.adapter';
import { PaymentGatewayRegistry } from '../../src/modules/subscriptions/gateways/payment-gateway.registry';
import { InvoiceEntity } from '../../src/modules/subscriptions/entities/invoice.entity';
import { PaymentWebhookEventEntity } from '../../src/modules/subscriptions/entities/payment-webhook-event.entity';
import { PaymentEntity } from '../../src/modules/subscriptions/entities/payment.entity';

describe('Subscriptions & Razorpay Payment Module (Integration / Supertest - Section 14H & I)', () => {
  let app: INestApplication;

  const webhookSecret = 'whsec_int_test_secret_123';
  const planUuid = '11111111-1111-4111-8111-111111111111';
  const paymentUuid = '22222222-2222-4222-8222-222222222222';
  const subscriptionUuid = '33333333-3333-4333-8333-333333333333';
  const invoiceUuid = '44444444-4444-4444-8444-444444444444';

  const processedEvents = new Set<string>();

  const mockPlansService = {
    findActivePlans: jest.fn().mockResolvedValue([
      {
        id: planUuid,
        code: 'PRO_QUARTERLY',
        name: 'Pro Quarterly',
        price: 2499,
        priceMinor: 249900,
        currency: 'INR',
        billingInterval: 'QUARTERLY',
        durationDays: 90,
        gstRateBps: 1800,
        taxMinor: 44982,
        totalPriceMinor: 294882,
        totalPrice: 2948.82,
        features: ['Featured'],
        limits: { maxBusinessListings: 3, maxProducts: 50 },
        isActive: true,
        displayOrder: 2,
      },
    ]),
    findById: jest.fn(),
    findAllAdmin: jest.fn().mockResolvedValue([]),
    createPlan: jest.fn(),
    updatePlan: jest.fn(),
    getPlanSubscribers: jest.fn(),
  };

  const mockLifecycleService = {
    getCurrentSubscriptionOverview: jest.fn().mockResolvedValue({
      hasBusiness: true,
      subscription: { id: subscriptionUuid, status: 'ACTIVE', amountMinor: 294882 },
    }),
    getSubscriptionHistory: jest.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } }),
    initiateCheckout: jest.fn().mockResolvedValue({
      reused: false,
      subscriptionId: subscriptionUuid,
      paymentId: paymentUuid,
      gateway: 'RAZORPAY',
      keyId: 'rzp_test_int_key',
      orderId: 'order_IntTest001',
      currency: 'INR',
      amountMinor: 294882,
      amount: 2948.82,
    }),
    renewSubscription: jest.fn(),
    upgradeSubscription: jest.fn(),
    scheduleDowngrade: jest.fn(),
    cancelSubscription: jest.fn(),
    listAdminSubscriptions: jest.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } }),
    getAdminSubscriptionById: jest.fn(),
    adminUpdateSubscription: jest.fn().mockResolvedValue({ id: subscriptionUuid, status: 'ACTIVE' }),
    getAdminPaymentSettingsView: jest.fn().mockResolvedValue({ settings: { razorpayEnabled: true }, gateways: [], razorpayMode: 'test' }),
    updatePaymentSettings: jest.fn().mockResolvedValue({
      settings: {
        razorpayEnabled: true,
        schedulerEnabled: true,
        schedulerIntervalMs: 300000,
        reconcilePendingMinutes: 2,
      },
      gateways: [],
      razorpayMode: 'test',
    }),
    settleCapturedPayment: jest.fn().mockResolvedValue({ alreadyProcessed: false }),
    markPaymentFailed: jest.fn().mockResolvedValue({ id: paymentUuid }),
  };

  const mockPaymentService = {
    createOrder: jest.fn(),
    verifyCheckoutPayment: jest.fn().mockResolvedValue({
      verified: true,
      alreadyCompleted: false,
      paymentStatus: 'CAPTURED',
      paymentId: paymentUuid,
      subscriptionId: subscriptionUuid,
      subscriptionStatus: 'ACTIVE',
      invoiceId: invoiceUuid,
      invoiceNumber: 'MERC-2026-0001',
    }),
    listBusinessPayments: jest.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } }),
    getAuthorizedPaymentDetails: jest.fn().mockResolvedValue({ id: paymentUuid, paymentStatus: 'CAPTURED' }),
    getPaymentStatus: jest.fn().mockResolvedValue({ paymentId: paymentUuid, paymentStatus: 'CAPTURED', subscriptionStatus: 'ACTIVE' }),
    listAdminPayments: jest.fn().mockResolvedValue({ data: [{ id: paymentUuid, amountMinor: 294882, paymentStatus: 'CAPTURED' }], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }),
    exportAdminPaymentsCsv: jest.fn().mockResolvedValue('Payment ID,Status\n1,CAPTURED'),
  };

  const mockRefundService = {
    initiateRefund: jest.fn().mockResolvedValue({
      duplicate: false,
      refund: { id: 'rfnd-1', status: 'PROCESSED', amountMinor: 294882 },
    }),
    listRefunds: jest.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } }),
    syncRefundFromWebhook: jest.fn().mockResolvedValue(undefined),
  };

  const mockEntitlementService = {
    findOwnedBusinesses: jest.fn().mockResolvedValue([{ id: 'biz-1' }]),
    resolveOwnedBusiness: jest.fn().mockResolvedValue({ business: { id: 'biz-1' }, allOwned: [] }),
    getBusinessEntitlements: jest.fn().mockResolvedValue({ hasActiveSubscription: true, planCode: 'PRO_QUARTERLY' }),
  };

  const sampleInvoiceEntity = {
    id: invoiceUuid,
    invoiceNumber: 'MERC-2026-0001',
    businessId: 'biz-1',
    userId: 'user-customer',
    subscriptionId: subscriptionUuid,
    paymentId: paymentUuid,
    gatewayPaymentId: 'pay_Int001',
    gatewayOrderId: 'order_IntTest001',
    subtotalMinor: 249900,
    taxMinor: 44982,
    cgstMinor: 22491,
    sgstMinor: 22491,
    igstMinor: 0,
    totalMinor: 294882,
    currency: 'INR',
    status: 'PAID',
    sellerDetails: {
      legalName: 'Mercora Technologies Pvt Ltd',
      gstin: '24AAACM0000A1Z5',
      state: 'Gujarat',
      address: 'Ahmedabad',
      sacCode: '998314',
    },
    billingDetails: {
      businessName: 'Apex Industrial Pvt Ltd',
      userEmail: 'owner@apex.in',
      state: 'Gujarat',
      city: 'Ahmedabad',
    },
    lineItems: [
      {
        description: 'Pro Quarterly (90 days)',
        sacCode: '998314',
        quantity: 1,
        unitPriceMinor: 249900,
        taxMinor: 44982,
        totalMinor: 294882,
      },
    ],
    invoiceDate: new Date('2026-06-01T00:00:00.000Z'),
    documentReference: 'rcpt_int_1',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
  };

  beforeAll(async () => {
    const adapter = new RazorpayGatewayAdapter({
      get: (k: string) => {
        if (k === 'razorpay.webhookSecret') return webhookSecret;
        return undefined;
      },
    } as any);

    const webhookRepoMock: any = {
      findOne: jest.fn(async ({ where }: any) => {
        if (processedEvents.has(where.gatewayEventId)) {
          return {
            gateway: where.gateway,
            gatewayEventId: where.gatewayEventId,
            processingStatus: 'PROCESSED',
          };
        }
        return null;
      }),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => {
        if (v.processingStatus === 'PROCESSED') {
          processedEvents.add(v.gatewayEventId);
        }
        return v;
      }),
    };

    const paymentRepoMock: any = {
      findOne: jest.fn().mockResolvedValue({
        id: paymentUuid,
        gateway: 'RAZORPAY',
        gatewayOrderId: 'order_IntTest001',
        gatewayPaymentId: 'pay_Int001',
        amountMinor: 294882,
        currency: 'INR',
      }),
    };

    const invoiceRepoMock: any = {
      findOne: jest.fn().mockResolvedValue(sampleInvoiceEntity),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [
        SubscriptionPlansController,
        SubscriptionsController,
        PaymentsController,
        InvoicesController,
        WebhooksController,
        AdminPaymentsController,
      ],
      providers: [
        Reflector,
        InvoiceService,
        WebhookService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'nodeEnv') return 'test';
              if (key === 'swagger.enabled') return false;
              return undefined;
            },
          },
        },
        { provide: SubscriptionPlansService, useValue: mockPlansService },
        { provide: SubscriptionLifecycleService, useValue: mockLifecycleService },
        { provide: SubscriptionEntitlementService, useValue: mockEntitlementService },
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: RefundService, useValue: mockRefundService },
        {
          provide: PaymentAnalyticsService,
          useValue: { getAdminAnalytics: jest.fn().mockResolvedValue({ kpis: {}, charts: {} }) },
        },
        {
          provide: SubscriptionSchedulerService,
          useValue: {
            runMaintenanceTick: jest.fn().mockResolvedValue({ expired: 0 }),
            reloadSchedule: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: PaymentGatewayRegistry, useValue: new PaymentGatewayRegistry(adapter) },
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepoMock },
        { provide: getRepositoryToken(PaymentWebhookEventEntity), useValue: webhookRepoMock },
        { provide: getRepositoryToken(PaymentEntity), useValue: paymentRepoMock },
        {
          provide: PermissionResolverService,
          useValue: {
            checkUserPermission: jest.fn(async (userId: string, perm: string) => {
              // ADMIN user has VIEW/EXPORT, NOT REFUND or MANAGE_STATUS
              if (userId === 'user-admin-limited') {
                return {
                  hasPermission: ['PAYMENTS.VIEW', 'PAYMENTS.EXPORT', 'SUBSCRIPTIONS.VIEW', 'INVOICES.VIEW'].includes(perm),
                };
              }
              return { hasPermission: false };
            }),
          },
        },
        {
          provide: APP_GUARD,
          useValue: {
            canActivate: (ctx: any) => {
              const req = ctx.switchToHttp().getRequest();
              if (
                req.url.startsWith('/api/v1/subscription-plans') &&
                req.method === 'GET'
              ) {
                return true;
              }
              if (req.url.startsWith('/api/v1/webhooks/razorpay')) {
                return true;
              }
              const auth = req.headers['authorization'];
              if (auth === 'Bearer customer-token') {
                req.user = { id: 'user-customer', email: 'owner@apex.in', role: 'CUSTOMER' };
                return true;
              }
              if (auth === 'Bearer admin-limited-token') {
                req.user = { id: 'user-admin-limited', email: 'admin@mercora.in', role: 'ADMIN' };
                return true;
              }
              if (auth === 'Bearer super-admin-token') {
                req.user = { id: 'user-super', email: 'super@mercora.in', role: 'SUPER_ADMIN' };
                return true;
              }
              return false;
            },
          },
        },
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector) => new RolesGuard(reflector),
          inject: [Reflector],
        },
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector, resolver: PermissionResolverService) =>
            new PermissionsGuard(reflector, resolver),
          inject: [Reflector, PermissionResolverService],
        },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    await configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('allows public plan browsing and requires authentication for checkout', async () => {
    const pub = await request(app.getHttpServer())
      .get('/api/v1/subscription-plans')
      .expect(200);
    expect(pub.body.data).toHaveLength(1);
    expect(pub.body.data[0].code).toBe('PRO_QUARTERLY');

    const unauth = await request(app.getHttpServer())
      .post('/api/v1/subscriptions/checkout')
      .send({ planId: planUuid });
    expect([401, 403]).toContain(unauth.status);
  });

  it('creates Razorpay order on checkout and validates verify DTO', async () => {
    const checkout = await request(app.getHttpServer())
      .post('/api/v1/subscriptions/checkout')
      .set('Authorization', 'Bearer customer-token')
      .send({ planId: planUuid })
      .expect(201);

    expect(checkout.body.data.orderId).toBe('order_IntTest001');
    expect(checkout.body.data.amountMinor).toBe(294882);

    // Validation pipe enforces DTO schema (422)
    await request(app.getHttpServer())
      .post('/api/v1/payments/verify')
      .set('Authorization', 'Bearer customer-token')
      .send({ razorpayOrderId: '' })
      .expect(422);

    const verified = await request(app.getHttpServer())
      .post('/api/v1/payments/verify')
      .set('Authorization', 'Bearer customer-token')
      .send({
        razorpayOrderId: 'order_IntTest001',
        razorpayPaymentId: 'pay_Int001',
        razorpaySignature: 'sig_valid',
      })
      .expect(200);
    expect(verified.body.data.verified).toBe(true);
    expect(verified.body.data.subscriptionStatus).toBe('ACTIVE');
  });

  it('verifies raw-body Razorpay webhook signature and prevents duplicate processing', async () => {
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_Int001',
            order_id: 'order_IntTest001',
            amount: 294882,
            currency: 'INR',
            status: 'captured',
            captured: true,
          },
        },
      },
    });
    const validSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(Buffer.from(payload, 'utf8'))
      .digest('hex');

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', 'invalid_sig')
      .send(payload)
      .expect(401);

    const first = await request(app.getHttpServer())
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', validSig)
      .set('X-Razorpay-Event-Id', 'evt_int_001')
      .send(payload)
      .expect(200);
    expect(first.body.duplicate).toBe(false);

    const dup = await request(app.getHttpServer())
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', validSig)
      .set('X-Razorpay-Event-Id', 'evt_int_001')
      .send(payload)
      .expect(200);
    expect(dup.body.duplicate).toBe(true);
  });

  it('streams a valid PDF tax invoice on GET /api/v1/invoices/:id/download', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceUuid}/download`)
      .set('Authorization', 'Bearer customer-token')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.slice(0, 5).toString('utf8')).toBe('%PDF-');
  });

  it('enforces RBAC & restricted PAYMENTS.REFUND / SUBSCRIPTIONS.MANAGE_STATUS permissions', async () => {
    // Customer blocked from admin endpoints
    await request(app.getHttpServer())
      .get('/api/v1/admin/payments')
      .set('Authorization', 'Bearer customer-token')
      .expect(403);

    // Regular ADMIN without PAYMENTS.REFUND can view payments (200)
    await request(app.getHttpServer())
      .get('/api/v1/admin/payments')
      .set('Authorization', 'Bearer admin-limited-token')
      .expect(200);

    // Regular ADMIN without PAYMENTS.REFUND blocked from refunding (403)
    await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${paymentUuid}/refund`)
      .set('Authorization', 'Bearer admin-limited-token')
      .send({ reason: 'Unauthorized attempt' })
      .expect(403);

    // Regular ADMIN without SUBSCRIPTIONS.MANAGE_STATUS blocked from override (403)
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/subscriptions/${subscriptionUuid}`)
      .set('Authorization', 'Bearer admin-limited-token')
      .send({ status: 'EXPIRED' })
      .expect(403);

    // SUPER_ADMIN allowed on restricted refund & subscription override endpoints
    const refundOk = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${paymentUuid}/refund`)
      .set('Authorization', 'Bearer super-admin-token')
      .send({ reason: 'Approved full refund' })
      .expect(201);
    expect(refundOk.body.data.status).toBe('PROCESSED');

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/subscriptions/${subscriptionUuid}`)
      .set('Authorization', 'Bearer super-admin-token')
      .send({ status: 'ACTIVE', extendDays: 15 })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/api/v1/admin/payment-settings')
      .set('Authorization', 'Bearer super-admin-token')
      .send({ schedulerEnabled: false, schedulerIntervalMs: 600000, reconcilePendingMinutes: 5 })
      .expect(200);
    expect(mockLifecycleService.updatePaymentSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        schedulerEnabled: false,
        schedulerIntervalMs: 600000,
        reconcilePendingMinutes: 5,
      }),
      'user-super',
    );
  });
});
