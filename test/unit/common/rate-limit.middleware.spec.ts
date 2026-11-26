import { rateLimitMiddleware } from '../../../src/common/middleware/rate-limit.middleware';

describe('rateLimitMiddleware (Unit)', () => {
  const createReqRes = (method: string, originalUrl: string, ip = '10.0.0.1') => {
    const req: any = {
      method,
      originalUrl,
      url: originalUrl,
      headers: {},
      ip,
      socket: { remoteAddress: ip },
    };
    const headers: Record<string, string> = {};
    const res: any = {
      statusCode: 200,
      body: null as any,
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      status: jest.fn(function (code: number) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(function (payload: any) {
        this.body = payload;
        return this;
      }),
    };
    const next = jest.fn();
    return { req, res, next, headers };
  };

  it('BE-SEC-001: bypasses OPTIONS preflight and non-rate-limited paths', () => {
    const opt = createReqRes('OPTIONS', '/api/v1/auth/login');
    rateLimitMiddleware(opt.req, opt.res, opt.next);
    expect(opt.next).toHaveBeenCalledTimes(1);

    const pub = createReqRes('GET', '/api/businesses');
    rateLimitMiddleware(pub.req, pub.res, pub.next);
    expect(pub.next).toHaveBeenCalledTimes(1);
    expect(pub.headers['X-RateLimit-Limit']).toBeUndefined();
  });

  it('BE-SEC-001: enforces 429 + Retry-After after exceeding limit on /api/v1/auth/login', () => {
    const ip = '192.168.99.1';
    for (let i = 0; i < 20; i++) {
      const ctx = createReqRes('POST', '/api/v1/auth/login', ip);
      rateLimitMiddleware(ctx.req, ctx.res, ctx.next);
      expect(ctx.next).toHaveBeenCalledTimes(1);
    }

    const blocked = createReqRes('POST', '/api/v1/auth/login', ip);
    rateLimitMiddleware(blocked.req, blocked.res, blocked.next);
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.headers['Retry-After']).toBeDefined();
    expect(blocked.res.body.statusCode).toBe(429);
  });

  it('BE-SEC-001: documents BUG-009 (/api/auth/forgot-password is not rate-limited)', () => {
    const ctx = createReqRes('POST', '/api/auth/forgot-password', '192.168.99.2');
    rateLimitMiddleware(ctx.req, ctx.res, ctx.next);
    expect(ctx.next).toHaveBeenCalledTimes(1);
    // Unlike /api/v1/auth/forgot-password, /api/auth/forgot-password has no X-RateLimit-Limit header
    expect(ctx.headers['X-RateLimit-Limit']).toBeUndefined();
  });
});
