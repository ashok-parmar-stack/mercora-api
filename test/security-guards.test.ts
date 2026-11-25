import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { IS_PUBLIC_KEY } from '../src/modules/auth/decorators/public.decorator';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../src/common/decorators/permissions.decorator';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { SessionService } from '../src/modules/auth/services/session.service';

function mockExecutionContext(user?: any): ExecutionContext {
  const handler = () => {};
  class DummyController {}
  return {
    getHandler: () => handler,
    getClass: () => DummyController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function makeReflector(overrides: Record<string, any>): Reflector {
  return {
    getAllAndOverride: (key: string) => overrides[key],
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows @Public() routes without user context', () => {
    const guard = new RolesGuard(makeReflector({ [IS_PUBLIC_KEY]: true }));
    assert.equal(guard.canActivate(mockExecutionContext(undefined)), true);
  });

  it('denies access when user role is missing on role-protected route', () => {
    const guard = new RolesGuard(makeReflector({ [ROLES_KEY]: ['ADMIN'] }));
    assert.throws(
      () => guard.canActivate(mockExecutionContext({ id: 'u1' })),
      ForbiddenException,
    );
  });

  it('denies access when user role is insufficient', () => {
    const guard = new RolesGuard(makeReflector({ [ROLES_KEY]: ['SUPER_ADMIN', 'ADMIN'] }));
    assert.throws(
      () => guard.canActivate(mockExecutionContext({ id: 'u1', role: 'CUSTOMER' })),
      ForbiddenException,
    );
  });

  it('allows matching role case-insensitively', () => {
    const guard = new RolesGuard(makeReflector({ [ROLES_KEY]: ['DATA_MANAGER'] }));
    assert.equal(
      guard.canActivate(mockExecutionContext({ id: 'u1', role: 'data_manager' })),
      true,
    );
  });
});

describe('PermissionsGuard', () => {
  it('bypasses resolver check for SUPER_ADMIN', async () => {
    let called = false;
    const guard = new PermissionsGuard(
      makeReflector({ [PERMISSIONS_KEY]: ['USERS:DELETE'] }),
      {
        checkUserPermission: async () => {
          called = true;
          return { hasPermission: false };
        },
      } as any,
    );

    const allowed = await guard.canActivate(
      mockExecutionContext({ id: 'sa-1', role: 'SUPER_ADMIN' }),
    );
    assert.equal(allowed, true);
    assert.equal(called, false);
  });

  it('invokes checkUserPermission for non-SUPER_ADMIN and rejects missing permission', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ [PERMISSIONS_KEY]: ['ROLES:UPDATE'] }),
      {
        checkUserPermission: async (_userId: string, perm: string) => ({
          hasPermission: perm === 'ROLES:VIEW',
        }),
      } as any,
    );

    await assert.rejects(
      () => guard.canActivate(mockExecutionContext({ id: 'u2', role: 'DATA_MANAGER' })),
      ForbiddenException,
    );
  });

  it('allows request when resolver confirms required permission', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ [PERMISSIONS_KEY]: ['CATEGORIES:UPDATE'] }),
      {
        checkUserPermission: async () => ({ hasPermission: true }),
      } as any,
    );

    const allowed = await guard.canActivate(
      mockExecutionContext({ id: 'u2', role: 'DATA_MANAGER' }),
    );
    assert.equal(allowed, true);
  });
});

describe('JwtStrategy', () => {
  async function createStrategy(sessionResult: any) {
    let activityTouched = false;
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (k: string) =>
              k === 'auth.jwtAccessSecret' ? 'test-secret-key-min-32-chars-long!' : undefined,
          },
        },
        {
          provide: SessionService,
          useValue: {
            getActiveSession: async () => sessionResult,
            touchActivity: () => {
              activityTouched = true;
            },
          },
        },
      ],
    }).compile();

    return {
      strategy: moduleRef.get(JwtStrategy),
      wasTouched: () => activityTouched,
    };
  }

  it('rejects inactive, suspended, or pending users', async () => {
    for (const statusCode of ['INACTIVE', 'SUSPENDED', 'PENDING']) {
      const { strategy } = await createStrategy({
        id: 'sess-1',
        user: {
          id: 'u1',
          email: 'user@example.com',
          name: 'User',
          roleId: 'r1',
          role: { code: 'CUSTOMER' },
          statusId: 's1',
          status: { code: statusCode },
        },
      });

      await assert.rejects(
        () => strategy.validate({ sub: 'u1', sessionId: 'sess-1', role: 'CUSTOMER' } as any),
        UnauthorizedException,
      );
    }
  });

  it('rejects missing or revoked session', async () => {
    const { strategy } = await createStrategy(null);
    await assert.rejects(
      () => strategy.validate({ sub: 'u1', sessionId: 'missing', role: 'CUSTOMER' } as any),
      UnauthorizedException,
    );
  });

  it('hydrates active user identity from cookie or bearer session and touches activity', async () => {
    const { strategy, wasTouched } = await createStrategy({
      id: 'sess-active',
      user: {
        id: 'u-admin',
        email: 'admin@example.com',
        name: 'System Admin',
        roleId: 'r-admin',
        role: { code: 'ADMIN' },
        companyId: null,
        statusId: 's-active',
        status: { code: 'ACTIVE' },
        isEmailVerified: true,
      },
    });

    const extractor = (strategy as any)._jwtFromRequest;
    const extracted = extractor({
      headers: { cookie: 'foo=bar; mercora_access_token=abc.def.ghi; theme=light' },
    });
    assert.equal(extracted, 'abc.def.ghi');

    const identity = await strategy.validate({
      sub: 'u-admin',
      sessionId: 'sess-active',
      role: 'CUSTOMER',
    } as any);
    assert.equal(identity.role, 'ADMIN');
    assert.equal(identity.statusCode, 'ACTIVE');
    assert.equal(wasTouched(), true);
  });
});
