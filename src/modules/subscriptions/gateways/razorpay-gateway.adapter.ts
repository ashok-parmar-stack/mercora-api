import * as crypto from 'crypto';
import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { MercoraLogger } from '../../../common/logger';
import { sanitizeLogData } from '../../../common/logger/sanitizer.util';
import { PaymentGateway } from '../subscription.constants';
import {
  CreateGatewayOrderInput,
  CreateGatewayOrderResult,
  CreateGatewayRefundInput,
  GatewayOrderDetails,
  GatewayPaymentDetails,
  GatewayPublicConfig,
  GatewayRefundResult,
  IPaymentGatewayAdapter,
  NormalizedWebhookEvent,
  VerifyCheckoutSignatureInput,
} from './payment-gateway.interface';

function timingSafeHexCompare(expectedHex: string, actualHex: string): boolean {
  if (!expectedHex || !actualHex) return false;
  const a = Buffer.from(expectedHex.trim().toLowerCase(), 'utf8');
  const b = Buffer.from(actualHex.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function maskVpa(vpa?: string | null): string | undefined {
  if (!vpa || !vpa.includes('@')) return undefined;
  const [user, handle] = vpa.split('@');
  const prefix = user.length <= 2 ? user[0] || '*' : `${user.slice(0, 2)}***`;
  return `${prefix}@${handle}`;
}

function extractSanitizedMethodDetails(payment: Record<string, any>): Record<string, unknown> | null {
  if (!payment || typeof payment !== 'object') return null;
  const details: Record<string, unknown> = {};
  if (payment.method) details.method = String(payment.method);
  if (payment.bank) details.bank = String(payment.bank);
  if (payment.wallet) details.wallet = String(payment.wallet);
  if (payment.vpa) details.vpaMasked = maskVpa(String(payment.vpa));
  if (payment.card && typeof payment.card === 'object') {
    details.card = {
      network: payment.card.network || null,
      type: payment.card.type || null,
      last4: payment.card.last4 || null,
      issuer: payment.card.issuer || null,
    };
  }
  if (payment.acquirer_data && typeof payment.acquirer_data === 'object') {
    details.acquirerRef =
      payment.acquirer_data.rrn ||
      payment.acquirer_data.upi_transaction_id ||
      payment.acquirer_data.auth_code ||
      null;
  }
  return Object.keys(details).length > 0 ? details : null;
}

function sanitizeGatewayPayload(raw: unknown): Record<string, unknown> {
  const cleaned = sanitizeLogData(raw);
  return cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned)
    ? (cleaned as Record<string, unknown>)
    : { value: cleaned };
}

@Injectable()
export class RazorpayGatewayAdapter implements IPaymentGatewayAdapter {
  readonly gatewayCode = PaymentGateway.RAZORPAY;
  private readonly logger = new MercoraLogger(RazorpayGatewayAdapter.name);
  private client: Razorpay | null = null;
  private lastKeyId = '';
  private lastKeySecret = '';

  constructor(private readonly configService: ConfigService) {}

  private getCredentials(): { keyId: string; keySecret: string; webhookSecret: string } {
    const keyId =
      (this.configService.get<string>('razorpay.keyId') || process.env.RAZORPAY_KEY_ID || '').trim();
    const keySecret =
      (this.configService.get<string>('razorpay.keySecret') || process.env.RAZORPAY_KEY_SECRET || '').trim();
    const webhookSecret =
      (this.configService.get<string>('razorpay.webhookSecret') ||
        process.env.RAZORPAY_WEBHOOK_SECRET ||
        '').trim();
    return { keyId, keySecret, webhookSecret };
  }

  private getClient(): Razorpay {
    const { keyId, keySecret } = this.getCredentials();
    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException(
        'Razorpay gateway credentials are not configured on the server.',
      );
    }

    if (!this.client || this.lastKeyId !== keyId || this.lastKeySecret !== keySecret) {
      this.client = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
      this.lastKeyId = keyId;
      this.lastKeySecret = keySecret;
    }

    return this.client;
  }

  isConfigured(): boolean {
    const { keyId, keySecret } = this.getCredentials();
    return Boolean(keyId && keySecret);
  }

  getPublicConfig(): GatewayPublicConfig {
    const { keyId, keySecret } = this.getCredentials();
    const configured = Boolean(keyId && keySecret);
    const mode: 'test' | 'live' | 'unconfigured' = !configured
      ? 'unconfigured'
      : keyId.startsWith('rzp_live_')
        ? 'live'
        : 'test';

    return {
      gateway: this.gatewayCode,
      enabled: configured,
      configured,
      keyId: configured ? keyId : undefined,
      mode,
    };
  }

  async createOrder(input: CreateGatewayOrderInput): Promise<CreateGatewayOrderResult> {
    const client = this.getClient();
    const amountMinor = Math.trunc(Number(input.amountMinor));
    if (!Number.isFinite(amountMinor) || amountMinor < 100) {
      throw new InternalServerErrorException(
        'Razorpay order amount must be at least 100 paise (INR 1.00).',
      );
    }

    try {
      const order: any = await client.orders.create({
        amount: amountMinor,
        currency: (input.currency || 'INR').toUpperCase(),
        receipt: input.receipt.slice(0, 40),
        notes: input.notes || {},
      });

      this.logger.payment('RAZORPAY_ORDER_CREATED', {
        gateway: this.gatewayCode,
        orderId: order.id,
        amountMinor: Number(order.amount),
        currency: order.currency,
        status: order.status,
      });

      return {
        gateway: this.gatewayCode,
        orderId: String(order.id),
        amountMinor: Number(order.amount),
        currency: String(order.currency || input.currency).toUpperCase(),
        receipt: order.receipt,
        status: String(order.status || 'created'),
        rawSanitized: sanitizeGatewayPayload(order),
      };
    } catch (error: any) {
      const gatewayMsg = error?.error?.description || error?.message || 'Razorpay order creation failed';
      this.logger.error('Razorpay orders.create failed', error, {
        gateway: this.gatewayCode,
        receipt: input.receipt,
        amountMinor,
      });
      throw new ServiceUnavailableException(
        `Unable to initialize Razorpay payment order: ${gatewayMsg}`,
      );
    }
  }

  verifyCheckoutSignature(input: VerifyCheckoutSignatureInput): boolean {
    const { keySecret } = this.getCredentials();
    if (!keySecret || !input.orderId || !input.paymentId || !input.signature) {
      return false;
    }

    const payload = `${input.orderId.trim()}|${input.paymentId.trim()}`;
    const expected = crypto.createHmac('sha256', keySecret).update(payload).digest('hex');
    return timingSafeHexCompare(expected, input.signature);
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const { webhookSecret } = this.getCredentials();
    if (!webhookSecret || !signature || !rawBody) {
      return false;
    }

    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    if (bodyBuffer.length === 0) return false;

    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(bodyBuffer)
      .digest('hex');
    return timingSafeHexCompare(expected, signature);
  }

  async fetchOrder(orderId: string): Promise<GatewayOrderDetails> {
    const client = this.getClient();
    const order: any = await client.orders.fetch(orderId);
    return {
      gateway: this.gatewayCode,
      orderId: String(order.id),
      amountMinor: Number(order.amount),
      amountPaidMinor: Number(order.amount_paid || 0),
      amountDueMinor: Number(order.amount_due || 0),
      currency: String(order.currency || 'INR').toUpperCase(),
      status: String(order.status),
      rawSanitized: sanitizeGatewayPayload(order),
    };
  }

  async fetchOrderPayments(orderId: string): Promise<GatewayPaymentDetails[]> {
    const client = this.getClient();
    const result: any = await client.orders.fetchPayments(orderId);
    const items: any[] = Array.isArray(result?.items) ? result.items : [];
    return items.map((p) => this.mapGatewayPayment(p));
  }

  async fetchPayment(paymentId: string): Promise<GatewayPaymentDetails> {
    const client = this.getClient();
    const payment: any = await client.payments.fetch(paymentId);
    return this.mapGatewayPayment(payment);
  }

  async createRefund(input: CreateGatewayRefundInput): Promise<GatewayRefundResult> {
    const client = this.getClient();
    try {
      const refund: any = await client.payments.refund(input.paymentId, {
        amount: Math.trunc(Number(input.amountMinor)),
        speed: input.speed || 'normal',
        receipt: input.receipt?.slice(0, 40),
        notes: input.notes || {},
      });

      this.logger.payment('RAZORPAY_REFUND_CREATED', {
        gateway: this.gatewayCode,
        paymentId: input.paymentId,
        refundId: refund.id,
        amountMinor: Number(refund.amount),
        currency: refund.currency,
        status: refund.status,
      });

      return {
        gateway: this.gatewayCode,
        refundId: String(refund.id),
        paymentId: String(refund.payment_id || input.paymentId),
        amountMinor: Number(refund.amount),
        currency: String(refund.currency || 'INR').toUpperCase(),
        status: String(refund.status || 'pending'),
        createdAt: refund.created_at ? Number(refund.created_at) : undefined,
        rawSanitized: sanitizeGatewayPayload(refund),
      };
    } catch (error: any) {
      const gatewayMsg = error?.error?.description || error?.message || 'Razorpay refund request failed';
      this.logger.error('Razorpay payments.refund failed', error, {
        gateway: this.gatewayCode,
        paymentId: input.paymentId,
        amountMinor: input.amountMinor,
      });
      throw new ServiceUnavailableException(`Razorpay refund failed: ${gatewayMsg}`);
    }
  }

  async fetchRefund(refundId: string): Promise<GatewayRefundResult> {
    const client = this.getClient();
    const refund: any = await client.refunds.fetch(refundId);
    return {
      gateway: this.gatewayCode,
      refundId: String(refund.id),
      paymentId: String(refund.payment_id),
      amountMinor: Number(refund.amount),
      currency: String(refund.currency || 'INR').toUpperCase(),
      status: String(refund.status || 'pending'),
      createdAt: refund.created_at ? Number(refund.created_at) : undefined,
      rawSanitized: sanitizeGatewayPayload(refund),
    };
  }

  parseWebhookEvent(
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ): NormalizedWebhookEvent {
    const eventType = String(payload?.event || 'unknown');
    const nested = (payload?.payload as Record<string, any>) || {};
    const paymentEntity =
      nested?.payment?.entity || (payload?.payment as Record<string, any>) || null;
    const orderEntity =
      nested?.order?.entity || (payload?.order as Record<string, any>) || null;
    const refundEntity =
      nested?.refund?.entity || (payload?.refund as Record<string, any>) || null;

    const rawHeaderEventId = headers['x-razorpay-event-id'] || headers['X-Razorpay-Event-Id'];
    const headerEventId = Array.isArray(rawHeaderEventId) ? rawHeaderEventId[0] : rawHeaderEventId;

    const orderId =
      paymentEntity?.order_id ||
      orderEntity?.id ||
      null;
    const paymentId =
      paymentEntity?.id ||
      refundEntity?.payment_id ||
      null;
    const refundId = refundEntity?.id || null;

    const gatewayEventId =
      headerEventId?.trim() ||
      crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            eventType,
            accountId: payload?.account_id || null,
            createdAt: payload?.created_at || null,
            orderId,
            paymentId,
            refundId,
            status: refundEntity?.status || paymentEntity?.status || orderEntity?.status || null,
          }),
        )
        .digest('hex');

    const amountMinor =
      refundEntity?.amount ??
      paymentEntity?.amount ??
      orderEntity?.amount ??
      null;

    const currency =
      refundEntity?.currency ||
      paymentEntity?.currency ||
      orderEntity?.currency ||
      'INR';

    return {
      gateway: this.gatewayCode,
      gatewayEventId,
      eventType,
      orderId: orderId ? String(orderId) : null,
      paymentId: paymentId ? String(paymentId) : null,
      refundId: refundId ? String(refundId) : null,
      amountMinor: amountMinor !== null && amountMinor !== undefined ? Number(amountMinor) : null,
      currency: currency ? String(currency).toUpperCase() : 'INR',
      status: refundEntity?.status || paymentEntity?.status || orderEntity?.status || null,
      method: paymentEntity?.method ? String(paymentEntity.method) : null,
      methodDetails: paymentEntity ? extractSanitizedMethodDetails(paymentEntity) : null,
      errorCode: paymentEntity?.error_code ? String(paymentEntity.error_code) : null,
      errorDescription: paymentEntity?.error_description
        ? String(paymentEntity.error_description)
        : null,
      redactedPayload: {
        entity: payload?.entity,
        event: eventType,
        created_at: payload?.created_at,
        contains: payload?.contains,
        order: orderEntity
          ? {
              id: orderEntity.id,
              amount: orderEntity.amount,
              amount_paid: orderEntity.amount_paid,
              currency: orderEntity.currency,
              status: orderEntity.status,
              receipt: orderEntity.receipt,
            }
          : undefined,
        payment: paymentEntity
          ? {
              id: paymentEntity.id,
              order_id: paymentEntity.order_id,
              amount: paymentEntity.amount,
              currency: paymentEntity.currency,
              status: paymentEntity.status,
              method: paymentEntity.method,
              captured: paymentEntity.captured,
              error_code: paymentEntity.error_code,
              error_description: paymentEntity.error_description,
            }
          : undefined,
        refund: refundEntity
          ? {
              id: refundEntity.id,
              payment_id: refundEntity.payment_id,
              amount: refundEntity.amount,
              currency: refundEntity.currency,
              status: refundEntity.status,
              speed_processed: refundEntity.speed_processed,
            }
          : undefined,
      },
    };
  }

  private mapGatewayPayment(payment: any): GatewayPaymentDetails {
    const status = String(payment?.status || '').toLowerCase();
    return {
      gateway: this.gatewayCode,
      paymentId: String(payment.id),
      orderId: payment.order_id ? String(payment.order_id) : null,
      amountMinor: Number(payment.amount || 0),
      amountRefundedMinor: Number(payment.amount_refunded || 0),
      currency: String(payment.currency || 'INR').toUpperCase(),
      status,
      method: payment.method ? String(payment.method) : null,
      methodDetails: extractSanitizedMethodDetails(payment),
      errorCode: payment.error_code ? String(payment.error_code) : null,
      errorDescription: payment.error_description ? String(payment.error_description) : null,
      captured: Boolean(payment.captured || status === 'captured'),
      createdAt: payment.created_at ? Number(payment.created_at) : undefined,
      rawSanitized: sanitizeGatewayPayload(payment),
    };
  }
}
