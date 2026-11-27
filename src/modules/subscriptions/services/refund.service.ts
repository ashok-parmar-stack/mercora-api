import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import { runInTransaction } from '../../../common/utils/transaction-runner.util';
import { EmailDispatcherService } from '../../email/services/email-dispatcher.service';
import { BusinessOrmEntity } from '../../businesses/infrastructure/persistence/entities/business-orm.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import { PaymentEntity } from '../entities/payment.entity';
import { RefundEntity } from '../entities/refund.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { InvoiceEntity } from '../entities/invoice.entity';
import { PaymentGatewayRegistry } from '../gateways/payment-gateway.registry';
import { NormalizedWebhookEvent } from '../gateways/payment-gateway.interface';
import { CreateRefundDto } from '../dto/payment.dto';
import {
  PaymentQueryDto,
} from '../dto/payment.dto';
import {
  PaymentStatus,
  RefundStatus,
  SUBSCRIPTION_EMAIL_TEMPLATES,
  SubscriptionAuditActorType,
  SubscriptionStatus,
} from '../subscription.constants';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { formatInrMinor } from './invoice.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

@Injectable()
export class RefundService {
  private readonly logger = new MercoraLogger(RefundService.name);

  constructor(
    @InjectRepository(RefundEntity)
    private readonly refundRepo: Repository<RefundEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(BusinessOrmEntity)
    private readonly businessRepo: Repository<BusinessOrmEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly gatewayRegistry: PaymentGatewayRegistry,
    private readonly lifecycleService: SubscriptionLifecycleService,
    private readonly emailDispatcher: EmailDispatcherService,
    private readonly auditService: AuditService,
  ) {}

  async initiateRefund(
    paymentId: string,
    dto: CreateRefundDto,
    adminId: string,
    idempotencyHeader?: string,
  ) {
    const cleanIdem = dto.idempotencyKey?.trim() || idempotencyHeader?.trim() || null;
    if (cleanIdem) {
      const existing = await this.refundRepo.findOne({
        where: { idempotencyKey: cleanIdem },
      });
      if (existing) {
        return { duplicate: true, refund: existing };
      }
    }

    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException(`Payment "${paymentId}" not found.`);
    }

    if (
      payment.paymentStatus !== PaymentStatus.CAPTURED &&
      payment.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new BadRequestException(
        `Only CAPTURED or PARTIALLY_REFUNDED payments can be refunded (current status: ${payment.paymentStatus}).`,
      );
    }

    if (!payment.gatewayPaymentId) {
      throw new BadRequestException(
        'Cannot issue refund: payment does not have a gateway payment ID.',
      );
    }

    const alreadyRefundedMinor = Number(payment.refundedAmountMinor || 0);
    const refundableMinor = Number(payment.amountMinor) - alreadyRefundedMinor;
    if (refundableMinor <= 0) {
      throw new ConflictException('This payment has already been fully refunded.');
    }

    let requestedMinor = refundableMinor;
    if (dto.amountMinor !== undefined && dto.amountMinor !== null) {
      requestedMinor = Math.trunc(Number(dto.amountMinor));
    } else if (dto.amount !== undefined && dto.amount !== null) {
      requestedMinor = Math.round(Number(dto.amount) * 100);
    }

    if (!Number.isFinite(requestedMinor) || requestedMinor <= 0) {
      throw new BadRequestException('Refund amount must be positive.');
    }
    if (requestedMinor > refundableMinor) {
      throw new BadRequestException(
        `Refund amount (${requestedMinor} paise) exceeds remaining refundable amount (${refundableMinor} paise).`,
      );
    }

    const activeInProgress = await this.refundRepo.findOne({
      where: { paymentId: payment.id, status: RefundStatus.INITIATED },
    });
    if (activeInProgress) {
      throw new ConflictException('A refund is already in progress for this payment.');
    }

    const adapter = this.gatewayRegistry.getAdapter(payment.gateway);
    const settings = await this.lifecycleService.getPaymentSettings();

