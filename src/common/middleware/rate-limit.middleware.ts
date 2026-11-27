import type { NextFunction, Request, Response } from 'express';

interface RateLimitRule {
  prefix: string;
  limit: number;
  windowMs: number;
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_RULES: RateLimitRule[] = [
  { prefix: '/api/v1/auth/login', limit: 20, windowMs: 60_000 },
  { prefix: '/api/auth/login', limit: 20, windowMs: 60_000 },
  { prefix: '/api/v1/auth/register', limit: 10, windowMs: 60_000 },
  { prefix: '/api/auth/register', limit: 10, windowMs: 60_000 },
  { prefix: '/api/v1/auth/forgot-password', limit: 10, windowMs: 60_000 },
  { prefix: '/api/auth/forgot-password', limit: 10, windowMs: 60_000 },
  { prefix: '/api/v1/auth/reset-password', limit: 10, windowMs: 60_000 },
  { prefix: '/api/auth/reset-password', limit: 10, windowMs: 60_000 },
  { prefix: '/api/v1/auth/resend-verification', limit: 10, windowMs: 60_000 },
  { prefix: '/api/auth/resend-verification', limit: 10, windowMs: 60_000 },
  { prefix: '/api/businesses/enquiries', limit: 20, windowMs: 60_000 },
  { prefix: '/api/storage/upload', limit: 30, windowMs: 60_000 },
  { prefix: '/api/v1/payments/create-order', limit: 15, windowMs: 60_000 },
  { prefix: '/api/v1/payments/verify', limit: 20, windowMs: 60_000 },
  { prefix: '/api/v1/subscriptions/checkout', limit: 15, windowMs: 60_000 },
  { prefix: '/api/v1/subscriptions/renew', limit: 15, windowMs: 60_000 },
  { prefix: '/api/v1/subscriptions/upgrade', limit: 15, windowMs: 60_000 },
  { prefix: '/api/v1/subscriptions/downgrade', limit: 15, windowMs: 60_000 },
  { prefix: '/api/v1/subscriptions/cancel', limit: 15, windowMs: 60_000 },
];

const buckets = new Map<string, BucketEntry>();
let lastSweep = Date.now();

function getClientIp(req: Request): string {
  // Prefer Express-resolved req.ip (respects configured trust proxy) over raw spoofable headers
  if (req.ip) {
    return req.ip;
  }
  return req.socket?.remoteAddress || 'unknown';
}

function sweepExpired(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, entry] of buckets.entries()) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

/**
 * Lightweight sliding-window IP rate limiter protecting authentication,
 * RFQ enquiry submission, and upload endpoints against brute-force abuse.
 */
export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const reqPath = (req.originalUrl || req.url || '').split('?')[0].toLowerCase();
  const matched = RATE_LIMIT_RULES.find((rule) => reqPath.startsWith(rule.prefix));
  if (!matched) {
    next();
    return;
  }

  const now = Date.now();
  sweepExpired(now);

  const key = `${matched.prefix}:${getClientIp(req)}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + matched.windowMs });
    res.setHeader('X-RateLimit-Limit', String(matched.limit));
    res.setHeader('X-RateLimit-Remaining', String(matched.limit - 1));
    next();
    return;
  }

  existing.count += 1;
  const remaining = Math.max(0, matched.limit - existing.count);
  res.setHeader('X-RateLimit-Limit', String(matched.limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  if (existing.count > matched.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
      success: false,
      statusCode: 429,
      message: 'Too many requests. Please wait a moment before trying again.',
    });
    return;
  }

  next();
}
