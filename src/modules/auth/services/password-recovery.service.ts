import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserEntity } from '../../../database/entities/user.entity';
import { PasswordResetEntity } from '../../../database/entities/password-reset.entity';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { SessionMetadata, SessionService } from './session.service';
import { EmailDispatcherService } from '../../email/services/email-dispatcher.service';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

@Injectable()
export class PasswordRecoveryService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(PasswordResetEntity)
    private readonly pwdResetRepo: Repository<PasswordResetEntity>,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly emailDispatcher: EmailDispatcherService,
    private readonly configService: ConfigService,
  ) {}

  async forgotPassword(
    dto: ForgotPasswordDto,
    meta: SessionMetadata,
  ): Promise<{ message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    const genericMsg =
      'If an account exists with that email, a password reset link has been dispatched.';

    if (!user) {
      return { message: genericMsg };
    }

    const rawToken = this.tokenService.generateRandomToken(32);
    const tokenHash = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.pwdResetRepo.save(
      this.pwdResetRepo.create({
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: meta.ipAddress,
      }),
    );

    const frontendUrl =
      this.configService.get<string>('auth.frontendUrl') || 'http://localhost:9000';
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

    return { message: genericMsg };
  }

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

    const hashedPassword = await this.passwordService.hash(dto.password);
    await this.userRepo.update(record.userId, { password: hashedPassword });

    record.usedAt = new Date();
    await this.pwdResetRepo.save(record);

    await this.sessionService.revokeAllUserSessions(record.userId, 'ADMIN_REVOKED');

    return {
      message:
        'Password reset successfully. All existing sessions were revoked. Please log in with your new password.',
    };
  }
}
