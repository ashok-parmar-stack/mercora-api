/**
 * MercoraLogger
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides structured JSON-friendly log context, module/context tagging,
 * and seamless NestJS LoggerService compatibility.
 *
 * Transports (Console + Winston Daily Rotate Files) capture logs automatically.
 */
import { Logger, LoggerService } from '@nestjs/common';

export class MercoraLogger implements LoggerService {
  private readonly nestLogger: Logger;

  constructor(private readonly context: string) {
    this.nestLogger = new Logger(context);
  }

  log(message: any, ...optionalParams: any[]): void {
    this.nestLogger.log(message, ...optionalParams);
  }

  /** Informational — normal operations */
  info(message: string, meta?: Record<string, any>): void {
    const formatted = meta
      ? `${message} | ${JSON.stringify(meta)}`
      : message;
    this.nestLogger.log(formatted, this.context);
  }

  /** Debug — only visible in development */
  debug(message: any, ...optionalParams: any[]): void {
    if (optionalParams.length > 0 && typeof optionalParams[0] === 'object') {
      this.nestLogger.debug(`${message} | ${JSON.stringify(optionalParams[0])}`, this.context);
    } else {
      this.nestLogger.debug(message, this.context);
    }
  }

  /** Warning — expected edge cases */
  warn(message: any, ...optionalParams: any[]): void {
    if (optionalParams.length > 0 && typeof optionalParams[0] === 'object') {
      this.nestLogger.warn(`${message} | ${JSON.stringify(optionalParams[0])}`, this.context);
    } else {
      this.nestLogger.warn(message, this.context);
    }
  }

  /** Error — unexpected failures */
  error(message: any, ...optionalParams: any[]): void {
    const error = optionalParams[0];
    const meta = optionalParams[1];
    const errorStr = error instanceof Error
      ? `${error.message} | stack: ${error.stack?.split('\n')[1]?.trim()}`
      : error !== undefined && typeof error !== 'string'
      ? JSON.stringify(error)
      : String(error ?? '');
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    this.nestLogger.error(`${message} | ${errorStr}${metaStr}`, undefined, this.context);
  }

  /** Lifecycle — module init, seed, boot */
  lifecycle(message: string, meta?: Record<string, any>): void {
    const formatted = meta
      ? `🚀 ${message} | ${JSON.stringify(meta)}`
      : `🚀 ${message}`;
    this.nestLogger.log(formatted, this.context);
  }

  /** Audit trail — who did what */
  audit(action: string, meta: { userId?: string; module: string; entityId?: string; detail?: string }): void {
    this.nestLogger.log(
      `📋 AUDIT | action=${action} module=${meta.module}${meta.userId ? ` userId=${meta.userId}` : ''}${meta.entityId ? ` entityId=${meta.entityId}` : ''}${meta.detail ? ` | ${meta.detail}` : ''}`,
      this.context,
    );
  }
}
