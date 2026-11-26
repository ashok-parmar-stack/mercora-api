import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../../src/modules/auth/services/auth.service';

describe('AuthService (Unit)', () => {
  const createMocks = () => {
    const qb: any = {
      addSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const userRepo: any = {
      createQueryBuilder: jest.fn(() => qb),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const sessionRepo: any = {
      findOne: jest.fn(),
    };

    const passwordService: any = {
      hash: jest.fn().mockResolvedValue('$2b$10$hashed'),
      compare: jest.fn(),
    };

    const tokenService: any = {
      generateRandomToken: jest.fn().mockReturnValue('raw-refresh-token'),
      hashToken: jest.fn((t: string) => `hash:${t}`),
      generateAuthTokens: jest.fn().mockResolvedValue({
        accessToken: 'jwt-access-token',
        expiresIn: '15m',
      }),
    };

    const sessionService: any = {
      createSession: jest.fn().mockResolvedValue({ id: 'sess-1' }),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      rotateRefreshToken: jest.fn().mockResolvedValue(undefined),
    };

    const registrationService: any = {
      register: jest.fn().mockResolvedValue({ message: 'Registered', email: 'a@b.com' }),
      verifyEmail: jest.fn().mockResolvedValue({ message: 'Verified' }),
      resendVerification: jest.fn().mockResolvedValue({ message: 'Resent' }),
    };

    const passwordRecoveryService: any = {
      forgotPassword: jest.fn().mockResolvedValue({ message: 'Sent' }),
      resetPassword: jest.fn().mockResolvedValue({ message: 'Reset' }),
    };

    const emailDispatcher: any = {
      sendAsync: jest.fn(),
    };

    const service = new AuthService(
      userRepo,
      sessionRepo,
      passwordService,
      tokenService,
      sessionService,
      registrationService,
      passwordRecoveryService,
      emailDispatcher,
    );

    return {
      service,
      qb,
      userRepo,
      sessionRepo,
      passwordService,
      tokenService,
      sessionService,
      registrationService,
      passwordRecoveryService,
      emailDispatcher,
    };
  };

  it('BE-AUTH-002: logs in active verified user, creates session, and dispatches alert', async () => {
    const { service, qb, passwordService, sessionService, userRepo, emailDispatcher } = createMocks();
    qb.getOne.mockResolvedValue({
      id: 'user-1',
      email: 'alice@mercora.com',
      name: 'Alice',
      password: '$2b$10$existinghash',
      companyId: 'comp-1',
      isEmailVerified: true,
      role: { code: 'CUSTOMER' },
      status: { code: 'ACTIVE' },
    });
    passwordService.compare.mockResolvedValue(true);

    const res = await service.login(
      { email: ' ALICE@mercora.com ', password: 'Secret123!' } as any,
      { deviceId: 'web', ipAddress: '127.0.0.1', userAgent: 'Jest' },
    );

    expect(res.accessToken).toBe('jwt-access-token');
    expect(res.refreshToken).toBe('raw-refresh-token');
    expect(res.user.email).toBe('alice@mercora.com');
    expect(res.user.role).toBe('CUSTOMER');
    expect(sessionService.createSession).toHaveBeenCalledWith(
      'user-1',
      'hash:raw-refresh-token',
      expect.objectContaining({ deviceId: 'web', ipAddress: '127.0.0.1' }),
    );
    expect(userRepo.update).toHaveBeenCalledWith('user-1', expect.objectContaining({ lastLoginAt: expect.any(Date) }));
    expect(emailDispatcher.sendAsync).toHaveBeenCalled();
  });

  it('BE-AUTH-002: rejects unknown user or wrong password with generic UnauthorizedException', async () => {
    const { service, qb, passwordService } = createMocks();
    qb.getOne.mockResolvedValue(null);

    await expect(
      service.login({ email: 'nobody@mercora.com', password: 'pw' } as any, {}),
    ).rejects.toThrow(UnauthorizedException);

    qb.getOne.mockResolvedValue({
      id: 'user-1',
      email: 'alice@mercora.com',
      password: '$2b$10$hash',
    });
    passwordService.compare.mockResolvedValue(false);

    await expect(
      service.login({ email: 'alice@mercora.com', password: 'wrong' } as any, {}),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('BE-AUTH-002: blocks PENDING, INACTIVE, and SUSPENDED accounts with ForbiddenException', async () => {
    const { service, qb, passwordService } = createMocks();
    passwordService.compare.mockResolvedValue(true);

    for (const statusCode of ['PENDING', 'INACTIVE', 'SUSPENDED']) {
      qb.getOne.mockResolvedValue({
        id: 'user-1',
        email: 'alice@mercora.com',
        password: '$2b$10$hash',
        status: { code: statusCode },
      });

      await expect(
        service.login({ email: 'alice@mercora.com', password: 'ok' } as any, {}),
      ).rejects.toThrow(ForbiddenException);
    }
  });

  it('BE-AUTH-004: rotates refresh token for active session and rejects revoked/expired sessions', async () => {
    const { service, sessionRepo, sessionService } = createMocks();

    sessionRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.refreshToken({ refreshToken: 'bad' }, {})).rejects.toThrow(UnauthorizedException);

    sessionRepo.findOne.mockResolvedValueOnce({
      id: 'sess-1',
      revokedAt: new Date(),
      revocationReason: 'NEW_LOGIN',
    });
    await expect(service.refreshToken({ refreshToken: 'reused' }, {})).rejects.toThrow(
      /logged in from another device/i,
    );

    sessionRepo.findOne.mockResolvedValueOnce({
      id: 'sess-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 10_000),
      user: { status: { code: 'ACTIVE' } },
    });
    await expect(service.refreshToken({ refreshToken: 'expired' }, {})).rejects.toThrow(/expired/i);
    expect(sessionService.revokeSession).toHaveBeenCalledWith('sess-1', 'EXPIRED');

    sessionRepo.findOne.mockResolvedValueOnce({
      id: 'sess-2',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-1',
        email: 'alice@mercora.com',
        role: { code: 'ADMIN' },
        status: { code: 'ACTIVE' },
      },
    });
    const rotated = await service.refreshToken({ refreshToken: 'valid' }, {});
    expect(rotated.accessToken).toBe('jwt-access-token');
    expect(sessionService.rotateRefreshToken).toHaveBeenCalledWith('sess-2', 'hash:raw-refresh-token');
  });

  it('BE-AUTH-004: logout revokes session and getMe throws NotFoundException when missing', async () => {
    const { service, sessionService, userRepo } = createMocks();
    const out = await service.logout('sess-99');
    expect(out.message).toMatch(/logged out/i);
    expect(sessionService.revokeSession).toHaveBeenCalledWith('sess-99', 'LOGOUT');

    userRepo.findOne.mockResolvedValue(null);
    await expect(service.getMe('missing-id', 'sess-99')).rejects.toThrow(NotFoundException);
  });
});
