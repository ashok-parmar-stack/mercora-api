import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import * as crypto from 'crypto';

export interface JwtPayload {
  sub: string;
  sessionId: string;
  email: string;
  role?: string;
  companyId?: string;
  iat?: number;
  exp?: number;
}

export interface GeneratedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  expiresIn: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Generate access token and long-lived refresh token
   */
  async generateAuthTokens(
    userId: string,
    sessionId: string,
    email: string,
    roleCode?: string,
    companyId?: string,
  ): Promise<GeneratedTokens> {
    const payload: JwtPayload = {
      sub: userId,
      sessionId,
      email,
      role: roleCode,
      companyId,
    };

    const accessTokenExpiresIn = (
      this.configService.get<string>('auth.accessTokenExpiresIn') || '15m'
    ) as StringValue;

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessTokenExpiresIn,
    });

    const refreshToken = this.generateRandomToken(40);
    const refreshTokenHash = this.hashToken(refreshToken);

    return {
      accessToken,
      refreshToken,
      refreshTokenHash,
      expiresIn: accessTokenExpiresIn,
    };
  }

  /**
   * Cryptographically secure random token string
   */
  generateRandomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Deterministic SHA-256 hash for database token lookup
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Verify JWT access token signature and return decoded payload
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token);
  }
}
