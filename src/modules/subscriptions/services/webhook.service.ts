import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MercoraLogger } from '../../../common/logger';
import { PaymentWebhookEventEntity } from '../entities/payment-webhook-event.entity';
import { PaymentEntity } from '../entities/payment.entity';
import { PaymentGatewayRegistry } from '../gateways/payment-gateway.registry';
import {
  GatewayPaymentDetails,
  NormalizedWebhookEvent,
} from '../gateways/payment-gateway.interface';
import {
  PaymentGateway,
  SubscriptionAuditActorType,
  WebhookProcessingStatus,
} from '../subscription.constants';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { RefundService } from './refund.service';

@Injectable()
export class WebhookService {
  private readonly logger = new MercoraLogger(WebhookService.name);

  constructor(
    @InjectRepository(PaymentWebhookEventEntity)
    private readonly webhookRepo: Repository<PaymentWebhookEventEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    private readonly gatewayRegistry: PaymentGatewayRegistry,
    private readonly lifecycleService: SubscriptionLifecycleService,
    private readonly refundService: RefundService,
  ) {}

  async handleRazorpayWebhook(params: {
    rawBody?: Buffer | string;
    signature?: string;
    headers: Record<string, string | string[] | undefined>;
    parsedBody?: Record<string, unknown>;
  }) {
    const adapter = this.gatewayRegistry.getAdapter(PaymentGateway.RAZORPAY);
    const { rawBody, signature, headers } = params;

    if (!rawBody || (Buffer.isBuffer(rawBody) && rawBody.length === 0)) {
      throw new BadRequestException('Raw webhook request body is required for signature verification.');
    }
    if (!signature || !signature.trim()) {
      throw new UnauthorizedException('Missing X-Razorpay-Signature header.');
    }

    const isValid = adapter.verifyWebhookSignature(rawBody, signature.trim());
    if (!isValid) {
      this.logger.warn('Rejected unsigned or tampered Razorpay webhook');
      throw new UnauthorizedException('Invalid Razorpay webhook signature.');
    }

    let payloadObj: Record<string, unknown>;
    try {
      payloadObj =
        params.parsedBody && Object.keys(params.parsedBody).length > 0
          ? params.parsedBody
          : JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
    } catch {
      throw new BadRequestException('Invalid JSON webhook payload.');
    }

    const event = adapter.parseWebhookEvent(payloadObj, headers);

    // Idempotent duplicate protection using unique (gateway, gatewayEventId)
    let eventRow = await this.webhookRepo.findOne({
      where: { gateway: event.gateway, gatewayEventId: event.gatewayEventId },
    });

    if (eventRow) {
      if (eventRow.processingStatus === WebhookProcessingStatus.PROCESSED) {
        this.logger.payment('WEBHOOK_DUPLICATE_IGNORED', {
          gateway: event.gateway,
          gatewayEventId: event.gatewayEventId,
          status: 'PROCESSED',
        });
        return { status: 'ok', duplicate: true, eventId: event.gatewayEventId };
      }
      if (eventRow.processingStatus === WebhookProcessingStatus.PROCESSING) {
        return { status: 'ok', duplicate: true, inProgress: true, eventId: event.gatewayEventId };
      }
      eventRow.processingStatus = WebhookProcessingStatus.PROCESSING;
      eventRow.errorMessage = null;
      eventRow = await this.webhookRepo.save(eventRow);
    } else {
      try {
        eventRow = await this.webhookRepo.save(
          this.webhookRepo.create({
            gateway: event.gateway,
            gatewayEventId: event.gatewayEventId,
            eventType: event.eventType,
            processingStatus: WebhookProcessingStatus.PROCESSING,
            signatureValid: true,
            payload: event.redactedPayload,
            retryCount: 0,
          }),
        );
      } catch (err: any) {
        // Concurrent insert hit unique constraint -> ignore duplicate cleanly
        if (err?.code === '23505') {
          return { status: 'ok', duplicate: true, eventId: event.gatewayEventId };
        }
        throw err;
      }
    }

    try {
      await this.dispatchNormalizedEvent(event);
      eventRow.processingStatus = WebhookProcessingStatus.PROCESSED;
      eventRow.processedAt = new Date();
      eventRow.errorMessage = null;
      await this.webhookRepo.save(eventRow);

      this.logger.payment('WEBHOOK_PROCESSED', {
        gateway: event.gateway,
        gatewayEventId: event.gatewayEventId,
        orderId: event.orderId || undefined,
        paymentId: event.paymentId || undefined,
        refundId: event.refundId || undefined,
        status: event.eventType,
      });

      return { status: 'ok', duplicate: false, eventId: event.gatewayEventId };
    } catch (err: any) {
      eventRow.processingStatus = WebhookProcessingStatus.FAILED;
      eventRow.retryCount = Number(eventRow.retryCount || 0) + 1;
      eventRow.errorMessage = String(err?.message || 'Webhook processing error').slice(0, 1000);
      await this.webhookRepo.save(eventRow);

      this.logger.error('Webhook processing failed — marked for recovery', err, {
        gateway: event.gateway,
        gatewayEventId: event.gatewayEventId,
        eventType: event.eventType,
        retryCount: eventRow.retryCount,
      });

      throw err;
    }
  }