    // Call Razorpay refund API
    const gatewayRefund = await adapter.createRefund({
      paymentId: payment.gatewayPaymentId,
      amountMinor: requestedMinor,
      speed: dto.speed || 'normal',
      receipt: `rfnd_${payment.id.replace(/-/g, '').slice(0, 24)}`,
      notes: {
        mercora_payment_id: payment.id,
        mercora_subscription_id: payment.subscriptionId,
        initiated_by: adminId,
        reason: dto.reason.slice(0, 200),
      },
    });

    const normalizedStatus =
      gatewayRefund.status === 'processed'
        ? RefundStatus.PROCESSED
        : gatewayRefund.status === 'failed'
          ? RefundStatus.FAILED
          : RefundStatus.PENDING;

    const saved = await runInTransaction(
      this.dataSource,
      async (qr) => {
        const lockedPayment = await qr.manager
          .createQueryBuilder(PaymentEntity, 'p')
          .setLock('pessimistic_write')
          .where('p.id = :id', { id: payment.id })
          .getOne();

        if (!lockedPayment) {
          throw new NotFoundException('Payment disappeared during refund persistence.');
        }

        const refund = await qr.manager.save(
          RefundEntity,
          qr.manager.create(RefundEntity, {
            paymentId: lockedPayment.id,
            subscriptionId: lockedPayment.subscriptionId,
            businessId: lockedPayment.businessId,
            gateway: lockedPayment.gateway,
            gatewayRefundId: gatewayRefund.refundId,
            amountMinor: gatewayRefund.amountMinor,
            currency: gatewayRefund.currency || lockedPayment.currency,
            status: normalizedStatus,
            reason: dto.reason.trim(),
            idempotencyKey: cleanIdem,
            initiatedBy: adminId,
            refundedAt: normalizedStatus === RefundStatus.PROCESSED ? new Date() : null,
          }),
        );

        if (normalizedStatus !== RefundStatus.FAILED) {
          await this.applyRefundImpactInTx(
            qr.manager,
            lockedPayment,
            gatewayRefund.amountMinor,
            settings.refundRevokesAccess,
            SubscriptionAuditActorType.ADMIN,
            adminId,
            `Refund issued: ${dto.reason.trim()}`,
          );
        }

        return refund;
      },
      'InitiateRefund',
    );

    await this.auditService.log({
      userId: adminId,
      action: 'INITIATE_REFUND',
      module: 'PAYMENT_MANAGEMENT',
      entityType: 'RefundEntity',
      entityId: saved.id,
      newData: {
        paymentId: payment.id,
        gatewayRefundId: saved.gatewayRefundId,
        amountMinor: saved.amountMinor,
        status: saved.status,
        reason: saved.reason,
      },
    });

    await this.sendRefundNotification(
      saved,
      normalizedStatus === RefundStatus.PROCESSED
        ? SUBSCRIPTION_EMAIL_TEMPLATES.REFUND_COMPLETED
        : SUBSCRIPTION_EMAIL_TEMPLATES.REFUND_INITIATED,
    );

