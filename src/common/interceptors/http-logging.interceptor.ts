import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MercoraLogger } from '../logger';
import { RequestContext } from '../context/request-context';
import { sanitizeLogData } from '../logger/sanitizer.util';

const SLOW_REQUEST_THRESHOLD_MS = 1000;

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new MercoraLogger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const startTime = Date.now();

    const method = req?.method || 'UNKNOWN';
    const path = (req?.originalUrl || req?.url || '/').split('?')[0];
    const requestId =
      req?.requestId || RequestContext.getRequestId() || 'unknown';

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          const statusCode = res?.statusCode || 200;
          const meta = sanitizeLogData({
            requestId,
            method,
            path,
            statusCode,
            durationMs,
            userId: req?.user?.id || null,
            role: req?.user?.role || null,
            queryKeys: req?.query ? Object.keys(req.query) : [],
          }) as Record<string, unknown>;

          if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
            this.logger.warn(`Slow API request completed (${durationMs}ms)`, meta);
          } else {
            this.logger.info(`${method} ${path} ${statusCode} (${durationMs}ms)`, meta);
          }
        },
      }),
    );
  }
}
