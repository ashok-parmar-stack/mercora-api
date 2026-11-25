import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserEntity } from '../../../database/entities/user.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import { RoleEntity } from '../../../database/entities/role.entity';
import { EmailVerificationEntity } from '../../../database/entities/email-verification.entity';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { EmailDispatcherService } from '../../email/services/email-dispatcher.service';
import { RegisterDto } from '../dto/register.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ResendVerificationDto } from '../dto/resend-verification.dto';

@Injectable()
export class RegistrationVerificationService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(EmailVerificationEntity)
    private readonly emailVerifRepo: Repository<EmailVerificationEntity>,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly emailDispatcher: EmailDispatcherService,
    private readonly configService: ConfigService,
  ) {}

  async register(
    dto: RegisterDto,
    ipAddress?: string,
  ): Promise<{ message: string; email: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

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

    let defaultRole = await this.roleRepo.findOne({ where: { code: 'CUSTOMER' } });
    if (!defaultRole) {
      defaultRole = await this.roleRepo.findOne({ where: { code: 'VIEWER' } });
    }

    const hashedPassword = await this.passwordService.hash(dto.password);
    const savedUser = await this.userRepo.save(
      this.userRepo.create({
        name: dto.name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        statusId: pendingStatus.id,
        roleId: defaultRole ? defaultRole.id : undefined,
        isEmailVerified: false,
      }),
    );

    await this.issueAndDispatchVerification(savedUser, ipAddress);

    return {
      message: 'Registration successful. A verification link has been sent to your email.',
      email: savedUser.email,
    };
  }

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

    record.usedAt = new Date();
    await this.emailVerifRepo.save(record);

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

    await this.userRepo.update(record.userId, {
      isEmailVerified: true,
      statusId: activeStatus.id,
    });

    return { message: 'Email verified successfully! You may now sign in.' };
  }

  async resendVerification(
    dto: ResendVerificationDto,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    const genericMsg =
      'If an unverified account exists with that email, a verification link has been sent.';

    if (!user || user.isEmailVerified) {
      return { message: genericMsg };
    }

    await this.issueAndDispatchVerification(user, ipAddress);
    return { message: genericMsg };
  }

  private async issueAndDispatchVerification(
    user: UserEntity,
    ipAddress?: string,
  ): Promise<void> {
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
      this.configService.get<string>('auth.frontendUrl') || 'http://localhost:9000';
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
  }
}
