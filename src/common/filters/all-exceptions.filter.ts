import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Request, Response } from 'express';
import { MercoraLogger } from '../logger';
import { RequestContext } from '../context/request-context';
import { sanitizeLogData } from '../logger/sanitizer.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new MercoraLogger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;

    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const requestId =
      (req as any)?.requestId || RequestContext.getRequestId() || 'unknown';
    const path = (req?.originalUrl || req?.url || '/').split('?')[0];
    const timestamp = new Date().toISOString();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'An unexpected internal error occurred.';
    let errors: Record<string, string> | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string | string[]) || exception.message;
        if (obj.errors && typeof obj.errors === 'object') {
          errors = obj.errors as Record<string, string>;
        }
      }
    } else if (exception instanceof QueryFailedError) {
      const driverErr = (exception as any)?.driverError || {};
      const pgCode = driverErr?.code;
      if (pgCode === '23505') {
        statusCode = HttpStatus.CONFLICT;
        message = 'A record with the provided unique identifier already exists.';
      } else if (pgCode === '23503') {
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'Referenced entity does not exist or cannot be removed while in use.';
      } else if (pgCode === '22P02') {
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'Invalid identifier or parameter syntax provided.';
      } else {
        statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Database operation failed.';
      }
    }

    const logMeta = sanitizeLogData({
      requestId,
      method: req?.method,
      path,
      statusCode,
      userId: (req as any)?.user?.id || null,
      ip: RequestContext.get()?.ip || req?.ip,
      query: req?.query,
    }) as Record<string, unknown>;

    if (statusCode >= 500) {
      this.logger.error(`${req?.method} ${path} -> ${statusCode}`, exception, logMeta);
    } else {
      this.logger.warn(`${req?.method} ${path} -> ${statusCode}: ${Array.isArray(message) ? message.join(', ') : message}`, logMeta);
    }

    res.status(statusCode).json({
      success: false,
      statusCode,
      message,
      ...(errors ? { errors } : {}),
      requestId,
      timestamp,
      path,
    });
  }
}
