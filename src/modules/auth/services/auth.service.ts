import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MercoraLogger } from '../../../common/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity } from '../../../database/entities/user.entity';
import { SessionEntity } from '../../../database/entities/session.entity';

import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { SessionMetadata, SessionService } from './session.service';
import { RegistrationVerificationService } from './registration-verification.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { EmailDispatcherService } from '../../email/services/email-dispatcher.service';

import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ResendVerificationDto } from '../dto/resend-verification.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new MercoraLogger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly registrationService: RegistrationVerificationService,
    private readonly passwordRecoveryService: PasswordRecoveryService,
    private readonly emailDispatcher: EmailDispatcherService,
  ) { }

  /**
   * Scans for unhashed legacy passwords and upgrades them to bcrypt hashes.
   * Invoked on-demand via maintenance CLI rather than every worker boot.
   */
  async autoMigratePlaintextPasswords(): Promise<void> {
    try {
      const users = await this.userRepo
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.password IS NOT NULL')
        .getMany();

      for (const u of users) {
        if (
          u.password &&
          !u.password.startsWith('$2b$') &&
          !u.password.startsWith('$2a$') &&
          !u.password.startsWith('$2y$')
        ) {
          const hashed = await this.passwordService.hash(u.password);
          await this.userRepo.update(u.id, { password: hashed });
        }
      }
    } catch {
      // Silent migration fail-safe
    }
  }

  /**
   * 1. Register new user with PENDING status and send verification email
   */
  async register(dto: RegisterDto, ipAddress?: string): Promise<{ message: string; email: string }> {
    return this.registrationService.register(dto, ipAddress);
  }

  /**
   * 2. Login: Enforces 1 User ID = Maximum 1 Active Session
   * Atomically revokes previous active session, creates new session & tokens
   */
  async login(
    dto: LoginDto,
    meta: SessionMetadata,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    user: {
      id: string;
      email: string;
      name: string;
      role?: string;
      companyId?: string;
      isEmailVerified: boolean;
    };
  }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Select user with password
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .leftJoinAndSelect('user.status', 'status')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.email = :email', { email: normalizedEmail })
      .getOne();

    // Prevent user enumeration: generic error on mismatch
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    let isMatch = false;
    const isBcrypt =
      user.password.startsWith('$2b$') ||
      user.password.startsWith('$2a$') ||
      user.password.startsWith('$2y$');

    if (isBcrypt) {
      isMatch = await this.passwordService.compare(dto.password, user.password);
    } else {
      // Legacy plaintext password check & instant upgrade to bcrypt
      if (dto.password === user.password) {
        isMatch = true;
        const upgradedHash = await this.passwordService.hash(dto.password);
        await this.userRepo.update(user.id, { password: upgradedHash });
      }
    }

    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Status validation
    if (user.status) {
      if (user.status.code === 'PENDING') {
        throw new ForbiddenException(
          'Email verification required. Please verify your email before logging in.',
        );
      }
      if (user.status.code === 'INACTIVE' || user.status.code === 'SUSPENDED') {
        throw new ForbiddenException(
          'Your account has been deactivated. Please contact support.',
        );
      }
    }

    // Session metadata
    const sessionMeta: SessionMetadata = {
      deviceId: dto.deviceId || meta.deviceId || 'browser',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    };

    // 1. Generate temp refresh token to obtain hash
    const rawRefreshToken = this.tokenService.generateRandomToken(40);
    const refreshTokenHash = this.tokenService.hashToken(rawRefreshToken);

    // 2. ATOMIC DISPLACEMENT: Revoke old active session and insert new active session
    const session = await this.sessionService.createSession(
      user.id,
      refreshTokenHash,
      sessionMeta,
    );

    // 3. Generate Access Token signed with sessionId
    const roleCode = user.role?.code || 'CUSTOMER';
    const tokens = await this.tokenService.generateAuthTokens(
      user.id,
      session.id,
      user.email,
      roleCode,
      user.companyId,
    );

    // 4. Update last login timestamp
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    // 5. Send security alert email asynchronously (notifies about new session displacement)
    this.emailDispatcher.sendAsync({
      to: user.email,
      templateCode: 'NEW_LOGIN_ALERT',
      userId: user.id,
      context: {
        user_name: user.name,
        device_name: sessionMeta.userAgent || sessionMeta.deviceId || 'Web Client',
        ip_address: sessionMeta.ipAddress || 'Unknown',
        login_time: new Date().toUTCString(),
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: roleCode,
        companyId: user.companyId,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  /**
   * 3. Refresh Token Rotation (RTR) + Reuse Detection
   */
  async refreshToken(
    dto: RefreshTokenDto,
    meta: SessionMetadata,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const inputHash = this.tokenService.hashToken(dto.refreshToken);

    const session = await this.sessionRepo.findOne({
      where: { refreshTokenHash: inputHash },
      relations: ['user', 'user.role', 'user.status'],
    });

    // Reuse detection / Invalid token check
    if (!session) {
      this.logger.warn(`Potential token reuse or invalid token presented from IP: ${meta.ipAddress}`);
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    // Check if session has been revoked
    if (session.revokedAt) {
      if (session.revocationReason === 'NEW_LOGIN') {
        throw new UnauthorizedException(
          'Your session has ended because your account was logged in from another device. Please sign in again.',
        );
      }
      if (session.revocationReason === 'LOGOUT') {
        throw new UnauthorizedException('You have been logged out. Please sign in again.');
      }
      throw new UnauthorizedException(
        'Session is no longer valid or has expired. Please sign in again.',
      );
    }

    // Check expiration
    if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
      await this.sessionService.revokeSession(session.id, 'EXPIRED');
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    // Check user account status
    const user = session.user;
    if (
      user.status &&
      (user.status.code === 'INACTIVE' || user.status.code === 'SUSPENDED')
    ) {
      throw new UnauthorizedException('Account is inactive or suspended.');
    }

    // Generate new token pair
    const roleCode = user.role?.code || 'CUSTOMER';
    const newRawRefreshToken = this.tokenService.generateRandomToken(40);
    const newRefreshTokenHash = this.tokenService.hashToken(newRawRefreshToken);

    const tokens = await this.tokenService.generateAuthTokens(
      user.id,
      session.id,
      user.email,
      roleCode,
      user.companyId,
    );

    // Rotate token hash in database
    await this.sessionService.rotateRefreshToken(session.id, newRefreshTokenHash);

    return {
      accessToken: tokens.accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: tokens.expiresIn,
    };
  }

  /**
   * 4. Logout: Revoke current active session
   */
  async logout(sessionId: string): Promise<{ message: string }> {
    await this.sessionService.revokeSession(sessionId, 'LOGOUT');
    return { message: 'Logged out successfully.' };
  }

  /**
   * 5. Verify Email
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    return this.registrationService.verifyEmail(dto);
  }

  /**
   * 6. Resend Email Verification
   */
  async resendVerification(
    dto: ResendVerificationDto,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    return this.registrationService.resendVerification(dto, ipAddress);
  }

  /**
   * 7. Forgot Password
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    meta: SessionMetadata,
  ): Promise<{ message: string }> {
    return this.passwordRecoveryService.forgotPassword(dto, meta);
  }

  /**
   * 8. Reset Password
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.passwordRecoveryService.resetPassword(dto);
  }

  /**
   * 9. Get Current Authenticated User (Profile + Roles + Active Session)
   */
  async getMe(userId: string, sessionId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: [
        'role',
        'role.rolePermissions',
        'role.rolePermissions.permissionAction',
        'role.rolePermissions.permissionAction.permission',
        'status',
        'company',
        'userPermissions',
        'userPermissions.permissionAction',
        'userPermissions.permissionAction.permission',
      ],
    });

    if (!user) {
      throw new NotFoundException('User profile not found.');
    }

    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isEmailVerified: user.isEmailVerified,
        lastLoginAt: user.lastLoginAt,
        role: user.role
          ? {
            id: user.role.id,
            name: user.role.name,
            code: user.role.code,
          }
          : null,
        status: user.status
          ? {
            id: user.status.id,
            name: user.status.name,
            code: user.status.code,
          }
          : null,
        company: user.company
          ? {
            id: user.company.id,
            name: user.company.name,
            code: user.company.code,
          }
          : null,
        permissions: (user.userPermissions || []).map((up) => ({
          permission: up.permissionAction?.permission?.code,
          action: up.permissionAction?.code,
          effect: up.effect,
        })),
        effectivePermissions: (() => {
          const roleCode = user.role?.code;
          if (roleCode === 'SUPER_ADMIN') return ['*'];
          const allowed = new Set<string>();
          for (const rp of user.role?.rolePermissions || []) {
            const p = rp.permissionAction?.permission?.code;
            const a = rp.permissionAction?.code;
            if (p && a) allowed.add(`${p}.${a}`);
          }
          for (const up of user.userPermissions || []) {
            const p = up.permissionAction?.permission?.code;
            const a = up.permissionAction?.code;
            if (!p || !a) continue;
            const key = `${p}.${a}`;
            if (up.effect === 'DENY') allowed.delete(key);
            if (up.effect === 'ALLOW') allowed.add(key);
          }
          return Array.from(allowed);
        })(),
      },
      session: session
        ? {
          id: session.id,
          deviceId: session.deviceId,
          ipAddress: session.ipAddress,
          expiresAt: session.expiresAt,
          lastActivityAt: session.lastActivityAt,
        }
        : null,
    };
  }

  /**
   * 10. Update Current Authenticated User's Own Profile (name & phone)
   */
  async updateMe(userId: string, body: { name?: string; phone?: string }) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User profile not found.');
    }
    if (typeof body.name === 'string' && body.name.trim()) {
      user.name = body.name.trim();
    }
    if (typeof body.phone === 'string') {
      user.phone = body.phone.trim();
    }
    const saved = await this.userRepo.save(user);
    return {
      success: true,
      user: {
        id: saved.id,
        name: saved.name,
        email: saved.email,
        phone: saved.phone,
      },
    };
  }
}
