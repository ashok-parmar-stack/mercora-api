import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ResendVerificationDto } from '../dto/resend-verification.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { SessionMetadata } from '../services/session.service';

@ApiTags('Authentication & Sessions')
@Controller('v1/auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private extractMetadata(req: Request): SessionMetadata {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '';
    const userAgent = req.headers['user-agent'] || '';
    const deviceId = (req.headers['x-device-id'] as string) || '';

    return { ipAddress, userAgent, deviceId };
  }

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Creates user in PENDING status and sends a dynamic verification email with secure one-time link.',
  })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const meta = this.extractMetadata(req);
    return this.authService.register(dto, meta.ipAddress);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User Login with Single Active Session Enforcement',
    description:
      'Authenticates user, atomically revokes any previous active session, creates a new session, and returns access + refresh tokens.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful. Previous device session invalidated.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({
    status: 403,
    description: 'Email verification required or account deactivated',
  })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const meta = this.extractMetadata(req);
    return this.authService.login(dto, meta);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh Access Token & Rotate Refresh Token',
    description:
      'Validates active refresh token, checks single active session constraint, and rotates refresh token.',
  })
  @ApiResponse({ status: 200, description: 'Tokens rotated successfully' })
  @ApiResponse({
    status: 401,
    description: 'Invalid, expired, or displaced session token',
  })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const meta = this.extractMetadata(req);
    return this.authService.refreshToken(dto, meta);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout current active session',
    description:
      'Revokes the callers active session record. The token can no longer be refreshed.',
  })
  @ApiResponse({ status: 200, description: 'Session terminated' })
  async logout(@CurrentUser() user: any) {
    return this.authService.logout(user.sessionId);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get Current Authenticated User Profile & Active Session Metadata',
  })
  @ApiResponse({ status: 200, description: 'User profile with active session' })
  async getMe(@CurrentUser() user: any) {
    return this.authService.getMe(user.id, user.sessionId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update Current Authenticated User Profile',
  })
  @ApiResponse({ status: 200, description: 'User profile updated' })
  async updateMe(
    @CurrentUser() user: any,
    @Body() body: { name?: string; phone?: string },
  ) {
    return this.authService.updateMe(user.id, body);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with one-time confirmation token' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link' })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
    @Req() req: Request,
  ) {
    const meta = this.extractMetadata(req);
    return this.authService.resendVerification(dto, meta.ipAddress);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const meta = this.extractMetadata(req);
    return this.authService.forgotPassword(dto, meta);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password and revoke all existing user sessions',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
