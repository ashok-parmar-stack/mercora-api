import * as crypto from 'crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { WebhookService } from '../../../src/modules/subscriptions/services/webhook.service';
import { RazorpayGatewayAdapter } from '../../../src/modules/subscriptions/gateways/razorpay-gateway.adapter';
import { PaymentGatewayRegistry } from '../../../src/modules/subscriptions/gateways/payment-gateway.registry';
import {
  PaymentGateway,
  WebhookProcessingStatus,
} from '../../../src/modules/subscriptions/subscription.constants';

describe('WebhookService (Unit - Section 14D)', () => {
  const webhookSecret = 'whsec_test_secret_987';
  const keySecret = 'rzp_test_key_secret_987';

  function signRaw(raw: string) {
    return crypto.createHmac('sha256', webhookSecret).update(Buffer.from(raw, 'utf8')).digest('hex');
  }

  function setup(options?: { configured?: boolean }) {
    const adapter = new RazorpayGatewayAdapter({
      get: (k: string) => {
        if (k === 'razorpay.keyId') return options?.configured === false ? '' : 'rzp_test_123';
        if (k === 'razorpay.keySecret') return options?.configured === false ? '' : keySecret;
        if (k === 'razorpay.webhookSecret') return webhookSecret;
        return undefined;
      },
    } as any);

    const savedEvents = new Map<string, any>();
    const webhookRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        return savedEvents.get(`${where.gateway}:${where.gatewayEventId}`) || null;
      }),
      create: jest.fn((v) => ({ id: `ev-row-${savedEvents.size + 1}`, ...v })),
      save: jest.fn(async (v) => {
        savedEvents.set(`${v.gateway}:${v.gatewayEventId}`, v);
        return v;
      }),
      createQueryBuilder: jest.fn(() => {
        const list = Array.from(savedEvents.values()).filter(
          (e) => e.processingStatus === WebhookProcessingStatus.FAILED && e.signatureValid,
        );
        return {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue(list),
        };
      }),
    };

    const paymentRepo: any = {
      findOne: jest.fn().mockResolvedValue({
        id: 'pay-1',
        gateway: PaymentGateway.RAZORPAY,
        gatewayOrderId: 'order_100',
        gatewayPaymentId: 'pay_100',
        amountMinor: 117882,
        currency: 'INR',
      }),
    };

    const lifecycleService: any = {
      settleCapturedPayment: jest.fn().mockResolvedValue({ alreadyProcessed: false }),
      markPaymentFailed: jest.fn().mockResolvedValue({ id: 'pay-1' }),
    };

    const refundService: any = {
      syncRefundFromWebhook: jest.fn().mockResolvedValue(undefined),
    };

    const service = new WebhookService(
      webhookRepo,
      paymentRepo,
      new PaymentGatewayRegistry(adapter),
      lifecycleService,
      refundService,
    );

    return { service, webhookRepo, paymentRepo, lifecycleService, refundService, savedEvents };
  }

  it('rejects missing raw body and missing or invalid X-Razorpay-Signature', async () => {
    const { service } = setup();
    const raw = JSON.stringify({ event: 'payment.captured' });

    await expect(
      service.handleRazorpayWebhook({ rawBody: undefined, signature: signRaw(raw), headers: {} }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.handleRazorpayWebhook({ rawBody: raw, signature: '', headers: {} }),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      service.handleRazorpayWebhook({ rawBody: raw, signature: 'bad_hmac_sig', headers: {} }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('processes signed payment.captured once and deduplicates identical webhook replays', async () => {
    const { service, lifecycleService } = setup({ configured: false });
    const raw = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_100',
            order_id: 'order_100',
            amount: 117882,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
            captured: true,
          },
        },
      },
    });
    const sig = signRaw(raw);
    const headers = { 'x-razorpay-event-id': 'evt_cap_100' };

    const first = await service.handleRazorpayWebhook({ rawBody: Buffer.from(raw), signature: sig, headers });
    expect(first).toEqual({ status: 'ok', duplicate: false, eventId: 'evt_cap_100' });
    expect(lifecycleService.settleCapturedPayment).toHaveBeenCalledTimes(1);

    const replay = await service.handleRazorpayWebhook({ rawBody: Buffer.from(raw), signature: sig, headers });
    expect(replay).toEqual({ status: 'ok', duplicate: true, eventId: 'evt_cap_100' });
    expect(lifecycleService.settleCapturedPayment).toHaveBeenCalledTimes(1);
  });

  it('routes payment.failed and refund.processed events to appropriate handlers', async () => {
    const { service, lifecycleService, refundService } = setup({ configured: false });

    const failRaw = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_fail_1',
            order_id: 'order_100',
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'Payment declined by bank',
          },
        },
      },
    });
    await service.handleRazorpayWebhook({
      rawBody: failRaw,
      signature: signRaw(failRaw),
      headers: { 'x-razorpay-event-id': 'evt_fail_1' },
    });
    expect(lifecycleService.markPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayOrderId: 'order_100',
        gatewayPaymentId: 'pay_fail_1',
        failureReason: 'Payment declined by bank',
      }),
    );

    const refundRaw = JSON.stringify({
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_100',
            payment_id: 'pay_100',
            amount: 117882,
            currency: 'INR',
            status: 'processed',
          },
        },
      },
    });
    await service.handleRazorpayWebhook({
      rawBody: refundRaw,
      signature: signRaw(refundRaw),
      headers: { 'x-razorpay-event-id': 'evt_refund_1' },
    });
    expect(refundService.syncRefundFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'refund.processed',
        refundId: 'rfnd_100',
        paymentId: 'pay_100',
      }),
    );
  });

  it('marks failed webhook for recovery on transient error and succeeds on retryFailedWebhookEvents', async () => {
    const { service, lifecycleService, savedEvents } = setup({ configured: false });
    const raw = JSON.stringify({
      event: 'order.paid',
      payload: {
        order: { entity: { id: 'order_100', amount: 117882, currency: 'INR', status: 'paid' } },
        payment: { entity: { id: 'pay_100', order_id: 'order_100', amount: 117882, status: 'captured', captured: true } },
      },
    });

    lifecycleService.settleCapturedPayment.mockRejectedValueOnce(new Error('DB transient error'));

    await expect(
      service.handleRazorpayWebhook({
        rawBody: raw,
        signature: signRaw(raw),
        headers: { 'x-razorpay-event-id': 'evt_retry_1' },
      }),
    ).rejects.toThrow('DB transient error');

    const failedRow = savedEvents.get('RAZORPAY:evt_retry_1');
    expect(failedRow.processingStatus).toBe(WebhookProcessingStatus.FAILED);
    expect(failedRow.retryCount).toBe(1);

    lifecycleService.settleCapturedPayment.mockResolvedValueOnce({ alreadyProcessed: false });
    const retryResult = await service.retryFailedWebhookEvents(5);
    expect(retryResult).toEqual({ attempted: 1, recovered: 1 });
    expect(lifecycleService.settleCapturedPayment).toHaveBeenCalledTimes(2);
    expect(failedRow.processingStatus).toBe(WebhookProcessingStatus.PROCESSED);
  });
});
