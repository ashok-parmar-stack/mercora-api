import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentEntity } from '../entities/payment.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { RefundEntity } from '../entities/refund.entity';
import {
  PaymentStatus,
  RefundStatus,
  SubscriptionStatus,
} from '../subscription.constants';

@Injectable()
export class PaymentAnalyticsService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    @InjectRepository(RefundEntity)
    private readonly refundRepo: Repository<RefundEntity>,
  ) {}

  async getAdminAnalytics(months = 12) {
    const safeMonths = Math.min(24, Math.max(1, Number(months) || 12));
    const sinceDate = new Date();
    sinceDate.setUTCMonth(sinceDate.getUTCMonth() - safeMonths + 1);
    sinceDate.setUTCDate(1);
    sinceDate.setUTCHours(0, 0, 0, 0);

    const now = new Date();
    const expiringCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      paymentSummaryRows,
      refundSummaryRow,
      subStatusRows,
      expiringCount,
      monthlyPaymentsRows,
      monthlyRefundsRows,
      planDistRows,
      monthlySubLifecycleRows,
    ] = await Promise.all([
      this.paymentRepo
        .createQueryBuilder('p')
        .select('p.paymentStatus', 'status')
        .addSelect('COUNT(*)::int', 'count')
        .addSelect('COALESCE(SUM(p.amountMinor), 0)::bigint', 'totalAmountMinor')
        .groupBy('p.paymentStatus')
        .getRawMany(),

      this.refundRepo
        .createQueryBuilder('r')
        .select('COUNT(*)::int', 'totalRefunds')
        .addSelect(
          `COALESCE(SUM(CASE WHEN r.status != 'FAILED' THEN r.amount_minor ELSE 0 END), 0)::bigint`,
          'totalRefundedMinor',
        )
        .getRawOne(),

      this.subscriptionRepo
        .createQueryBuilder('s')
        .select('s.status', 'status')
        .addSelect('COUNT(*)::int', 'count')
        .groupBy('s.status')
        .getRawMany(),

      this.subscriptionRepo
        .createQueryBuilder('s')
        .where('s.status = :active AND s.expiresAt >= :now AND s.expiresAt <= :cutoff', {
          active: SubscriptionStatus.ACTIVE,
          now,
          cutoff: expiringCutoff,
        })
        .getCount(),

      this.paymentRepo
        .createQueryBuilder('p')
        .select(`TO_CHAR(DATE_TRUNC('month', p.created_at), 'YYYY-MM')`, 'month')
        .addSelect(
          `COALESCE(SUM(CASE WHEN p.payment_status IN ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN p.amount_minor ELSE 0 END), 0)::bigint`,
          'revenueMinor',
        )
        .addSelect(
          `COUNT(*) FILTER (WHERE p.payment_status IN ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'))::int`,
          'successfulCount',
        )
        .addSelect(
          `COUNT(*) FILTER (WHERE p.payment_status IN ('CREATED', 'AUTHORIZED'))::int`,
          'pendingCount',
        )
        .addSelect(
          `COUNT(*) FILTER (WHERE p.payment_status = 'FAILED')::int`,
          'failedCount',
        )
        .where('p.created_at >= :since', { since: sinceDate })
        .groupBy(`TO_CHAR(DATE_TRUNC('month', p.created_at), 'YYYY-MM')`)
        .orderBy('month', 'ASC')
        .getRawMany(),

      this.refundRepo
        .createQueryBuilder('r')
        .select(`TO_CHAR(DATE_TRUNC('month', r.created_at), 'YYYY-MM')`, 'month')
        .addSelect('COUNT(*)::int', 'refundCount')
        .addSelect(
          `COALESCE(SUM(CASE WHEN r.status != 'FAILED' THEN r.amount_minor ELSE 0 END), 0)::bigint`,
          'refundAmountMinor',
        )
        .where('r.created_at >= :since', { since: sinceDate })
        .groupBy(`TO_CHAR(DATE_TRUNC('month', r.created_at), 'YYYY-MM')`)
        .orderBy('month', 'ASC')
        .getRawMany(),

      this.subscriptionRepo
        .createQueryBuilder('s')
        .select(`COALESCE(s.plan_snapshot->>'name', 'Plan')`, 'planName')
        .addSelect(`COALESCE(s.plan_snapshot->>'code', 'PLAN')`, 'planCode')
        .addSelect(`COUNT(*) FILTER (WHERE s.status = 'ACTIVE')::int`, 'activeCount')
        .addSelect('COUNT(*)::int', 'totalCount')
        .addSelect(
          `COALESCE(SUM(CASE WHEN s.status IN ('ACTIVE', 'EXPIRED', 'PAST_DUE') THEN s.amount_minor ELSE 0 END), 0)::bigint`,
          'revenueMinor',
        )
        .groupBy(`s.plan_snapshot->>'name'`)
        .addGroupBy(`s.plan_snapshot->>'code'`)
        .orderBy('"activeCount"', 'DESC')
        .getRawMany(),

      this.subscriptionRepo
        .createQueryBuilder('s')
        .select(`TO_CHAR(DATE_TRUNC('month', s.created_at), 'YYYY-MM')`, 'month')
        .addSelect(
          `COUNT(*) FILTER (WHERE s.previous_subscription_id IS NULL AND s.status != 'PENDING')::int`,
          'newSubscriptions',
        )
        .addSelect(
          `COUNT(*) FILTER (WHERE s.previous_subscription_id IS NOT NULL AND s.status != 'PENDING')::int`,
          'renewalsAndUpgrades',
        )
        .addSelect(
          `COUNT(*) FILTER (WHERE s.status IN ('EXPIRED', 'CANCELLED'))::int`,
          'expirationsAndCancellations',
        )
        .where('s.created_at >= :since', { since: sinceDate })
        .groupBy(`TO_CHAR(DATE_TRUNC('month', s.created_at), 'YYYY-MM')`)
        .orderBy('month', 'ASC')
        .getRawMany(),
    ]);

    const statusMap = new Map<string, { count: number; amountMinor: number }>();
    for (const r of paymentSummaryRows) {
      statusMap.set(String(r.status), {
        count: Number(r.count || 0),
        amountMinor: Number(r.totalAmountMinor || 0),
      });
    }

    const totalRevenueMinor =
      (statusMap.get(PaymentStatus.CAPTURED)?.amountMinor || 0) +
      (statusMap.get(PaymentStatus.PARTIALLY_REFUNDED)?.amountMinor || 0) +
      (statusMap.get(PaymentStatus.REFUNDED)?.amountMinor || 0);

    const totalRefundedMinor = Number(refundSummaryRow?.totalRefundedMinor || 0);
    const netRevenueMinor = Math.max(0, totalRevenueMinor - totalRefundedMinor);

    const successfulTransactions =
      (statusMap.get(PaymentStatus.CAPTURED)?.count || 0) +
      (statusMap.get(PaymentStatus.PARTIALLY_REFUNDED)?.count || 0) +
      (statusMap.get(PaymentStatus.REFUNDED)?.count || 0);

    const pendingTransactions =
      (statusMap.get(PaymentStatus.CREATED)?.count || 0) +
      (statusMap.get(PaymentStatus.AUTHORIZED)?.count || 0);

    const failedTransactions = statusMap.get(PaymentStatus.FAILED)?.count || 0;

    const subStatusMap = new Map<string, number>();
    for (const r of subStatusRows) {
      subStatusMap.set(String(r.status), Number(r.count || 0));
    }

    // Build contiguous month buckets so charts show clean continuous timelines
    const monthBuckets: string[] = [];
    const cursor = new Date(sinceDate);
    for (let i = 0; i < safeMonths; i++) {
      monthBuckets.push(
        `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
      );
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    const monthlyPayMap = new Map<string, any>();
    for (const row of monthlyPaymentsRows) monthlyPayMap.set(row.month, row);

    const monthlyRefMap = new Map<string, any>();
    for (const row of monthlyRefundsRows) monthlyRefMap.set(row.month, row);

    const monthlySubMap = new Map<string, any>();
    for (const row of monthlySubLifecycleRows) monthlySubMap.set(row.month, row);

    const monthlyRevenue = monthBuckets.map((month) => {
      const p = monthlyPayMap.get(month);
      const r = monthlyRefMap.get(month);
      const revMinor = Number(p?.revenueMinor || 0);
      const refMinor = Number(r?.refundAmountMinor || 0);
      return {
        month,
        revenueMinor: revMinor,
        revenue: Number((revMinor / 100).toFixed(2)),
        refundMinor: refMinor,
        refund: Number((refMinor / 100).toFixed(2)),
      };
    });

    const transactionOutcomes = monthBuckets.map((month) => {
      const p = monthlyPayMap.get(month);
      return {
        month,
        successful: Number(p?.successfulCount || 0),
        pending: Number(p?.pendingCount || 0),
        failed: Number(p?.failedCount || 0),
      };
    });

    const subscriptionTrends = monthBuckets.map((month) => {
      const s = monthlySubMap.get(month);
      return {
        month,
        newSubscriptions: Number(s?.newSubscriptions || 0),
        renewals: Number(s?.renewalsAndUpgrades || 0),
        expirations: Number(s?.expirationsAndCancellations || 0),
      };
    });

    const refundTrend = monthBuckets.map((month) => {
      const r = monthlyRefMap.get(month);
      const amt = Number(r?.refundAmountMinor || 0);
      return {
        month,
        count: Number(r?.refundCount || 0),
        amountMinor: amt,
        amount: Number((amt / 100).toFixed(2)),
      };
    });

    return {
      kpis: {
        totalRevenueMinor,
        totalRevenue: Number((totalRevenueMinor / 100).toFixed(2)),
        netRevenueMinor,
        netRevenue: Number((netRevenueMinor / 100).toFixed(2)),
        totalRefundedMinor,
        totalRefunded: Number((totalRefundedMinor / 100).toFixed(2)),
        totalRefundsCount: Number(refundSummaryRow?.totalRefunds || 0),
        successfulTransactions,
        pendingTransactions,
        failedTransactions,
        activeSubscriptions: subStatusMap.get(SubscriptionStatus.ACTIVE) || 0,
        pastDueSubscriptions: subStatusMap.get(SubscriptionStatus.PAST_DUE) || 0,
        expiredSubscriptions: subStatusMap.get(SubscriptionStatus.EXPIRED) || 0,
        cancelledSubscriptions: subStatusMap.get(SubscriptionStatus.CANCELLED) || 0,
        expiringSubscriptions: expiringCount,
      },
      charts: {
        monthlyRevenue,
        transactionOutcomes,
        planDistribution: planDistRows.map((p) => ({
          planName: p.planName,
          planCode: p.planCode,
          activeCount: Number(p.activeCount || 0),
          totalCount: Number(p.totalCount || 0),
          revenueMinor: Number(p.revenueMinor || 0),
          revenue: Number((Number(p.revenueMinor || 0) / 100).toFixed(2)),
        })),
        subscriptionTrends,
        refundTrend,
      },
    };
  }
}
