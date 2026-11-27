import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LessThanOrEqual, Repository } from 'typeorm';
import { MercoraLogger } from '../../../common/logger';
import { STAFF_ROLES } from '../../../common/constants/roles.constants';
import { PaymentEntity } from '../entities/payment.entity';
import { PaymentAttemptEntity } from '../entities/payment-attempt.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { InvoiceEntity } from '../entities/invoice.entity';
import { RefundEntity } from '../entities/refund.entity';
import { PaymentGatewayRegistry } from '../gateways/payment-gateway.registry';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { InvoiceService } from './invoice.service';
import {
  CreatePaymentOrderDto,
  PaymentQueryDto,
  VerifyRazorpayPaymentDto,
} from '../dto/payment.dto';
import {
  PaymentStatus,
  PaymentType,
  SubscriptionAuditActorType,
  SubscriptionStatus,
} from '../subscription.constants';

function escapeCsvCell(val: unknown): string {
  const str = val === null || val === undefined ? '' : String(val);
  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

@Injectable()
export class PaymentService {
  private readonly logger = new MercoraLogger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(PaymentAttemptEntity)
    private readonly attemptRepo: Repository<PaymentAttemptEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(RefundEntity)
    private readonly refundRepo: Repository<RefundEntity>,
    private readonly configService: ConfigService,
    private readonly gatewayRegistry: PaymentGatewayRegistry,
    private readonly entitlementService: SubscriptionEntitlementService,
    private readonly lifecycleService: SubscriptionLifecycleService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async createOrder(
    user: { id: string; email: string; name?: string; role?: string },
    dto: CreatePaymentOrderDto,
    idempotencyHeader?: string,
  ) {
    if (dto.subscriptionId) {
      const sub = await this.subscriptionRepo.findOne({
        where: { id: dto.subscriptionId },
        relations: ['plan'],
      });
      if (!sub) {
        throw new NotFoundException(`Subscription "${dto.subscriptionId}" not found.`);
      }
      await this.entitlementService.resolveOwnedBusiness(user, sub.businessId, false);

      if (sub.status !== SubscriptionStatus.PENDING) {
        throw new ConflictException(
          `Subscription "${sub.id}" is already in "${sub.status}" status.`,
        );
      }
      if (!sub.plan || !sub.plan.isActive) {
        throw new BadRequestException('The subscription plan is inactive or unavailable.');
      }

      const existingPayment = await this.paymentRepo.findOne({
        where: { subscriptionId: sub.id },
        order: { createdAt: 'DESC' },
      });
      if (
        existingPayment &&
        existingPayment.paymentStatus === PaymentStatus.CREATED &&
        existingPayment.gatewayOrderId
      ) {
        const adapter = this.gatewayRegistry.getAdapter(existingPayment.gateway);
        const pub = adapter.getPublicConfig();
        const { business } = await this.entitlementService.resolveBillingTarget(
          user,
          sub.businessId,
          false,
        );
        const billing = sub.billingDetails || null;
        return {
          reused: true,
          subscriptionId: sub.id,
          paymentId: existingPayment.id,
          gateway: existingPayment.gateway,
          keyId: pub.keyId,
          orderId: existingPayment.gatewayOrderId,
          currency: existingPayment.currency,
          subtotalMinor: Number(sub.subtotalMinor),
          taxMinor: Number(sub.taxMinor),
          amountMinor: Number(existingPayment.amountMinor),
          prorationCreditMinor: 0,
          subtotal: Number((Number(sub.subtotalMinor) / 100).toFixed(2)),
          taxAmount: Number((Number(sub.taxMinor) / 100).toFixed(2)),
          amount: Number((Number(existingPayment.amountMinor) / 100).toFixed(2)),
          paymentType: existingPayment.paymentType,
          plan: {
            id: sub.plan.id,
            code: sub.plan.code,
            name: sub.plan.name,
            billingInterval: sub.plan.billingInterval,
            durationDays: Number(sub.plan.durationDays),
          },
          business: business
            ? {
                id: business.id,
                name: billing?.billingName || business.name,
                email: billing?.email || business.email || user.email,
                phone: business.phone,
                state: billing?.state || business.state,
                gstin: billing?.gstin || business.gstin,
              }
            : {
                id: null,
                name: billing?.billingName || user.name || user.email,
                email: billing?.email || user.email,
                phone: '',
                state: billing?.state || null,
                gstin: billing?.gstin || null,
              },
          prefill: {
            name: billing?.billingName || user.name || business?.name || '',
            email: billing?.email || business?.email || user.email,
            contact: billing?.phone || business?.phone || '',
          },
        };
      }

      return this.lifecycleService.createOrderFlow({
        user,
        planId: sub.planId,
        businessId: sub.businessId || undefined,
        billingDetails: dto.billingDetails || sub.billingDetails || undefined,
        paymentType: PaymentType.PURCHASE,
        existingPendingSubscription: sub,
        idempotencyKey: dto.idempotencyKey || idempotencyHeader,
      });
    }

    if (!dto.planId) {
      throw new BadRequestException('Either planId or subscriptionId is required to create an order.');
    }

    return this.lifecycleService.createOrderFlow({
      user,
      planId: dto.planId,
      businessId: dto.businessId,
      billingDetails: dto.billingDetails,
      paymentType: PaymentType.PURCHASE,
      idempotencyKey: dto.idempotencyKey || idempotencyHeader,
    });
  }

  async verifyCheckoutPayment(
    user: { id: string; email?: string; role?: string },
    dto: VerifyRazorpayPaymentDto,
  ) {
    const orderId = dto.razorpayOrderId.trim();
    const paymentId = dto.razorpayPaymentId.trim();
    const signature = dto.razorpaySignature.trim();

    const payment = await this.paymentRepo.findOne({
      where: { gatewayOrderId: orderId },
      relations: ['subscription'],
    });
    if (!payment) {
      throw new NotFoundException(`Payment order "${orderId}" not found.`);
    }

    // Ownership validation (user or business owner)
    const owned = await this.entitlementService.findOwnedBusinesses(user.id, user.email);
    const ownsBusiness = owned.some((b) => b.id === payment.businessId);
    const isAdmin = Boolean(
      user.role && (STAFF_ROLES as readonly string[]).includes(user.role.toUpperCase()),
    );
    if (payment.userId !== user.id && !ownsBusiness && !isAdmin) {
      throw new ForbiddenException('You do not have permission to verify this payment.');
    }

    // Idempotent fast-path if webhook already settled it
    if (
      payment.paymentStatus === PaymentStatus.CAPTURED ||
      payment.paymentStatus === PaymentStatus.REFUNDED ||
      payment.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED
    ) {
      const invoice = await this.invoiceRepo.findOne({ where: { paymentId: payment.id } });
      return {
        verified: true,
        alreadyCompleted: true,
        paymentStatus: payment.paymentStatus,
        paymentId: payment.id,
        subscriptionId: payment.subscriptionId,
        subscriptionStatus: payment.subscription?.status,
        invoiceId: invoice?.id || null,
        invoiceNumber: invoice?.invoiceNumber || null,
      };
    }

    const adapter = this.gatewayRegistry.getAdapter(payment.gateway);
    const signatureValid = adapter.verifyCheckoutSignature({
      orderId,
      paymentId,
      signature,
    });

    if (!signatureValid) {
      this.logger.warn('Razorpay checkout signature verification failed', {
        paymentId: payment.id,
        orderId,
        gatewayPaymentId: paymentId,
        userId: user.id,
      });

      await this.attemptRepo.save(
        this.attemptRepo.create({
          paymentId: payment.id,
          gateway: payment.gateway,
          gatewayOrderId: orderId,
          gatewayPaymentId: paymentId,
          attemptNumber:
            (await this.attemptRepo.count({ where: { paymentId: payment.id } })) + 1,
          status: 'SIGNATURE_INVALID',
          gatewayResponse: { orderId, paymentId },
          failureReason: 'Invalid HMAC-SHA256 Razorpay payment signature',
        }),
      );

      throw new BadRequestException('Payment signature verification failed.');
    }

    // Always verify authoritative payment record directly from Razorpay API
    const gatewayPayment = await adapter.fetchPayment(paymentId);

    if (gatewayPayment.orderId && gatewayPayment.orderId !== payment.gatewayOrderId) {
      throw new BadRequestException('Gateway payment order_id does not match expected order.');
    }
    if (gatewayPayment.paymentId !== paymentId) {
      throw new BadRequestException('Gateway payment ID mismatch.');
    }
    if (Number(gatewayPayment.amountMinor) !== Number(payment.amountMinor)) {
      throw new BadRequestException('Gateway payment amount does not match order amount.');
    }
    if (
      String(gatewayPayment.currency).toUpperCase() !==
      String(payment.currency).toUpperCase()
    ) {
      throw new BadRequestException('Gateway payment currency does not match order currency.');
    }

    if (gatewayPayment.status === 'failed') {
      await this.lifecycleService.markPaymentFailed({
        paymentId: payment.id,
        gatewayOrderId: orderId,
        gatewayPaymentId: paymentId,
        failureCode: gatewayPayment.errorCode,
        failureReason: gatewayPayment.errorDescription || 'Payment failed at gateway.',
        gatewayResponse: gatewayPayment.rawSanitized,
        actorType: SubscriptionAuditActorType.USER,
      });
      throw new BadRequestException(
        gatewayPayment.errorDescription || 'Payment failed at Razorpay.',
      );
    }

    if (!gatewayPayment.captured) {
      // Authorized but uncaptured: do NOT activate subscription!
      payment.gatewayPaymentId = paymentId;
      payment.signatureVerified = true;
      payment.verifiedAt = new Date();
      payment.paymentStatus =
        gatewayPayment.status === 'authorized'
          ? PaymentStatus.AUTHORIZED
          : PaymentStatus.CREATED;
      payment.paymentMethod = gatewayPayment.method || payment.paymentMethod;
      payment.paymentMethodDetails =
        gatewayPayment.methodDetails || payment.paymentMethodDetails;
      await this.paymentRepo.save(payment);

      this.logger.payment('PAYMENT_AWAITING_CAPTURE', {
        gateway: payment.gateway,
        paymentId: payment.id,
        orderId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        status: payment.paymentStatus,
      });

      return {
        verified: false,
        alreadyCompleted: false,
        pendingCapture: true,
        paymentStatus: payment.paymentStatus,
        paymentId: payment.id,
        subscriptionId: payment.subscriptionId,
        subscriptionStatus: payment.subscription?.status || SubscriptionStatus.PENDING,
        message: 'Payment is authorized and awaiting capture confirmation from Razorpay.',
      };
    }

    const settled = await this.lifecycleService.settleCapturedPayment({
      paymentId: payment.id,
      gatewayOrderId: orderId,
      gatewayPayment,
      signatureVerified: true,
      actorType: SubscriptionAuditActorType.USER,
      actorId: user.id,
    });

    return {
      verified: true,
      alreadyCompleted: settled.alreadyProcessed,
      pendingCapture: false,
      paymentStatus: settled.payment.paymentStatus,
      paymentId: settled.payment.id,
      gatewayPaymentId: settled.payment.gatewayPaymentId,
      subscriptionId: settled.subscription.id,
      subscriptionStatus: settled.subscription.status,
      startsAt: settled.subscription.startsAt,
      expiresAt: settled.subscription.expiresAt,
      invoiceId: settled.invoice.id,
      invoiceNumber: settled.invoice.invoiceNumber,
    };
  }

  async listBusinessPayments(
    user: { id: string; email?: string | null },
    query: PaymentQueryDto,
  ) {
    const owned = await this.entitlementService.findOwnedBusinesses(user.id, user.email);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.subscription', 'sub')
      .leftJoinAndSelect('p.business', 'biz')
      .orderBy('p.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.businessId) {
      await this.entitlementService.resolveOwnedBusiness(user, query.businessId, false);
      qb.where('p.businessId = :businessId', { businessId: query.businessId });
    } else if (owned.length > 0) {
      qb.where('(p.userId = :userId OR p.businessId IN (:...bizIds))', {
        userId: user.id,
        bizIds: owned.map((b) => b.id),
      });
    } else {
      qb.where('p.userId = :userId', { userId: user.id });
    }

    this.applyPaymentFilters(qb, query);

    const [items, total] = await qb.getManyAndCount();
    const invoiceByPaymentId = await this.loadInvoicesForPayments(items.map((p) => p.id));

    return {
      data: items.map((p) => this.toSafePaymentView(p, invoiceByPaymentId.get(p.id))),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getAuthorizedPaymentDetails(
    paymentId: string,
    caller: { id: string; email?: string | null; role?: string | null },
  ) {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['subscription', 'business', 'user'],
    });
    if (!payment) {
      throw new NotFoundException(`Payment "${paymentId}" not found.`);
    }

    const isStaff = Boolean(
      caller.role && (STAFF_ROLES as readonly string[]).includes(caller.role.toUpperCase()),
    );
    const owned = await this.entitlementService.findOwnedBusinesses(caller.id, caller.email);
    const ownsBusiness = Boolean(
      payment.businessId && owned.some((b) => b.id === payment.businessId),
    );
    if (!isStaff && payment.userId !== caller.id && !ownsBusiness) {
      throw new ForbiddenException('You do not have permission to view this payment.');
    }

    const [attempts, invoice, refunds] = await Promise.all([
      this.attemptRepo.find({
        where: { paymentId: payment.id },
        order: { attemptNumber: 'ASC' },
      }),
      this.invoiceRepo.findOne({ where: { paymentId: payment.id } }),
      this.refundRepo.find({
        where: { paymentId: payment.id },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return {
      ...this.toSafePaymentView(payment, invoice || undefined),
      business: payment.business
        ? {
            id: payment.business.id,
            name: payment.business.name,
            city: payment.business.city,
            state: payment.business.state,
            email: payment.business.email,
            phone: payment.business.phone,
            gstin: payment.business.gstin,
          }
        : null,
      user: payment.user
        ? {
            id: payment.user.id,
            name: payment.user.name,
            email: payment.user.email,
          }
        : null,
      subscription: payment.subscription
        ? {
            id: payment.subscription.id,
            status: payment.subscription.status,
            planSnapshot: payment.subscription.planSnapshot,
            startsAt: payment.subscription.startsAt,
            expiresAt: payment.subscription.expiresAt,
            cancelledAt: payment.subscription.cancelledAt,
          }
        : null,
      invoice: invoice ? this.invoiceService.toInvoiceView(invoice) : null,
      attempts: attempts.map((a) => ({
        id: a.id,
        attemptNumber: a.attemptNumber,
        status: a.status,
        gatewayOrderId: a.gatewayOrderId,
        gatewayPaymentId: a.gatewayPaymentId,
        failureReason: a.failureReason,
        createdAt: a.createdAt,
      })),
      refunds: refunds.map((r) => ({
        id: r.id,
        gatewayRefundId: r.gatewayRefundId,
        amountMinor: Number(r.amountMinor),
        amount: Number((Number(r.amountMinor) / 100).toFixed(2)),
        currency: r.currency,
        status: r.status,
        reason: r.reason,
        refundedAt: r.refundedAt,
        createdAt: r.createdAt,
      })),
    };
  }

  async getPaymentStatus(
    paymentId: string,
    caller: { id: string; email?: string | null; role?: string | null },
  ) {
    const details = await this.getAuthorizedPaymentDetails(paymentId, caller);
    return {
      paymentId: details.id,
      paymentStatus: details.paymentStatus,
      paymentType: details.paymentType,
      gateway: details.gateway,
      gatewayOrderId: details.gatewayOrderId,
      gatewayPaymentId: details.gatewayPaymentId,
      amountMinor: details.amountMinor,
      amount: details.amount,
      currency: details.currency,
      paymentMethod: details.paymentMethod,
      failureCode: details.failureCode,
      failureReason: details.failureReason,
      paidAt: details.paidAt,
      subscriptionId: details.subscriptionId,
      subscriptionStatus: details.subscription?.status || null,
      planName: details.planName,
      invoiceId: details.invoiceId,
      invoiceNumber: details.invoiceNumber,
      startsAt: details.subscription?.startsAt || null,
      expiresAt: details.subscription?.expiresAt || null,
    };
  }

  async listAdminPayments(query: PaymentQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.subscription', 'sub')
      .leftJoinAndSelect('p.business', 'biz')
      .leftJoinAndSelect('p.user', 'usr')
      .orderBy('p.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.businessId) {
      qb.andWhere('p.businessId = :businessId', { businessId: query.businessId });
    }
    this.applyPaymentFilters(qb, query);

    const [items, total] = await qb.getManyAndCount();
    const invoiceByPaymentId = await this.loadInvoicesForPayments(items.map((p) => p.id));

    return {
      data: items.map((p) => this.toSafePaymentView(p, invoiceByPaymentId.get(p.id))),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async exportAdminPaymentsCsv(query: PaymentQueryDto): Promise<string> {
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.subscription', 'sub')
      .leftJoinAndSelect('p.business', 'biz')
      .leftJoinAndSelect('p.user', 'usr')
      .orderBy('p.createdAt', 'DESC')
      .take(5000);

    if (query.businessId) {
      qb.andWhere('p.businessId = :businessId', { businessId: query.businessId });
    }
    this.applyPaymentFilters(qb, query);

    const items = await qb.getMany();
    const invoiceByPaymentId = await this.loadInvoicesForPayments(items.map((p) => p.id));

    const header = [
      'Payment ID',
      'Gateway Order ID',
      'Gateway Payment ID',
      'Business Name',
      'User Email',
      'Plan Name',
      'Type',
      'Amount (INR)',
      'Refunded (INR)',
      'Currency',
      'Method',
      'Gateway',
      'Status',
      'Invoice Number',
      'Paid At',
      'Created At',
    ].join(',');

    const rows = items.map((p) => {
      const inv = invoiceByPaymentId.get(p.id);
      return [
        p.id,
        p.gatewayOrderId || '',
        p.gatewayPaymentId || '',
        p.business?.name || '',
        p.user?.email || '',
        p.subscription?.planSnapshot?.name || '',
        p.paymentType,
        (Number(p.amountMinor) / 100).toFixed(2),
        (Number(p.refundedAmountMinor) / 100).toFixed(2),
        p.currency,
        p.paymentMethod || '',
        p.gateway,
        p.paymentStatus,
        inv?.invoiceNumber || '',
        p.paidAt ? new Date(p.paidAt).toISOString() : '',
        p.createdAt ? new Date(p.createdAt).toISOString() : '',
      ]
        .map(escapeCsvCell)
        .join(',');
    });

    return [header, ...rows].join('\n');
  }

  async reconcilePendingPayments(olderThanMinutes = 2) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    const pending = await this.paymentRepo.find({
      where: [
        { paymentStatus: PaymentStatus.CREATED, createdAt: LessThanOrEqual(cutoff) },
        { paymentStatus: PaymentStatus.AUTHORIZED, createdAt: LessThanOrEqual(cutoff) },
      ],
      take: 50,
      order: { createdAt: 'ASC' },
    });

    let settledCount = 0;
    let failedCount = 0;

    for (const pay of pending) {
      if (!pay.gatewayOrderId) continue;
      const adapter = this.gatewayRegistry.getAdapter(pay.gateway);
      if (!adapter.isConfigured()) continue;

      try {
        const orderPayments = await adapter.fetchOrderPayments(pay.gatewayOrderId);
        const captured = orderPayments.find((gp) => gp.captured);
        if (captured) {
          await this.lifecycleService.settleCapturedPayment({
            paymentId: pay.id,
            gatewayOrderId: pay.gatewayOrderId,
            gatewayPayment: captured,
            signatureVerified: false,
            actorType: SubscriptionAuditActorType.SYSTEM,
            correlationId: `reconcile:${pay.id}`,
          });
          settledCount++;
          continue;
        }

        const latestFailed = orderPayments.find((gp) => gp.status === 'failed');
        if (latestFailed && orderPayments.every((gp) => gp.status === 'failed')) {
          await this.lifecycleService.markPaymentFailed({
            paymentId: pay.id,
            gatewayOrderId: pay.gatewayOrderId,
            gatewayPaymentId: latestFailed.paymentId,
            failureCode: latestFailed.errorCode,
            failureReason:
              latestFailed.errorDescription || 'Payment failed during reconciliation.',
            gatewayResponse: latestFailed.rawSanitized,
            actorType: SubscriptionAuditActorType.SYSTEM,
            correlationId: `reconcile:${pay.id}`,
          });
          failedCount++;
        }
      } catch (err: any) {
        this.logger.warn('Pending payment reconciliation skipped for order', {
          paymentId: pay.id,
          orderId: pay.gatewayOrderId,
          reason: err?.message,
        });
      }
    }

    return { checked: pending.length, settledCount, failedCount };
  }

  private applyPaymentFilters(qb: any, query: PaymentQueryDto) {
    if (query.status && query.status !== 'ALL') {
      const normalized = query.status.toUpperCase();
      if (normalized === 'PENDING') {
        qb.andWhere('p.paymentStatus IN (:...pendingStatuses)', {
          pendingStatuses: [PaymentStatus.CREATED, PaymentStatus.AUTHORIZED],
        });
      } else if (normalized.includes(',')) {
        const statuses = normalized
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (statuses.length > 0) {
          qb.andWhere('p.paymentStatus IN (:...statuses)', { statuses });
        }
      } else {
        qb.andWhere('p.paymentStatus = :status', { status: normalized });
      }
    }
    if (query.method && query.method !== 'ALL') {
      qb.andWhere('LOWER(p.paymentMethod) = LOWER(:method)', { method: query.method });
    }
    if (query.gateway && query.gateway !== 'ALL') {
      qb.andWhere('p.gateway = :gateway', { gateway: query.gateway.toUpperCase() });
    }
    if (query.planId) {
      qb.andWhere('sub.planId = :planId', { planId: query.planId });
    }
    if (query.fromDate) {
      const from = new Date(query.fromDate);
      if (!Number.isNaN(from.getTime())) {
        qb.andWhere('p.createdAt >= :fromDate', { fromDate: from });
      }
    }
    if (query.toDate) {
      const to = new Date(query.toDate);
      if (!Number.isNaN(to.getTime())) {
        qb.andWhere('p.createdAt <= :toDate', { toDate: to });
      }
    }
    if (query.search?.trim()) {
      const q = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(CAST(p.id AS text) LIKE :q OR LOWER(COALESCE(p.gatewayOrderId, \'\')) LIKE :q OR LOWER(COALESCE(p.gatewayPaymentId, \'\')) LIKE :q OR LOWER(COALESCE(biz.name, \'\')) LIKE :q)',
        { q },
      );
    }
  }

  private async loadInvoicesForPayments(paymentIds: string[]) {
    const map = new Map<string, InvoiceEntity>();
    if (paymentIds.length === 0) return map;
    const invoices = await this.invoiceRepo
      .createQueryBuilder('inv')
      .where('inv.paymentId IN (:...ids)', { ids: paymentIds })
      .getMany();
    for (const inv of invoices) {
      map.set(inv.paymentId, inv);
    }
    return map;
  }

  private toSafePaymentView(p: PaymentEntity, invoice?: InvoiceEntity) {
    return {
      id: p.id,
      businessId: p.businessId || null,
      businessName:
        p.business?.name ||
        p.subscription?.billingDetails?.billingName ||
        p.user?.name ||
        null,
      userId: p.userId,
      userEmail: p.user?.email || null,
      subscriptionId: p.subscriptionId,
      planId: p.subscription?.planId || null,
      planName: p.subscription?.planSnapshot?.name || null,
      billingInterval: p.subscription?.planSnapshot?.billingInterval || null,
      gateway: p.gateway,
      paymentType: p.paymentType,
      gatewayOrderId: p.gatewayOrderId || null,
      gatewayPaymentId: p.gatewayPaymentId || null,
      signatureVerified: Boolean(p.signatureVerified),
      amountMinor: Number(p.amountMinor),
      refundedAmountMinor: Number(p.refundedAmountMinor || 0),
      amount: Number((Number(p.amountMinor) / 100).toFixed(2)),
      refundedAmount: Number((Number(p.refundedAmountMinor || 0) / 100).toFixed(2)),
      currency: p.currency,
      paymentStatus: p.paymentStatus,
      paymentMethod: p.paymentMethod || null,
      paymentMethodDetails: p.paymentMethodDetails || null,
      failureCode: p.failureCode || null,
      failureReason: p.failureReason || null,
      invoiceId: invoice?.id || null,
      invoiceNumber: invoice?.invoiceNumber || null,
      paidAt: p.paidAt || null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
