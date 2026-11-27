/**
 * MercoraLogger
 * ─────────────────────────────────────────────────────────────────────────────
 * Production-grade structured logger compatible with NestJS LoggerService and
 * Winston JSON / DailyRotateFile transports.
 *
 * Guarantees:
 * - Automatic correlation via RequestContext requestId
 * - Recursive secret/PII redaction via sanitizeLogData()
 * - No duplicate NestJS context echoing
 * - Dedicated audit and payment telemetry helpers
 */
import { Logger, LoggerService } from '@nestjs/common';
import { RequestContext } from '../context/request-context';
import { sanitizeLogData } from './sanitizer.util';

export class MercoraLogger implements LoggerService {
  private readonly nestLogger: Logger;

  constructor(private readonly context: string) {
    this.nestLogger = new Logger(context);
  }

  private enrichMeta(meta?: object): Record<string, unknown> | undefined {
    const requestId = RequestContext.getRequestId();
    const base: Record<string, unknown> = {};
    if (requestId) {
      base.requestId = requestId;
    }
    if (meta && typeof meta === 'object') {
      Object.assign(base, meta);
    }
    if (Object.keys(base).length === 0) {
      return undefined;
    }
    return sanitizeLogData(base) as Record<string, unknown>;
  }

  private formatMessage(message: unknown, meta?: object): string {
    const cleanMsg =
      typeof message === 'string'
        ? message
        : JSON.stringify(sanitizeLogData(message));
    const enriched = this.enrichMeta(meta);
    if (!enriched) return cleanMsg;
    return `${cleanMsg} | ${JSON.stringify(enriched)}`;
  }

  log(message: unknown, meta?: object): void {
    this.nestLogger.log(this.formatMessage(message, meta));
  }

  /** Informational — normal operations */
  info(message: string, meta?: object): void {
    this.nestLogger.log(this.formatMessage(message, meta));
  }

  /** Debug — visible in development or when LOG_LEVEL=debug */
  debug(message: unknown, meta?: object): void {
    this.nestLogger.debug(this.formatMessage(message, meta));
  }

  /** Warning — expected edge cases & recoverable anomalies */
  warn(message: unknown, meta?: object): void {
    this.nestLogger.warn(this.formatMessage(message, meta));
  }

  /** Error — unexpected failures with sanitized error details */
  error(message: unknown, errorOrMeta?: unknown, meta?: object): void {
    if (errorOrMeta instanceof Error) {
      const sanitizedErr = sanitizeLogData(errorOrMeta) as Record<string, unknown>;
      const combined: Record<string, unknown> = {
        ...((meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {})),
        errorName: sanitizedErr.name,
        errorMessage: sanitizedErr.message,
      };
      const trace =
        process.env.NODE_ENV !== 'production' ? errorOrMeta.stack : undefined;
      this.nestLogger.error(this.formatMessage(message, combined), trace);
      return;
    }

    if (typeof errorOrMeta === 'string' && !meta) {
      this.nestLogger.error(this.formatMessage(`${String(message)} | ${errorOrMeta}`));
      return;
    }

    const extraMeta =
      errorOrMeta && typeof errorOrMeta === 'object'
        ? { ...(errorOrMeta as Record<string, unknown>), ...((meta as Record<string, unknown>) || {}) }
        : meta;
    this.nestLogger.error(this.formatMessage(message, extraMeta));
  }

  /** Lifecycle — module init, seed, boot, scheduler ticks */
  lifecycle(message: string, meta?: object): void {
    this.nestLogger.log(this.formatMessage(`[LIFECYCLE] ${message}`, meta));
  }

  /** Audit trail — administrative and user governance mutations */
  audit(
    action: string,
    meta: {
      userId?: string;
      module: string;
      entityId?: string;
      detail?: string;
    },
  ): void {
    this.nestLogger.log(
      this.formatMessage(`[AUDIT] ${action}`, {
        module: meta.module,
        userId: meta.userId || null,
        entityId: meta.entityId || null,
        detail: meta.detail || undefined,
      }),
    );
  }

  /** Payment & subscription telemetry — sanitized, correlated financial events */
  payment(
    event: string,
    meta: {
      gateway?: string;
      paymentId?: string;
      subscriptionId?: string;
      businessId?: string;
      orderId?: string;
      gatewayEventId?: string;
      invoiceId?: string;
      refundId?: string;
      amountMinor?: number;
      currency?: string;
      status?: string;
      detail?: string;
    },
  ): void {
    this.nestLogger.log(this.formatMessage(`[PAYMENT] ${event}`, meta));
  }
}