  async retryFailedWebhookEvents(maxRetries = 5) {
    const failedEvents = await this.webhookRepo
      .createQueryBuilder('w')
      .where('w.processingStatus = :status', { status: WebhookProcessingStatus.FAILED })
      .andWhere('w.signatureValid = true')
      .andWhere('w.retryCount < :maxRetries', { maxRetries })
      .orderBy('w.receivedAt', 'ASC')
      .take(25)
      .getMany();

    let recovered = 0;
    const adapter = this.gatewayRegistry.getAdapter(PaymentGateway.RAZORPAY);

    for (const row of failedEvents) {
      try {
        row.processingStatus = WebhookProcessingStatus.PROCESSING;
        await this.webhookRepo.save(row);

        const normalized = adapter.parseWebhookEvent(row.payload, {
          'x-razorpay-event-id': row.gatewayEventId,
        });
        await this.dispatchNormalizedEvent(normalized);

        row.processingStatus = WebhookProcessingStatus.PROCESSED;
        row.processedAt = new Date();
        row.errorMessage = null;
        await this.webhookRepo.save(row);
        recovered++;
      } catch (err: any) {
        row.processingStatus = WebhookProcessingStatus.FAILED;
        row.retryCount = Number(row.retryCount || 0) + 1;
        row.errorMessage = String(err?.message || 'Retry failed').slice(0, 1000);
        await this.webhookRepo.save(row);
      }
    }

    return { attempted: failedEvents.length, recovered };
  }

  private async dispatchNormalizedEvent(event: NormalizedWebhookEvent): Promise<void> {
    switch (event.eventType) {
      case 'payment.captured':
      case 'order.paid': {
        if (!event.orderId && !event.paymentId) {
          this.logger.warn('Captured/order.paid webhook missing orderId & paymentId', {
            gatewayEventId: event.gatewayEventId,
          });
          return;
        }

        const payment = event.orderId
          ? await this.paymentRepo.findOne({ where: { gatewayOrderId: event.orderId } })
          : await this.paymentRepo.findOne({ where: { gatewayPaymentId: event.paymentId! } });

        if (!payment) {
          this.logger.warn('Webhook payment record not found locally', {
            gatewayEventId: event.gatewayEventId,
            orderId: event.orderId,
            paymentId: event.paymentId,
          });
          return;
        }

        const adapter = this.gatewayRegistry.getAdapter(event.gateway);
        let gatewayPayment: GatewayPaymentDetails;

        // Prefer authoritative Razorpay fetch if configured, else trust verified signed webhook entity
        if (event.paymentId && adapter.isConfigured()) {
          try {
            gatewayPayment = await adapter.fetchPayment(event.paymentId);
          } catch {
            gatewayPayment = this.buildGatewayPaymentFromWebhook(event, payment);
          }
        } else {
          gatewayPayment = this.buildGatewayPaymentFromWebhook(event, payment);
        }

        await this.lifecycleService.settleCapturedPayment({
          paymentId: payment.id,
          gatewayOrderId: payment.gatewayOrderId || event.orderId || undefined,
          gatewayPayment,
          signatureVerified: false,
          actorType: SubscriptionAuditActorType.GATEWAY,
          correlationId: event.gatewayEventId,
        });
        return;
      }

      case 'payment.failed': {
        await this.lifecycleService.markPaymentFailed({
          gatewayOrderId: event.orderId || undefined,
          gatewayPaymentId: event.paymentId || null,
          failureCode: event.errorCode,
          failureReason: event.errorDescription || 'Payment failed at Razorpay',
          gatewayResponse: event.redactedPayload,
          actorType: SubscriptionAuditActorType.GATEWAY,
          correlationId: event.gatewayEventId,
        });
        return;
      }

      case 'refund.created':
      case 'refund.processed':
      case 'refund.failed': {
        await this.refundService.syncRefundFromWebhook(event);
        return;
      }

      default:
        this.logger.info('Unhandled Razorpay webhook event acknowledged', {
          eventType: event.eventType,
          gatewayEventId: event.gatewayEventId,
        });
    }
  }

  private buildGatewayPaymentFromWebhook(
    event: NormalizedWebhookEvent,
    payment: PaymentEntity,
  ): GatewayPaymentDetails {
    return {
      gateway: event.gateway,
      paymentId: event.paymentId || payment.gatewayPaymentId || '',
      orderId: event.orderId || payment.gatewayOrderId || null,
      amountMinor: Number(event.amountMinor ?? payment.amountMinor),
      amountRefundedMinor: 0,
      currency: String(event.currency || payment.currency || 'INR').toUpperCase(),
      status: event.status || 'captured',
      method: event.method || null,
      methodDetails: event.methodDetails || null,
      errorCode: event.errorCode || null,
      errorDescription: event.errorDescription || null,
      captured: true,
      rawSanitized: event.redactedPayload,
    };
  }
}
