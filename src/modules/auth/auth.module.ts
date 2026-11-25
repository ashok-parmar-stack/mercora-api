import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

import { UserEntity } from '../../database/entities/user.entity';
import { StatusEntity } from '../../database/entities/status.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { SessionEntity } from '../../database/entities/session.entity';
import { EmailVerificationEntity } from '../../database/entities/email-verification.entity';
import { PasswordResetEntity } from '../../database/entities/password-reset.entity';

import { EmailModule } from '../email/email.module';

import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { RegistrationVerificationService } from './services/registration-verification.service';
import { PasswordRecoveryService } from './services/password-recovery.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { SessionService } from './services/session.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      StatusEntity,
      RoleEntity,
      SessionEntity,
      EmailVerificationEntity,
      PasswordResetEntity,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('auth.jwtAccessSecret'),
        signOptions: {
          expiresIn: (config.get<string>('auth.accessTokenExpiresIn') || '15m') as StringValue,
        },
      }),
    }),
    EmailModule,
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistrationVerificationService,
    PasswordRecoveryService,
    PasswordService,
    TokenService,
    SessionService,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [
    AuthService,
    SessionService,
    TokenService,
    PasswordService,
    JwtAuthGuard,
    JwtStrategy,
    PassportModule,
    JwtModule,
  ],
})
export class AuthModule {}
