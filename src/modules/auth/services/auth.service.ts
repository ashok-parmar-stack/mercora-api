import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { UserEntity } from '../../../database/entities/user.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import { RoleEntity } from '../../../database/entities/role.entity';
import { SessionEntity } from '../../../database/entities/session.entity';
import { EmailVerificationEntity } from '../../../database/entities/email-verification.entity';
import { PasswordResetEntity } from '../../../database/entities/password-reset.entity';

import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { SessionMetadata, SessionService } from './session.service';
import { EmailDispatcherService } from '../../email/services/email-dispatcher.service';

import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ResendVerificationDto } from '../dto/resend-verification.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
    @InjectRepository(EmailVerificationEntity)
    private readonly emailVerifRepo: Repository<EmailVerificationEntity>,
    @InjectRepository(PasswordResetEntity)
    private readonly pwdResetRepo: Repository<PasswordResetEntity>,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly emailDispatcher: EmailDispatcherService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * On module startup, automatically check and upgrade any plaintext user passwords to bcrypt.
   */
  async onModuleInit(): Promise<void> {
    await this.autoMigratePlaintextPasswords();
  }

  /**
   * Scans for any unhashed passwords in the database and upgrades them immediately to bcrypt hashes.
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
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check duplicate email
    const existing = await this.userRepo.findOne({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    // Resolve or find PENDING user status
    let pendingStatus = await this.statusRepo.findOne({
      where: { type: 'USER', code: 'PENDING' },
    });
    if (!pendingStatus) {
      pendingStatus = await this.statusRepo.save(
        this.statusRepo.create({
          type: 'USER',
          code: 'PENDING',
          name: 'Pending Verification',
          description: 'Awaiting email verification',
          isActive: true,
        }),
      );
    }

    // Resolve default user role (CUSTOMER / BUYER / USER)
    let defaultRole = await this.roleRepo.findOne({
      where: { code: 'CUSTOMER' },
    });
    if (!defaultRole) {
      defaultRole = await this.roleRepo.findOne({
        where: { code: 'VIEWER' },
      });
    }

    const hashedPassword = await this.passwordService.hash(dto.password);

    const user = this.userRepo.create({
      name: dto.name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      statusId: pendingStatus.id,
      roleId: defaultRole ? defaultRole.id : undefined,
      isEmailVerified: false,
    });

    const savedUser = await this.userRepo.save(user);

    // Create verification token (valid for 24 hours)
    const rawToken = this.tokenService.generateRandomToken(32);
    const tokenHash = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.emailVerifRepo.save(
      this.emailVerifRepo.create({
        userId: savedUser.id,
        tokenHash,
        expiresAt,
        ipAddress,
      }),
    );

    // Build frontend verification URL
    const frontendUrl =
      this.configService.get<string>('auth.frontendUrl') ||
      'http://localhost:9000';
    const verificationLink = `${frontendUrl}/verify-email?token=${rawToken}`;

    // Dispatch dynamic email asynchronously (non-blocking)
    this.emailDispatcher.sendAsync({
      to: savedUser.email,
      templateCode: 'EMAIL_VERIFICATION',
      userId: savedUser.id,
      context: {
        user_name: savedUser.name,
        verification_link: verificationLink,
        expiry_minutes: 1440,
      },
    });

    return {
      message: 'Registration successful. A verification link has been sent to your email.',
      email: savedUser.email,
    };
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
    const tokenHash = this.tokenService.hashToken(dto.token);

    const record = await this.emailVerifRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired verification link.');
    }

    if (record.usedAt) {
      return { message: 'Email already verified. You may proceed to log in.' };
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Verification link has expired. Please request a new one.');
    }

    // Mark token as used
    record.usedAt = new Date();
    await this.emailVerifRepo.save(record);

    // Find ACTIVE status
    let activeStatus = await this.statusRepo.findOne({
      where: { type: 'USER', code: 'ACTIVE' },
    });
    if (!activeStatus) {
      activeStatus = await this.statusRepo.save(
        this.statusRepo.create({
          type: 'USER',
          code: 'ACTIVE',
          name: 'Active',
          isActive: true,
        }),
      );
    }

    // Upgrade user
    await this.userRepo.update(record.userId, {
      isEmailVerified: true,
      statusId: activeStatus.id,
    });

    return { message: 'Email verified successfully! You may now sign in.' };
  }

  /**
   * 6. Resend Email Verification
   */
  async resendVerification(
    dto: ResendVerificationDto,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findOne({
      where: { email: normalizedEmail },
    });

    // Anti-enumeration: Return success even if email not found
    if (!user || user.isEmailVerified) {
      return {
        message: 'If an unverified account exists with that email, a verification link has been sent.',
      };
    }

    const rawToken = this.tokenService.generateRandomToken(32);
    const tokenHash = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.emailVerifRepo.save(
      this.emailVerifRepo.create({
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress,
      }),
    );

    const frontendUrl =
      this.configService.get<string>('auth.frontendUrl') ||
      'http://localhost:9000';
    const verificationLink = `${frontendUrl}/verify-email?token=${rawToken}`;

    this.emailDispatcher.sendAsync({
      to: user.email,
      templateCode: 'EMAIL_VERIFICATION',
      userId: user.id,
      context: {
        user_name: user.name,
        verification_link: verificationLink,
        expiry_minutes: 1440,
      },
    });

    return {
      message: 'If an unverified account exists with that email, a verification link has been sent.',
    };
  }

  /**
   * 7. Forgot Password
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    meta: SessionMetadata,
  ): Promise<{ message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findOne({
      where: { email: normalizedEmail },
    });

    // Anti-enumeration
    if (!user) {
      return {
        message: 'If an account exists with that email, a password reset link has been dispatched.',
      };
    }

    const rawToken = this.tokenService.generateRandomToken(32);
    const tokenHash = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await this.pwdResetRepo.save(
      this.pwdResetRepo.create({
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: meta.ipAddress,
      }),
    );

    const frontendUrl =
      this.configService.get<string>('auth.frontendUrl') ||
      'http://localhost:9000';
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

    this.emailDispatcher.sendAsync({
      to: user.email,
      templateCode: 'PASSWORD_RESET',
      userId: user.id,
      context: {
        user_name: user.name,
        reset_link: resetLink,
        expiry_minutes: 30,
        device_name: meta.userAgent || meta.deviceId || 'Browser',
        ip_address: meta.ipAddress || 'Unknown',
      },
    });

    return {
      message: 'If an account exists with that email, a password reset link has been dispatched.',
    };
  }

  /**
   * 8. Reset Password
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = this.tokenService.hashToken(dto.token);

    const record = await this.pwdResetRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired password reset link.');
    }

    if (record.usedAt) {
      throw new BadRequestException('This reset link has already been used.');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Password reset link has expired. Please request a new one.');
    }

    // Hash new password
    const hashedPassword = await this.passwordService.hash(dto.password);

    // Update user password
    await this.userRepo.update(record.userId, {
      password: hashedPassword,
    });

    // Mark token as used
    record.usedAt = new Date();
    await this.pwdResetRepo.save(record);

    // REVOKE ALL SESSIONS for security
    await this.sessionService.revokeAllUserSessions(
      record.userId,
      'ADMIN_REVOKED',
    );

    return {
      message: 'Password reset successfully. All existing sessions were revoked. Please log in with your new password.',
    };
  }

  /**
   * 9. Get Current Authenticated User (Profile + Roles + Active Session)
   */
  async getMe(userId: string, sessionId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: [
        'role',
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
}