    return { duplicate: false, refund: saved };
  }

  async syncRefundFromWebhook(event: NormalizedWebhookEvent): Promise<void> {
    if (!event.refundId || !event.paymentId) return;

    const payment = await this.paymentRepo.findOne({
      where: { gatewayPaymentId: event.paymentId },
    });
    if (!payment) {
      this.logger.warn('Refund webhook ignored — payment not found', {
        gatewayPaymentId: event.paymentId,
        refundId: event.refundId,
        eventType: event.eventType,
      });
      return;
    }

    const settings = await this.lifecycleService.getPaymentSettings();
    const targetStatus =
      event.eventType === 'refund.processed' || event.status === 'processed'
        ? RefundStatus.PROCESSED
        : event.eventType === 'refund.failed' || event.status === 'failed'
          ? RefundStatus.FAILED
          : RefundStatus.PENDING;

    const txResult = await runInTransaction(
      this.dataSource,
      async (qr) => {
        const lockedPayment = await qr.manager
          .createQueryBuilder(PaymentEntity, 'p')
          .setLock('pessimistic_write')
          .where('p.id = :id', { id: payment.id })
          .getOne();
        if (!lockedPayment) return null;

        let refund = await qr.manager.findOne(RefundEntity, {
          where: { gatewayRefundId: event.refundId! },
        });

        const isNewNonFailed = !refund && targetStatus !== RefundStatus.FAILED;
        const wasNonFailed = refund && refund.status !== RefundStatus.FAILED;

        if (!refund) {
          refund = qr.manager.create(RefundEntity, {
            paymentId: lockedPayment.id,
            subscriptionId: lockedPayment.subscriptionId,
            businessId: lockedPayment.businessId,
            gateway: event.gateway,
            gatewayRefundId: event.refundId!,
            amountMinor: Number(event.amountMinor || lockedPayment.amountMinor),
            currency: event.currency || lockedPayment.currency,
            status: targetStatus,
            reason: 'Synchronized via Razorpay webhook',
            refundedAt: targetStatus === RefundStatus.PROCESSED ? new Date() : null,
          });
        } else {
          if (refund.status === RefundStatus.PROCESSED && targetStatus !== RefundStatus.PROCESSED) {
            return { refund, newlyCompleted: false };
          }
          refund.status = targetStatus;
          if (targetStatus === RefundStatus.PROCESSED && !refund.refundedAt) {
            refund.refundedAt = new Date();
          }
          if (targetStatus === RefundStatus.FAILED) {
            refund.failureReason = event.errorDescription || 'Gateway refund failed';
          }
        }

        const savedRefund = await qr.manager.save(RefundEntity, refund);

        if (isNewNonFailed) {
          await this.applyRefundImpactInTx(
            qr.manager,
            lockedPayment,
            savedRefund.amountMinor,
            settings.refundRevokesAccess,
            SubscriptionAuditActorType.GATEWAY,
            null,
            'Refund synchronized via Razorpay webhook',
            event.gatewayEventId,
          );
        } else if (wasNonFailed && targetStatus === RefundStatus.FAILED) {
          // Roll back accounted refunded_amount_minor if a pending refund later failed
          lockedPayment.refundedAmountMinor = Math.max(
            0,
            Number(lockedPayment.refundedAmountMinor || 0) - Number(savedRefund.amountMinor),
          );
          lockedPayment.paymentStatus =
            lockedPayment.refundedAmountMinor === 0
              ? PaymentStatus.CAPTURED
              : PaymentStatus.PARTIALLY_REFUNDED;
          await qr.manager.save(PaymentEntity, lockedPayment);
        }

        return {
          refund: savedRefund,
          newlyCompleted: targetStatus === RefundStatus.PROCESSED,
        };
      },
      'SyncRefundWebhook',
    );

    if (txResult?.newlyCompleted) {
      await this.sendRefundNotification(
        txResult.refund,
        SUBSCRIPTION_EMAIL_TEMPLATES.REFUND_COMPLETED,
      );
    }
  }

  private async applyRefundImpactInTx(
    manager: any,
    payment: PaymentEntity,
    refundAmountMinor: number,
    refundRevokesAccess: boolean,
    actorType: SubscriptionAuditActorType,
    actorId: string | null,
    reason: string,
    correlationId?: string,
  ) {
    const newTotalRefunded = Math.min(
      Number(payment.amountMinor),
      Number(payment.refundedAmountMinor || 0) + Number(refundAmountMinor),
    );
    const isFullRefund = newTotalRefunded >= Number(payment.amountMinor);

    payment.refundedAmountMinor = newTotalRefunded;
    payment.paymentStatus = isFullRefund
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED;
    await manager.save(PaymentEntity, payment);

    const invoice = await manager.findOne(InvoiceEntity, {
      where: { paymentId: payment.id },
    });
    if (invoice) {
      invoice.status = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      await manager.save(InvoiceEntity, invoice);
    }

    // Refund policy: never reactivate or extend a subscription; revoke active access on full refund
    const subscription = await manager.findOne(SubscriptionEntity, {
      where: { id: payment.subscriptionId },
    });
    if (
      subscription &&
      isFullRefund &&
      refundRevokesAccess &&
      (subscription.status === SubscriptionStatus.ACTIVE ||
        subscription.status === SubscriptionStatus.PAST_DUE)
    ) {
      const oldStatus = subscription.status;
      subscription.status = SubscriptionStatus.CANCELLED;
      subscription.cancelledAt = new Date();
      subscription.cancellationReason = reason;
      subscription.updatedBy = actorId;
      await manager.save(SubscriptionEntity, subscription);

      await this.lifecycleService.writeSubAudit(manager, {
        subscriptionId: subscription.id,
        businessId: subscription.businessId,
        actorType,
        actorId,
        action: 'SUBSCRIPTION_REVOKED_BY_REFUND',
        oldValues: { status: oldStatus },
        newValues: {
          status: subscription.status,
          refundedAmountMinor: newTotalRefunded,
        },
        performedBy: actorId,
        correlationId,
      });
    } else {
      await this.lifecycleService.writeSubAudit(manager, {
        subscriptionId: payment.subscriptionId,
        businessId: payment.businessId,
        actorType,
        actorId,
        action: isFullRefund ? 'PAYMENT_REFUNDED_FULL' : 'PAYMENT_REFUNDED_PARTIAL',
        newValues: {
          refundAmountMinor,
          totalRefundedMinor: newTotalRefunded,
          reason,
        },
        performedBy: actorId,
        correlationId,
      });
    }
  }

  private async sendRefundNotification(refund: RefundEntity, templateCode: string) {
    const [biz, pay] = await Promise.all([
      refund.businessId
        ? this.businessRepo.findOne({ where: { id: refund.businessId } })
        : Promise.resolve(null),
      this.paymentRepo.findOne({ where: { id: refund.paymentId } }),
    ]);
    const usr = pay ? await this.userRepo.findOne({ where: { id: pay.userId } }) : null;
    const to = usr?.email || biz?.email;
    if (!to) return;

    this.emailDispatcher.sendAsync({
      to,
      templateCode,
      userId: usr?.id,
      context: {
        user_name: usr?.name || biz?.name || 'Business Partner',
        business_name: biz?.name || 'Your Business',
        amount_formatted: formatInrMinor(refund.amountMinor),
        refund_id: refund.gatewayRefundId || refund.id,
        reason: refund.reason,
      },
    });
  }

  async listRefunds(query: PaymentQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.refundRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.payment', 'payment')
      .leftJoinAndSelect('r.business', 'business')
      .leftJoinAndSelect('r.subscription', 'subscription')
      .orderBy('r.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status && query.status !== 'ALL') {
      qb.andWhere('r.status = :status', { status: query.status.toUpperCase() });
    }
    if (query.businessId) {
      qb.andWhere('r.businessId = :businessId', { businessId: query.businessId });
    }
    if (query.search?.trim()) {
      const q = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(COALESCE(r.gatewayRefundId, \'\')) LIKE :q OR LOWER(COALESCE(business.name, \'\')) LIKE :q OR LOWER(r.reason) LIKE :q)',
        { q },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items.map((r) => ({
        id: r.id,
        paymentId: r.paymentId,
        subscriptionId: r.subscriptionId,
        businessId: r.businessId || null,
        businessName:
          r.business?.name ||
          r.subscription?.billingDetails?.billingName ||
          null,
        planName: r.subscription?.planSnapshot?.name || null,
        gateway: r.gateway,
        gatewayRefundId: r.gatewayRefundId,
        gatewayPaymentId: r.payment?.gatewayPaymentId || null,
        amountMinor: Number(r.amountMinor),
        amount: Number((Number(r.amountMinor) / 100).toFixed(2)),
        currency: r.currency,
        status: r.status,
        reason: r.reason,
        initiatedBy: r.initiatedBy,
        refundedAt: r.refundedAt,
        createdAt: r.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
