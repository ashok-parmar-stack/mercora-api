import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

import { configureApp } from '../../src/bootstrap/configure-app';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { HealthController } from '../../src/health/health.controller';
import { ElasticsearchService } from '../../src/elasticsearch/elasticsearch.service';
import { AuthController } from '../../src/modules/auth/controllers/auth.controller';
import { AuthService } from '../../src/modules/auth/services/auth.service';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { PublicBusinessController } from '../../src/modules/businesses/presentation/controllers/public-business.controller';
import { ListBusinessesUseCase } from '../../src/modules/businesses/application/use-cases/list-businesses/list-businesses.use-case';
import { GetBusinessUseCase } from '../../src/modules/businesses/application/use-cases/get-business/get-business.use-case';
import { CreateBusinessUseCase } from '../../src/modules/businesses/application/use-cases/create-business/create-business.use-case';
import { BUSINESS_REPOSITORY_TOKEN } from '../../src/modules/businesses/domain/repositories/business.repository.interface';
import { BusinessEnquiryEntity } from '../../src/database/entities/business-enquiry.entity';

describe('Mercora API HTTP Contracts (Integration / Supertest)', () => {
  let app: INestApplication;

  const mockAuthService = {
    register: jest.fn().mockResolvedValue({ message: 'Verification email sent', email: 'new@mercora.com' }),
    login: jest.fn().mockResolvedValue({
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresIn: '15m',
      user: { id: 'u-1', email: 'alice@mercora.com', name: 'Alice', role: 'CUSTOMER', isEmailVerified: true },
    }),
    refreshToken: jest.fn().mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: '15m' }),
    logout: jest.fn().mockResolvedValue({ message: 'Logged out successfully.' }),
    getMe: jest.fn().mockResolvedValue({ user: { id: 'u-1' }, session: null }),
    verifyEmail: jest.fn().mockResolvedValue({ message: 'Email verified.' }),
    resendVerification: jest.fn().mockResolvedValue({ message: 'Sent.' }),
    forgotPassword: jest.fn().mockResolvedValue({ message: 'Sent.' }),
    resetPassword: jest.fn().mockResolvedValue({ message: 'Reset.' }),
  };

  const mockListBusinesses = {
    execute: jest.fn().mockResolvedValue({
      data: [{ id: 'biz-1', name: 'Apex Steel', slug: 'apex-steel' }],
      meta: { total: 1, page: 1, limit: 12, totalPages: 1 },
    }),
  };

  const mockGetBusiness = {
    execute: jest.fn().mockResolvedValue({ id: 'biz-1', name: 'Apex Steel', slug: 'apex-steel' }),
  };

  const mockCreateBusiness = {
    execute: jest.fn().mockResolvedValue({ id: 'biz-2', name: 'Beta Corp', slug: 'beta-corp' }),
  };

  const mockBusinessRepo = {
    findById: jest.fn(async (id: string) => (id === 'biz-1' ? { id: 'biz-1', name: 'Apex Steel' } : null)),
    findBySlug: jest.fn().mockResolvedValue(null),
    findFeatured: jest.fn().mockResolvedValue([]),
    getDirectoryFacets: jest.fn().mockResolvedValue({ totalBusinesses: 1, locations: [], cities: [] }),
  };

  const mockEnquiryRepo = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ ...data, id: 'enq-1', createdAt: new Date('2026-01-01T00:00:00.000Z') })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, AuthController, PublicBusinessController],
      providers: [
        Reflector,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'database.type') return 'postgres';
              if (key === 'nodeEnv') return 'test';
              if (key === 'swagger.enabled') return false;
              return undefined;
            },
          },
        },
        {
          provide: ElasticsearchService,
          useValue: { checkHealth: jest.fn().mockResolvedValue({ status: 'green', isConnected: true }) },
        },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ListBusinessesUseCase, useValue: mockListBusinesses },
        { provide: GetBusinessUseCase, useValue: mockGetBusiness },
        { provide: CreateBusinessUseCase, useValue: mockCreateBusiness },
        { provide: BUSINESS_REPOSITORY_TOKEN, useValue: mockBusinessRepo },
        { provide: getRepositoryToken(BusinessEnquiryEntity), useValue: mockEnquiryRepo },
        {
          provide: APP_GUARD,
          useValue: {
            canActivate: (ctx: any) => {
              const req = ctx.switchToHttp().getRequest();
              const authHeader = req.headers['authorization'];
              if (authHeader === 'Bearer valid-customer') {
                req.user = { userId: 'u-1', sessionId: 's-1', role: 'CUSTOMER' };
                return true;
              }
              if (
                req.url.startsWith('/api/health') ||
                (req.url.startsWith('/api/businesses') && req.method === 'GET') ||
                req.url === '/api/businesses/enquiries' ||
                req.url.includes('/auth/login') ||
                req.url.includes('/auth/register')
              ) {
                return true;
              }
              return false;
            },
          },
        },
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector) => new RolesGuard(reflector),
          inject: [Reflector],
        },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          const authHeader = req.headers['authorization'];
          if (authHeader === 'Bearer valid-customer') {
            req.user = { userId: 'u-1', sessionId: 's-1', role: 'CUSTOMER' };
            return true;
          }
          // Allow @Public() routes (checked via reflector or route path in test)
          if (
            req.url.startsWith('/api/health') ||
            req.url.startsWith('/api/businesses') && req.method === 'GET' ||
            req.url === '/api/businesses/enquiries' ||
            req.url.includes('/auth/login') ||
            req.url.includes('/auth/register')
          ) {
            return true;
          }
          return false;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('API-HLT-001: GET /api/health returns 200 and telemetry payload', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services.database.type).toBe('postgres');
    expect(res.body.services.elasticsearch.isConnected).toBe(true);
  });

  it('API-AUTH-002: POST /api/v1/auth/login validates DTO (422) and accepts valid login (200)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(422);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'alice@mercora.com', password: 'Password123!' })
      .expect(200);

    expect(res.body.accessToken).toBe('test-access');
    expect(res.body.user.email).toBe('alice@mercora.com');
  });

  it('API-AUTH-004: GET /api/v1/auth/me blocks unauthenticated requests (403/401)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect([401, 403]).toContain(res.status);
  });

  it('API-BUS-001: GET /api/businesses and /api/businesses/facets return 200', async () => {
    const listRes = await request(app.getHttpServer()).get('/api/businesses').expect(200);
    expect(listRes.body.data).toHaveLength(1);

    const facetsRes = await request(app.getHttpServer()).get('/api/businesses/facets').expect(200);
    expect(facetsRes.body.totalBusinesses).toBe(1);
  });

  it('API-BUS-002: POST /api/businesses requires auth and creates business when authenticated', async () => {
    const unauth = await request(app.getHttpServer())
      .post('/api/businesses')
      .send({ name: 'Beta Corp', category: 'Metals', city: 'Surat', state: 'Gujarat' });
    expect([401, 403]).toContain(unauth.status);

    const created = await request(app.getHttpServer())
      .post('/api/businesses')
      .set('Authorization', 'Bearer valid-customer')
      .send({ name: 'Beta Corp', category: 'Metals', city: 'Surat', state: 'Gujarat' })
      .expect(201);
    expect(created.body.slug).toBe('beta-corp');
  });

  it('API-ENQ-001: POST /api/businesses/enquiries validates required fields (422) and persists valid RFQ (200)', async () => {
    await request(app.getHttpServer())
      .post('/api/businesses/enquiries')
      .send({ businessId: '', message: '' })
      .expect(422);

    const ok = await request(app.getHttpServer())
      .post('/api/businesses/enquiries')
      .send({
        businessId: 'biz-1',
        businessName: 'Apex Steel',
        name: 'John Buyer',
        email: 'john@buyer.com',
        phone: '+91 9876543210',
        message: 'Need 500 units quote',
      })
      .expect(200);

    expect(ok.body.success).toBe(true);
    expect(ok.body.id).toBe('enq-1');
  });
});
