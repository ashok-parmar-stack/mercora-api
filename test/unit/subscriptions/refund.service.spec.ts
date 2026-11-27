import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RefundService } from '../../../src/modules/subscriptions/services/refund.service';
import { PaymentGatewayRegistry } from '../../../src/modules/subscriptions/gateways/payment-gateway.registry';
import {
  PaymentGateway,
  PaymentStatus,
  RefundStatus,
  SubscriptionStatus,
} from '../../../src/modules/subscriptions/subscription.constants';

describe('RefundService (Unit - Section 14F)', () => {
  function setup() {
    const state: Record<string, any> = {};

    const refundRepo: any = {
      findOne: jest.fn(async () => state.existingRefund || null),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
    };
    const paymentRepo: any = {
      findOne: jest.fn(async () => state.payment),
    };
    const subscriptionRepo: any = { findOne: jest.fn() };
    const invoiceRepo: any = { findOne: jest.fn() };
    const businessRepo: any = { findOne: jest.fn().mockResolvedValue(null) };
    const userRepo: any = { findOne: jest.fn().mockResolvedValue(null) };

    const manager: any = {
      create: jest.fn((_cls, v) => ({ id: 'rfnd-row-1', ...v })),
      save: jest.fn(async (_cls, v) => v),
      findOne: jest.fn(async (cls) => {
        const name = cls?.name || '';
        if (name === 'InvoiceEntity') return state.invoice || null;
        if (name === 'SubscriptionEntity') return state.subscription || null;
        if (name === 'RefundEntity') return state.webhookRefund || null;
        return null;
      }),
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => state.payment),
      })),
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
      createRefund: jest.fn().mockResolvedValue({
        gateway: PaymentGateway.RAZORPAY,
        refundId: 'rfnd_Rzp123',
        paymentId: 'pay_Rzp1',
        amountMinor: 117882,
        currency: 'INR',
        status: 'processed',
        rawSanitized: {},
      }),
    };
    const lifecycleService: any = {
      getPaymentSettings: jest.fn().mockResolvedValue({ refundRevokesAccess: true }),
      writeSubAudit: jest.fn().mockResolvedValue(undefined),
    };

    const service = new RefundService(
      refundRepo,
      paymentRepo,
      subscriptionRepo,
      invoiceRepo,
      businessRepo,
      userRepo,
      dataSource,
      { get: jest.fn().mockReturnValue('http://localhost:9000') } as any,
      new PaymentGatewayRegistry(adapter),
      lifecycleService,
      { sendAsync: jest.fn() } as any,
      { log: jest.fn().mockResolvedValue(undefined) } as any,
    );

    return { service, state, adapter, refundRepo, manager, lifecycleService };
  }

  it('initiates full refund, updates payment & invoice to REFUNDED, and revokes active subscription', async () => {
    const { service, state } = setup();
    const initialExpires = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    state.payment = {
      id: 'pay-1',
      subscriptionId: 'sub-1',
      businessId: 'biz-1',
      userId: 'usr-1',
      gateway: PaymentGateway.RAZORPAY,
      gatewayPaymentId: 'pay_Rzp1',
      amountMinor: 117882,
      refundedAmountMinor: 0,
      currency: 'INR',
      paymentStatus: PaymentStatus.CAPTURED,
    };
    state.invoice = { id: 'inv-1', paymentId: 'pay-1', status: 'PAID' };
    state.subscription = {
      id: 'sub-1',
      businessId: 'biz-1',
      status: SubscriptionStatus.ACTIVE,
      expiresAt: initialExpires,
    };

    const res = await service.initiateRefund(
      'pay-1',
      { reason: 'Customer requested cancellation within policy' },
      'super-admin-1',
    );

    expect(res.duplicate).toBe(false);
    expect(state.payment.paymentStatus).toBe(PaymentStatus.REFUNDED);
    expect(state.payment.refundedAmountMinor).toBe(117882);
    expect(state.invoice.status).toBe('REFUNDED');
    expect(state.subscription.status).toBe(SubscriptionStatus.CANCELLED);
    // Refund policy must never extend subscription validity
    expect(state.subscription.expiresAt).toBe(initialExpires);
  });

  it('handles partial refund without revoking subscription access and rejects excess amounts', async () => {
    const { service, state, adapter } = setup();
    state.payment = {
      id: 'pay-2',
      subscriptionId: 'sub-2',
      businessId: 'biz-1',
      userId: 'usr-1',
      gateway: PaymentGateway.RAZORPAY,
      gatewayPaymentId: 'pay_Rzp2',
      amountMinor: 100000,
      refundedAmountMinor: 0,
      currency: 'INR',
      paymentStatus: PaymentStatus.CAPTURED,
    };
    state.subscription = { id: 'sub-2', businessId: 'biz-1', status: SubscriptionStatus.ACTIVE };

    adapter.createRefund.mockResolvedValueOnce({
      gateway: PaymentGateway.RAZORPAY,
      refundId: 'rfnd_partial_1',
      paymentId: 'pay_Rzp2',
      amountMinor: 40000,
      currency: 'INR',
      status: 'processed',
      rawSanitized: {},
    });

    await service.initiateRefund('pay-2', { amountMinor: 40000, reason: 'Partial credit' }, 'admin-1');
    expect(state.payment.paymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(state.payment.refundedAmountMinor).toBe(40000);
    expect(state.subscription.status).toBe(SubscriptionStatus.ACTIVE);

    // Remaining refundable is 60000 -> 70000 must fail
    await expect(
      service.initiateRefund('pay-2', { amountMinor: 70000, reason: 'Over-refund attempt' }, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects refunding uncaptured payment, duplicate in-progress refund, or gateway failures cleanly', async () => {
    const { service, state, adapter, refundRepo } = setup();

    state.payment = {
      id: 'pay-created',
      paymentStatus: PaymentStatus.CREATED,
      gatewayPaymentId: null,
      amountMinor: 100000,
      refundedAmountMinor: 0,
    };
    await expect(
      service.initiateRefund('pay-created', { reason: 'Not paid' }, 'admin-1'),
    ).rejects.toThrow(BadRequestException);

    // Captured but already fully refunded
    state.payment = {
      id: 'pay-full',
      paymentStatus: PaymentStatus.CAPTURED,
      gatewayPaymentId: 'pay_RzpFull',
      amountMinor: 100000,
      refundedAmountMinor: 100000,
    };
    await expect(
      service.initiateRefund('pay-full', { reason: 'Double refund' }, 'admin-1'),
    ).rejects.toThrow(ConflictException);

    // Gateway failure should propagate ServiceUnavailableException without changing local paid status
    state.payment = {
      id: 'pay-ok',
      paymentStatus: PaymentStatus.CAPTURED,
      gateway: PaymentGateway.RAZORPAY,
      gatewayPaymentId: 'pay_RzpOk',
      amountMinor: 100000,
      refundedAmountMinor: 0,
    };
    refundRepo.findOne.mockResolvedValue(null);
    adapter.createRefund.mockRejectedValueOnce(new ServiceUnavailableException('Razorpay down'));
    await expect(
      service.initiateRefund('pay-ok', { reason: 'Retry refund' }, 'admin-1'),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(state.payment.paymentStatus).toBe(PaymentStatus.CAPTURED);
  });

  it('synchronizes refund.created and refund.processed webhooks and rolls back failed refund balance', async () => {
    const { service, state } = setup();
    state.payment = {
      id: 'pay-w1',
      subscriptionId: 'sub-w1',
      businessId: 'biz-1',
      userId: 'usr-1',
      gateway: PaymentGateway.RAZORPAY,
      gatewayPaymentId: 'pay_RzpW1',
      amountMinor: 100000,
      refundedAmountMinor: 0,
      currency: 'INR',
      paymentStatus: PaymentStatus.CAPTURED,
    };

    await service.syncRefundFromWebhook({
      gateway: PaymentGateway.RAZORPAY,
      gatewayEventId: 'evt_r_1',
      eventType: 'refund.created',
      orderId: 'order_1',
      paymentId: 'pay_RzpW1',
      refundId: 'rfnd_W1',
      amountMinor: 50000,
      currency: 'INR',
      status: 'pending',
      redactedPayload: {},
    });
    expect(state.payment.refundedAmountMinor).toBe(50000);
    expect(state.payment.paymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);

    // Simulate refund.failed event rolling back previous pending deduction
    state.webhookRefund = {
      id: 'rfnd-row-1',
      gatewayRefundId: 'rfnd_W1',
      amountMinor: 50000,
      status: RefundStatus.PENDING,
    };
    await service.syncRefundFromWebhook({
      gateway: PaymentGateway.RAZORPAY,
      gatewayEventId: 'evt_r_fail',
      eventType: 'refund.failed',
      orderId: 'order_1',
      paymentId: 'pay_RzpW1',
      refundId: 'rfnd_W1',
      amountMinor: 50000,
      currency: 'INR',
      status: 'failed',
      errorDescription: 'Bank declined refund',
      redactedPayload: {},
    });
    expect(state.payment.refundedAmountMinor).toBe(0);
    expect(state.payment.paymentStatus).toBe(PaymentStatus.CAPTURED);
  });
});
