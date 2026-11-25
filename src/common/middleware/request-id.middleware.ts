import * as crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from '../context/request-context';

const VALID_REQUEST_ID = /^[a-zA-Z0-9._-]{8,64}$/;

/**
 * Ensures every incoming API request receives a traceable correlation ID
 * echoed in `x-request-id` and bound to AsyncLocalStorage context.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const inbound = req.headers['x-request-id'];
  const inboundStr = Array.isArray(inbound) ? inbound[0] : inbound;
  const requestId =
    inboundStr && VALID_REQUEST_ID.test(inboundStr.trim())
      ? inboundStr.trim()
      : crypto.randomUUID();

  (req as any).requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string' && forwarded.length > 0
      ? forwarded.split(',')[0].trim()
      : req.ip || req.socket?.remoteAddress;

  RequestContext.run(
    {
      requestId,
      method: req.method,
      path: (req.originalUrl || req.url || '').split('?')[0],
      ip,
    },
    () => next(),
  );
}
