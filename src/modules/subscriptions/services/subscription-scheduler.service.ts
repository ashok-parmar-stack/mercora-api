import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MercoraLogger } from '../../../common/logger';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { PaymentService } from './payment.service';
import { WebhookService } from './webhook.service';

@Injectable()
export class SubscriptionSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new MercoraLogger(SubscriptionSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly lifecycleService: SubscriptionLifecycleService,
    private readonly paymentService: PaymentService,
    private readonly webhookService: WebhookService,
  ) {}

  onModuleInit() {
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const isTest = process.env.NODE_ENV === 'test';

    if (isServerless || isTest) {
      return;
    }

    void this.reloadSchedule();
  }

  onModuleDestroy() {
    this.clearTimer();
  }

  private clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async reloadSchedule(): Promise<void> {
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const isTest = process.env.NODE_ENV === 'test';
    if (isServerless || isTest) {
      this.clearTimer();
      return;
    }

    let enabled = true;
    let intervalMs = 300_000;

    try {
      const settings = await this.lifecycleService.getPaymentSettings();
      enabled = settings.schedulerEnabled !== false;
      intervalMs = Math.max(60_000, Number(settings.schedulerIntervalMs || 300_000));
    } catch (err: any) {
      this.logger.warn('Could not load DB scheduler settings at boot; falling back to defaults', {
        reason: err?.message,
      });
    }

    this.clearTimer();

    if (!enabled) {
      this.logger.lifecycle('Subscription background maintenance scheduler disabled in DB settings');
      return;
    }

    this.timer = setInterval(() => {
      void this.runMaintenanceTick();
    }, intervalMs);
    this.timer.unref();

    this.logger.lifecycle('Subscription background maintenance scheduler active', {
      intervalMs,
      source: 'database',
    });
  }

  async runMaintenanceTick() {
    if (this.isRunning) {
      return { skipped: true, reason: 'already_running' };
    }

    this.isRunning = true;
    try {
      const settings = await this.lifecycleService.getPaymentSettings();
      const reconcileAfter = Math.max(1, Number(settings.reconcilePendingMinutes || 2));

      const [lifecycle, reconciliation, webhookRetries] = await Promise.all([
        this.lifecycleService.runLifecycleSweep(),
        this.paymentService.reconcilePendingPayments(reconcileAfter),
        this.webhookService.retryFailedWebhookEvents(),
      ]);

      return {
        skipped: false,
        reconcilePendingMinutes: reconcileAfter,
        lifecycle,
        reconciliation,
        webhookRetries,
      };
    } catch (err: any) {
      this.logger.error('Subscription maintenance tick failed', err);
      throw err;
    } finally {
      this.isRunning = false;
    }
  }
}
