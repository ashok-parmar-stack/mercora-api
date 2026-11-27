import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import { MercoraLogger } from '../../../common/logger';
import { STAFF_ROLES } from '../../../common/constants/roles.constants';
import { InvoiceEntity } from '../entities/invoice.entity';
import { PaymentEntity } from '../entities/payment.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { PaymentSettingsEntity } from '../entities/payment-settings.entity';
import { BusinessOrmEntity } from '../../businesses/infrastructure/persistence/entities/business-orm.entity';
import { UserEntity } from '../../../database/entities/user.entity';

export interface GstBreakdown {
  subtotalMinor: number;
  taxMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
  gstRateBps: number;
  isIntraState: boolean;
}

export function formatInrMinor(minor: number): string {
  const rupees = Number(minor || 0) / 100;
  return `INR ${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

@Injectable()
export class InvoiceService {
  private readonly logger = new MercoraLogger(InvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
  ) {}

  computeGstBreakdown(
    subtotalMinor: number,
    gstRateBps: number,
    businessState?: string | null,
    sellerState = 'Gujarat',
  ): GstBreakdown {
    const cleanSubtotal = Math.max(0, Math.trunc(Number(subtotalMinor)));
    const cleanRate = Math.max(0, Math.trunc(Number(gstRateBps)));
    const taxMinor = Math.round((cleanSubtotal * cleanRate) / 10000);
    const isIntraState = Boolean(
      businessState &&
        sellerState &&
        businessState.trim().toLowerCase() === sellerState.trim().toLowerCase(),
    );

    const cgstMinor = isIntraState ? Math.floor(taxMinor / 2) : 0;
    const sgstMinor = isIntraState ? taxMinor - cgstMinor : 0;
    const igstMinor = isIntraState ? 0 : taxMinor;

    return {
      subtotalMinor: cleanSubtotal,
      taxMinor,
      cgstMinor,
      sgstMinor,
      igstMinor,
      totalMinor: cleanSubtotal + taxMinor,
      gstRateBps: cleanRate,
      isIntraState,
    };
  }

  async ensureInvoiceForCapturedPayment(
    manager: EntityManager,
    params: {
      payment: PaymentEntity;
      subscription: SubscriptionEntity;
      business: BusinessOrmEntity | null;
      user: UserEntity | null;
      settings: PaymentSettingsEntity;
    },
  ): Promise<InvoiceEntity> {
    const existing = await manager.findOne(InvoiceEntity, {
      where: { paymentId: params.payment.id },
    });
    if (existing) {
      return existing;
    }

    const { payment, subscription, business, user, settings } = params;
    const gstRateBps = Number(
      subscription.planSnapshot?.gstRateBps ?? settings.defaultGstRateBps ?? 1800,
    );
    const subtotalMinor = Number(subscription.subtotalMinor ?? payment.amountMinor);
    const taxMinor = Number(subscription.taxMinor ?? 0);
    const totalMinor = Number(payment.amountMinor);

    const billingInfo = subscription.billingDetails || null;
    const customerState = billingInfo?.state?.trim() || business?.state || null;

    const isIntraState = Boolean(
      customerState &&
        settings.companyState &&
        customerState.trim().toLowerCase() === settings.companyState.trim().toLowerCase(),
    );
    const cgstMinor = isIntraState ? Math.floor(taxMinor / 2) : 0;
    const sgstMinor = isIntraState ? taxMinor - cgstMinor : 0;
    const igstMinor = isIntraState ? 0 : taxMinor;

    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const shortId = payment.id.replace(/-/g, '').slice(0, 8).toUpperCase();
    const invoiceNumber = `${settings.invoicePrefix || 'MERC-INV'}-${ym}-${shortId}`;

    const invoice = manager.create(InvoiceEntity, {
      invoiceNumber,
      businessId: payment.businessId || null,
      userId: payment.userId,
      subscriptionId: subscription.id,
      paymentId: payment.id,
      subtotalMinor,
      taxMinor,
      cgstMinor,
      sgstMinor,
      igstMinor,
      totalMinor,
      currency: payment.currency || 'INR',
      status: 'ISSUED',
      sellerDetails: {
        legalName: settings.companyLegalName,
        gstin: settings.companyGstin,
        state: settings.companyState,
        address: settings.companyAddress,
        sacCode: settings.sacCode,
      },
      billingDetails: {
        businessId: payment.businessId || null,
        businessName:
          billingInfo?.billingName?.trim() ||
          business?.name ||
          user?.name ||
          'Registered Account',
        gstin: billingInfo?.gstin?.trim() || business?.gstin || null,
        pan: business?.pan || null,
        address: billingInfo?.address?.trim() || business?.address || null,
        city: business?.city || null,
        state: customerState,
        pincode: business?.pincode || null,
        email: billingInfo?.email || business?.email || user?.email || null,
        phone: billingInfo?.phone || business?.phone || user?.phone || null,
        contactName: user?.name || billingInfo?.billingName || null,
      },
      lineItems: [
        {
          description: `${subscription.planSnapshot?.name || 'Business Subscription'} (${subscription.planSnapshot?.billingInterval || 'CUSTOM'} - ${subscription.planSnapshot?.durationDays || 30} days)`,
          sacCode: settings.sacCode,
          gstRatePercent: Number((gstRateBps / 100).toFixed(2)),
          periodStart: subscription.startsAt ? new Date(subscription.startsAt).toISOString() : now.toISOString(),
          periodEnd: subscription.expiresAt ? new Date(subscription.expiresAt).toISOString() : now.toISOString(),
          subtotalMinor,
          taxMinor,
          totalMinor,
          gatewayPaymentId: payment.gatewayPaymentId,
        },
      ],
      invoiceDate: payment.paidAt || now,
      documentReference: `invoices/${invoiceNumber}.pdf`,
    });

    const saved = await manager.save(InvoiceEntity, invoice);
    this.logger.payment('INVOICE_GENERATED', {
      invoiceId: saved.id,
      paymentId: payment.id,
      subscriptionId: subscription.id,
      businessId: payment.businessId,
      amountMinor: saved.totalMinor,
      currency: saved.currency,
      status: saved.status,
    });
    return saved;
  }

  async listForUser(
    userId: string,
    businessIds: string[],
    page = 1,
    limit = 20,
  ) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const qb = this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.payment', 'payment')
      .leftJoinAndSelect('inv.subscription', 'subscription')
      .leftJoinAndSelect('inv.business', 'business')
      .orderBy('inv.invoiceDate', 'DESC')
      .skip(skip)
      .take(safeLimit);

    if (businessIds.length > 0) {
      qb.where('(inv.userId = :userId OR inv.businessId IN (:...businessIds))', {
        userId,
        businessIds,
      });
    } else {
      qb.where('inv.userId = :userId', { userId });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items.map((inv) => this.toInvoiceView(inv)),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  async listForAdmin(params: {
    search?: string;
    status?: string;
    businessId?: string;
    page?: number;
    limit?: number;
  }) {
    const safePage = Math.max(1, Number(params.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const qb = this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.payment', 'payment')
      .leftJoinAndSelect('inv.subscription', 'subscription')
      .leftJoinAndSelect('inv.business', 'business')
      .orderBy('inv.invoiceDate', 'DESC')
      .skip(skip)
      .take(safeLimit);

    if (params.status && params.status !== 'ALL') {
      qb.andWhere('inv.status = :status', { status: params.status });
    }
    if (params.businessId) {
      qb.andWhere('inv.businessId = :businessId', { businessId: params.businessId });
    }
    if (params.search?.trim()) {
      const q = `%${params.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(inv.invoiceNumber) LIKE :q OR LOWER(business.name) LIKE :q OR LOWER(payment.gatewayPaymentId) LIKE :q)',
        { q },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items.map((inv) => this.toInvoiceView(inv)),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  async getAuthorizedInvoice(
    invoiceId: string,
    caller: { id: string; role?: string },
    ownedBusinessIds: string[],
  ): Promise<InvoiceEntity> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId },
      relations: ['payment', 'subscription', 'business', 'user'],
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice "${invoiceId}" not found.`);
    }

    const isStaff = Boolean(
      caller.role && (STAFF_ROLES as readonly string[]).includes(caller.role.toUpperCase()),
    );
    const isOwner =
      invoice.userId === caller.id ||
      (Boolean(invoice.businessId) && ownedBusinessIds.includes(invoice.businessId!));

    if (!isStaff && !isOwner) {
      throw new ForbiddenException('You do not have access to this invoice.');
    }

    return invoice;
  }

  toInvoiceView(inv: InvoiceEntity) {
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      businessId: inv.businessId,
      businessName: inv.business?.name || (inv.billingDetails as any)?.businessName || null,
      userId: inv.userId,
      subscriptionId: inv.subscriptionId,
      paymentId: inv.paymentId,
      gatewayPaymentId: inv.payment?.gatewayPaymentId || null,
      gatewayOrderId: inv.payment?.gatewayOrderId || null,
      planName: inv.subscription?.planSnapshot?.name || null,
      billingInterval: inv.subscription?.planSnapshot?.billingInterval || null,
      subtotalMinor: Number(inv.subtotalMinor),
      taxMinor: Number(inv.taxMinor),
      cgstMinor: Number(inv.cgstMinor),
      sgstMinor: Number(inv.sgstMinor),
      igstMinor: Number(inv.igstMinor),
      totalMinor: Number(inv.totalMinor),
      subtotal: Number((Number(inv.subtotalMinor) / 100).toFixed(2)),
      taxAmount: Number((Number(inv.taxMinor) / 100).toFixed(2)),
      totalAmount: Number((Number(inv.totalMinor) / 100).toFixed(2)),
      currency: inv.currency,
      status: inv.status,
      sellerDetails: inv.sellerDetails,
      billingDetails: inv.billingDetails,
      lineItems: inv.lineItems,
      invoiceDate: inv.invoiceDate,
      documentReference: inv.documentReference,
      createdAt: inv.createdAt,
    };
  }

  async renderPdfBuffer(invoice: InvoiceEntity): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const seller = (invoice.sellerDetails || {}) as Record<string, any>;
      const billing = (invoice.billingDetails || {}) as Record<string, any>;
      const items = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];

      // Header Banner
      doc
        .fillColor('#7F1D3F')
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('TAX INVOICE', 48, 48);

      doc
        .fillColor('#0F172A')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(String(seller.legalName || 'Mercora B2B Technologies Pvt. Ltd.'), 48, 82);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#475569')
        .text(String(seller.address || ''), 48, 98, { width: 260 })
        .text(`GSTIN: ${seller.gstin || 'N/A'} | SAC: ${seller.sacCode || '998314'}`);

      // Invoice Metadata (Right)
      doc
        .fillColor('#0F172A')
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .text(`Invoice No: ${invoice.invoiceNumber}`, 330, 52, { align: 'right' })
        .font('Helvetica')
        .text(
          `Invoice Date: ${new Date(invoice.invoiceDate).toISOString().slice(0, 10)}`,
          330,
          68,
          { align: 'right' },
        )
        .text(`Status: ${invoice.status}`, 330, 84, { align: 'right' })
        .text(
          `Payment Ref: ${invoice.payment?.gatewayPaymentId || invoice.paymentId}`,
          330,
          100,
          { align: 'right' },
        );

      doc.moveTo(48, 150).lineTo(547, 150).strokeColor('#CBD5E1').stroke();

      // Billed To
      doc
        .fillColor('#64748B')
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .text('BILLED TO', 48, 166);
      doc
        .fillColor('#0F172A')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(String(billing.businessName || 'Registered Business'), 48, 182);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#475569')
        .text(
          [billing.address, billing.city, billing.state, billing.pincode]
            .filter(Boolean)
            .join(', ') || 'India',
          48,
          198,
          { width: 320 },
        )
        .text(`GSTIN: ${billing.gstin || 'Unregistered / Not Provided'}`)
        .text(`Email: ${billing.email || 'N/A'}`);

      // Line Items Table Header
      let y = 272;
      doc.rect(48, y, 499, 24).fill('#F8FAFC');
      doc
        .fillColor('#0F172A')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('Description', 56, y + 7)
        .text('SAC', 310, y + 7)
        .text('Subtotal', 370, y + 7, { width: 75, align: 'right' })
        .text('Total', 455, y + 7, { width: 84, align: 'right' });

      y += 32;
      for (const item of items) {
        doc
          .fillColor('#1E293B')
          .fontSize(9.5)
          .font('Helvetica-Bold')
          .text(String(item.description || 'Mercora Subscription'), 56, y, { width: 245 });
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor('#64748B')
          .text(
            `Period: ${String(item.periodStart || '').slice(0, 10)} to ${String(item.periodEnd || '').slice(0, 10)}`,
            56,
            y + 14,
          );
        doc
          .fillColor('#1E293B')
          .fontSize(9)
          .text(String(item.sacCode || seller.sacCode || '998314'), 310, y)
          .text(formatInrMinor(Number(item.subtotalMinor ?? invoice.subtotalMinor)), 370, y, {
            width: 75,
            align: 'right',
          })
          .text(formatInrMinor(Number(item.totalMinor ?? invoice.totalMinor)), 455, y, {
            width: 84,
            align: 'right',
          });
        y += 40;
      }

      doc.moveTo(48, y + 4).lineTo(547, y + 4).strokeColor('#E2E8F0').stroke();
      y += 18;

      // Tax & Totals Summary
      const summaryRows: Array<[string, string, boolean?]> = [
        ['Taxable Subtotal', formatInrMinor(invoice.subtotalMinor)],
      ];
      if (Number(invoice.cgstMinor) > 0 || Number(invoice.sgstMinor) > 0) {
        summaryRows.push(['CGST (9%)', formatInrMinor(invoice.cgstMinor)]);
        summaryRows.push(['SGST (9%)', formatInrMinor(invoice.sgstMinor)]);
      } else {
        summaryRows.push(['IGST (18%)', formatInrMinor(invoice.igstMinor)]);
      }
      summaryRows.push(['Total Tax', formatInrMinor(invoice.taxMinor)]);
      summaryRows.push(['Grand Total Paid', formatInrMinor(invoice.totalMinor), true]);

      for (const [label, value, bold] of summaryRows) {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 10.5 : 9)
          .fillColor(bold ? '#7F1D3F' : '#334155')
          .text(label, 330, y)
          .text(value, 440, y, { width: 99, align: 'right' });
        y += bold ? 22 : 16;
      }

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#94A3B8')
        .text(
          'This is a computer-generated GST tax invoice issued by Mercora for verified B2B subscription services.',
          48,
          750,
          { align: 'center', width: 499 },
        );

      doc.end();
    });
  }
}
